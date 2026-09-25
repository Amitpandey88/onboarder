// The views: the website's screens, drawn as text.
//
// Every function here is pure — `(repo, args) => string` — and none of them
// print. That is what makes the terminal app testable: the tests assert on the
// strings, with no TTY, no readline, and no process to spawn. The app layer
// decides where they go.
//
// The drawing primitives are the same ones the CLI banner and the server's
// startup line already use (`server/layout.js` for geometry, `cli/ui.js` for
// color), so a panel here is fitted and elided to the terminal exactly the way
// every other panel in this project is, including after a resize.

import { bold, cyan, dim, ok, warn, bad, panel, row, fit, termWidth } from '../ui.js';
import { fileFacts, readRepoFile, resolveTarget, searchRepo, explainRepoFile, explainRepoFolder, explainRepoOverview } from './session.js';
import { scanCaveats } from '../../shared/analyzer/explainLocal.js';

const MAX = 200; // a ceiling on any list, so one command cannot flood a terminal

// Glyphs degrade for terminals that cannot show them. TUIKit's rule: a missing
// glyph is a rendering bug the user should never have to report, so the ASCII
// set is a first-class path, not a fallback we hope nobody needs.
const GLYPHS = process.platform === 'win32' && !process.env.WT_SESSION
  ? { dir: '+', file: '-', entry: '>', hub: '*', arrow: '->', warn: '!', good: '+' }
  : { dir: '▸', file: '·', entry: '▶', hub: '◆', arrow: '→', warn: '⚠', good: '✓' };

// The footer is a hint bar, and a hint bar that wraps is worse than no hint bar
// — it is the first thing printed, so it sets the impression of everything else.
// On a narrow terminal it drops hints rather than wrapping.
function hintBar(hints) {
  const room = Math.max(8, termWidth() - 2);
  const parts = [];
  for (const h of hints) {
    const next = parts.length ? parts.join(' · ') + ' · ' + h : h;
    if (next.length > room) break;
    parts.push(h);
  }
  const line = parts.join(' · ') || hints[0].slice(0, room);
  return dim('  ' + line);
}

// Word-wrap plain text to the terminal, preserving the indent on continuation
// lines. Applied *before* painting, so the wrap never has to understand ANSI —
// the styled string is built from already-wrapped plain text.
//
// This is what keeps a long caveat or a paragraph of explanation from running
// off the right edge. The engine's own messages are written as sentences for a
// browser panel; a terminal needs them folded.
function wrapText(text, indent = '  ', room = termWidth() - indent.length) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!line) {
        line = word;
      } else if (line.length + 1 + word.length <= room) {
        line += ' ' + word;
      } else {
        out.push(indent + line);
        line = word;
      }
      // A single word longer than the room is hard-split rather than allowed to
      // overflow — a long import specifier is exactly the case that shows up.
      while (line.length > room) {
        out.push(indent + line.slice(0, room));
        line = line.slice(room);
      }
    }
    out.push(indent + line);
  }
  return out.join('\n');
}

// -------------------------------------------------------------- overview ---

// The landing view. Answers "what am I looking at, and where do I start" in one
// screen — the same three questions the site's first paint answers.
export function overview(repo) {
  const s = repo.scan.stats;
  const h = repo.health;
  const langs = repo.languages.slice(0, 4).map((l) => `${l.label} ${l.loc}`).join(', ')
    + (repo.languages.length > 4 ? `, +${repo.languages.length - 4} more` : '');

  const rows = [
    row('folder', repo.root),
    row('files', `${s.filesParsed} parsed` + (s.skipped ? dim(`  (${s.skipped} skipped)`) : '') + `  ·  ${s.edgeCount} imports`),
    row('languages', langs || '—'),
  ];
  if (repo.manifest.packageName) rows.push(row('package', repo.manifest.packageName));
  rows.push(row('license', repo.scan.license?.name || 'unknown'));
  if (repo.facts.entries.length) rows.push(row('start at', repo.facts.entries.slice(0, 3).join(', ')));
  if (repo.facts.hubs.length) {
    const top = repo.facts.hubs[0];
    rows.push(row('top hub', `${top.path}  ${dim(`(${top.fanIn} files)`)}`));
  }
  rows.push(row('health', gradeColor(h.grade) + dim('   score ') + `${h.score}/100`));

  const notes = scanCaveats(repo.scan);
  const out = [panel(repo.name, rows)];
  if (notes.length) out.push(dim(wrapText(notes.join('\n'))));
  out.push(hintBar(['tour explains it', 'tree lists it', 'find searches it', 'help lists everything']));
  return out.join('\n');
}

function gradeColor(grade) {
  if (grade === 'A' || grade === 'B') return ok(grade);
  if (grade === 'C') return warn(grade);
  return bad(grade);
}

// ------------------------------------------------------------------ tree ---

// The file tree. Directories first, then files, each marked with the role that
// makes it worth noticing — an entry point or a hub is the two things a new
// reader is looking for, and marking them here saves a separate `hubs` command
// on every repo.
export function tree(repo, { sub = '', depth = 2, limit = MAX } = {}) {
  const files = repo.scan.files;
  const prefix = String(sub || '').replace(/^\/+|\/+$/g, '');
  const scoped = prefix ? files.filter((f) => f.path.startsWith(prefix + '/')) : files;
  if (!scoped.length) return dim(`  Nothing under ${prefix || 'the root'}.`);

  const root = { name: prefix || repo.name, path: prefix, dirs: new Map(), files: [] };
  for (const f of scoped) {
    const rel = prefix ? f.path.slice(prefix.length + 1) : f.path;
    const parts = rel.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      if (!node.dirs.has(name)) {
        node.dirs.set(name, {
          name,
          path: node.path ? `${node.path}/${name}` : name,
          dirs: new Map(),
          files: [],
        });
      }
      node = node.dirs.get(name);
    }
    node.files.push(f);
  }

  const lines = [];
  let budget = Math.min(Number(limit) || MAX, MAX);
  const walk = (node, depthLeft, indent) => {
    for (const child of [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      if (budget <= 0) return;
      const room = Math.max(8, termWidth() - indent.length - 12);
      lines.push(indent + dim(GLYPHS.dir + ' ') + cyan(fit(child.name, room)) + dim(`  ${countUnder(child)}`));
      budget--;
      if (depthLeft > 1) walk(child, depthLeft - 1, indent + '  ');
    }
    for (const f of node.files) {
      if (budget <= 0) return;
      lines.push(indent + fileLine(repo, f));
      budget--;
    }
  };
  walk(root, Math.max(1, Number(depth) || 2), '  ');

  const out = [bold('  tree · ' + (prefix || '.')) + dim(`  ${scoped.length} files, depth ${Math.max(1, Number(depth) || 2)}`), lines.join('\n')];
  if (budget <= 0) out.push(dim('  … list stopped early — tree <folder> <depth> to go deeper'));
  return out.join('\n');
}

function fileLine(repo, f) {
  const role = fileFacts(repo, f).role;
  const badge = role === 'entry' ? ok(GLYPHS.entry) : role === 'hub' ? warn(GLYPHS.hub) : dim(GLYPHS.file);
  const room = Math.max(10, termWidth() - 22);
  return badge + ' ' + fit(f.name, room) + '  ' + dim(String(f.ext || '').padEnd(6)) + dim(String(f.loc || 0).padStart(5));
}

function countUnder(node) {
  let n = node.files.length;
  for (const d of node.dirs.values()) n += countUnder(d);
  return n;
}

// ------------------------------------------------------------------ find ---

// Search, using the site's query language. The result rows carry the same three
// things the site's palette shows — path, line, snippet — fitted to the
// terminal, with the path keeping the room it needs because it is what
// identifies the hit.
export function find(repo, { query = '', limit = 12 } = {}) {
  if (!String(query).trim()) {
    return dim('  Try: find resolveImport   ·   find ext:rs -test   ·   find "exact phrase"   ·   find /regex/');
  }
  const res = searchRepo(repo, query, { limit: Math.min(Number(limit) || 12, MAX) });
  if (res.error) return bad('  ' + res.error);
  if (!res.results.length) return dim(`  No match for "${query}" in ${res.indexed} indexed files.`);

  const w = termWidth();
  const pathRoom = Math.max(16, Math.min(46, Math.floor(w * 0.42)));
  const lines = res.results.map((r) => {
    const snippetRoom = w - pathRoom - 18;
    const snip = snippetRoom > 10 ? dim('  ' + fit(r.snippet, snippetRoom, { tail: false })) : '';
    return '  ' + fit(r.path, pathRoom) + dim(String(r.line).padStart(5)) + '  ' + snip;
  });
  const kind = res.advanced ? 'filtered query' : 'query';
  const head = dim(`  ${res.total} match${res.total === 1 ? '' : 'es'} (${kind}) across ${res.indexed} indexed files`);
  return [head, ...lines, hintBar(['show <path> to read one', 'deps <path> to trace it'])].join('\n');
}

// ------------------------------------------------------------------ show ---

// Read a file in the terminal. This is the one view that cannot be pure — it
// touches the disk — so it is the one async view, and it goes through the same
// containment check the HTTP route uses rather than reaching for a path itself.
export async function show(repo, { target = '', from = 0, count = 0 } = {}) {
  const found = resolveTarget(repo, target);
  if (found.error) return targetError(found);
  if (found.folder) return dim(`  ${found.folder.path} is a folder — tree ${found.folder.path} 2, or explain ${found.folder.path}`);

  const file = found.file;
  const text = await readRepoFile(repo, file.path);
  const lines = text.split('\n');
  const start = Math.max(1, Number(from) || 1);
  const room = count > 0 ? Math.min(Number(count), 400) : Math.min(lines.length, 40);
  const end = Math.min(lines.length, start + room - 1);

  const gutter = String(end).length;
  const body = lines.slice(start - 1, end).map((line, i) => {
    const n = String(start + i).padStart(gutter);
    return dim(n + ' ') + fit(line.replace(/\t/g, '  '), Math.max(20, termWidth() - gutter - 3), { tail: false });
  });

  const f = fileFacts(repo, file);
  const head = panel(file.path, [
    { label: 'role', value: f.role },
    { label: 'size', value: `${f.loc} loc` + (f.complexity ? `  ·  complexity ${f.complexity}` : '') },
    { label: 'graph', value: `${f.fanIn} in  ${f.fanOut} out` + (f.inCycle ? '  ' + bad('in a cycle') : '') },
  ]);
  const shown = `${start}–${end} of ${lines.length}`;
  return [head, dim(`  ${shown}`), ...body, hintBar([`deps ${file.name} for connections`, `explain ${file.name} in prose`])].join('\n');
}

// Render a resolver miss the same way everywhere: the reason, then the
// candidates. A "did you mean" is only useful if it is actionable.
export function targetError(found) {
  const lines = [bad('  ' + found.error)];
  if (found.candidates) {
    for (const c of found.candidates) lines.push('    ' + cyan(c));
    lines.push(dim('    show <one of these>'));
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------ deps ---

// What a file connects to, in both directions, plus the verdict the graph has
// on it. The two lists are the point: "what does this pull in" and "what breaks
// if this breaks" are different questions and a single edge count answers
// neither.
export function deps(repo, { target = '', limit = 15 } = {}) {
  const found = resolveTarget(repo, target);
  if (found.error) return targetError(found);
  if (found.folder) return dim(`  ${found.folder.path} is a folder — try a file inside it.`);

  const p = found.file.path;
  const imports = (repo.facts.importsOf[p] || []).slice(0, limit);
  const importers = (repo.facts.importers[p] || []).slice(0, limit);
  const f = fileFacts(repo, found.file);
  const w = termWidth();

  const head = [panel(found.file.path, [
    { label: 'role', value: f.role },
    { label: 'dependents', value: `${f.fanIn} file${f.fanIn === 1 ? '' : 's'} import this` },
    { label: 'imports', value: `${f.fanOut} file${f.fanOut === 1 ? '' : 's'} pulled in` },
  ])];
  if (f.inCycle) head.push(bad('  ' + GLYPHS.warn + ' part of a circular import — refactoring here ripples'));

  const list = (title, items) => {
    if (!items.length) return dim(`  ${title}: none`);
    return [dim(`  ${title}:`), ...items.map((x) => '    ' + cyan(fit(x, w - 6)))].join('\n');
  };
  return [...head, list('imports', imports), list('imported by', importers)].join('\n');
}

// --------------------------------------------------------------- explain ---

// The prose explanation, straight from `explainLocal.js` — the same notes the
// site shows when no AI key is configured, with no key required and nothing
// sent anywhere. Markdown backticks are the one bit of markup kept, turned into
// terminal emphasis.
export function explain(repo, { target = '' } = {}) {
  if (!String(target).trim()) return renderProse(explainRepoOverview(repo));
  const found = resolveTarget(repo, target);
  if (found.error) return targetError(found);
  if (found.folder) return renderProse(explainRepoFolder(repo, found.folder));
  return renderProse(explainRepoFile(repo, found.file));
}

// `**bold**` and `` `code` `` are the only two marks `explainLocal` emits. They
// become terminal styling; everything else passes through untouched, so the
// prose still reads correctly with color off. Wrapping happens on the plain
// text first, then the marks are styled in place — styling after wrapping keeps
// the wrap from having to measure escape sequences.
function renderProse(md) {
  return String(md)
    .split('\n\n')
    .map((para) => {
      const styled = para
        .replace(/`([^`]+)`/g, (_, c) => '\u0000' + c + '\u0000')
        .replace(/\*\*([^*]+)\*\*/g, (_, c) => '\u0001' + c + '\u0001');
      return wrapText(styled)
        .replace(/\u0000([^\u0000]+)\u0000/g, (_, c) => cyan(c))
        .replace(/\u0001([^\u0001]+)\u0001/g, (_, c) => bold(c));
    })
    .join('\n\n');
}

// ------------------------------------------------------------------ tour ---

// The guided read. The same eight stops the site and the MCP server hand out,
// in the same order, with the same one-line reason for each — a person at the
// prompt and an agent asking the MCP server are being told the same thing about
// the same repository.
export function tour(repo) {
  if (!repo.tour.length) return dim('  No tour stops found — is this a code repository?');
  const lines = repo.tour.map((stop, i) => {
    const n = dim(String(i + 1).padStart(2) + '.');
    const head = n + ' ' + cyan(fit(stop.path, Math.max(20, Math.floor(termWidth() * 0.45))));
    return [head, dim(wrapText(stop.why, '    '))].join('\n');
  });
  return [bold('  reading order'), ...lines, hintBar(['show <path> to read one'])].join('\n');
}

// ---------------------------------------------------------------- health ---

// The health report. The grade leads because that is the question; the
// breakdown follows because a letter with no reasons is not actionable.
export function health(repo) {
  const h = repo.health;
  const rows = [
    { label: 'grade', value: gradeColor(h.grade) + dim(`   score ${h.score}/100`) },
    { label: 'debt', value: `${h.totals.crit} critical · ${h.totals.high} high findings` },
    { label: 'complexity', value: `avg ${h.totals.avgCx} per file` },
    { label: 'orphans', value: `${Math.round(h.totals.orphanRatio * 100)}% of files import nothing` },
    { label: 'cycles', value: String(h.totals.cycles) },
  ];
  if (h.effortHours) rows.push({ label: 'effort', value: `~${h.effortHours}h to address (${h.debtCategory})` });

  const risky = [...(h.perFile || [])]
    .filter((f) => (f.risk || 0) > 0)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 8);
  const out = [panel('health', rows)];
  if (risky.length) {
    out.push(dim('  riskiest files:'));
    for (const f of risky) {
      // Risk is an integer 0–100; printing "58.00" would imply a precision the
      // number does not have.
      const risk = Number(f.risk);
      out.push('    ' + warn(GLYPHS.warn + ' ') + cyan(fit(f.path, Math.max(20, termWidth() - 40)))
        + dim(`  risk ${risk}${f.blast !== undefined ? `  blast ${f.blast}` : ''}`));
    }
  }
  if (h.breakdown?.length) {
    // The breakdown is the score itemized — each entry is what a factor cost.
    // Showing the label without the points would explain the grade without
    // showing the arithmetic, which is the part that makes it actionable.
    out.push(dim('  what moved the score:'));
    for (const b of h.breakdown) {
      const pts = bad(String(b.points));
      const room = Math.max(12, termWidth() - 10);
      out.push('    ' + dim('· ') + fit(b.label, room) + '  ' + pts);
    }
  }
  return out.join('\n');
}

// ------------------------------------------------------------------ hubs ---

// The load-bearing files: the ones everything else reaches for. Ranked, because
// "which file is load-bearing" only has an answer as an ordering.
export function hubs(repo, { limit = 12 } = {}) {
  const list = repo.facts.hubs.slice(0, Math.min(Number(limit) || 12, MAX));
  if (!list.length) return dim('  No hubs — nothing here is imported by two or more files.');
  const w = termWidth();
  const top = list[0].fanIn || 1;
  const barRoom = Math.max(0, Math.min(24, w - 46));
  return [bold('  most depended-on files'), ...list.map((h) => {
    const bar = barRoom > 4 ? dim('  ' + '█'.repeat(Math.max(1, Math.round((h.fanIn / top) * barRoom)))) : '';
    return '  ' + cyan(fit(h.path, Math.max(20, w - 12 - barRoom))) + dim(`  ${h.fanIn} in / ${h.fanOut} out`) + bar;
  })].join('\n');
}

// ---------------------------------------------------------------- layers ---

// Import depth, shallowest first. This is the architecture as a staircase:
// layer 0 is what runs, and each step down is something it can reach.
export function layers(repo, { limit = 12 } = {}) {
  const ls = repo.layers.layers;
  if (!ls.length) return dim('  No layers — no import chain starts anywhere we recognize.');
  const out = [bold('  import depth')];
  ls.slice(0, Math.min(Number(limit) || 12, 40)).forEach((files, i) => {
    const shown = files.slice(0, 3).join(', ');
    const more = files.length > 3 ? dim(`  +${files.length - 3} more`) : '';
    const room = Math.max(12, termWidth() - String(i).length - 14 - (more ? String(more.length + 2) : 0));
    out.push(dim(`  layer ${i} (${files.length}) `) + cyan(fit(shown, room)) + more);
  });
  if (repo.layers.unreachable.length) {
    out.push(dim(wrapText(`${repo.layers.unreachable.length} files are not reachable from any entry point`)));
  }
  return out.join('\n');
}

// -------------------------------------------------------------- patterns ---

// The architecture, in prose. These are the observations `detectPatterns`
// makes, in the order a senior dev would mention them.
export function patterns(repo) {
  if (!repo.patterns.length) return dim('  No patterns stood out.');
  const out = [bold('  what this codebase looks like')];
  for (const p of repo.patterns) {
    const mark = p.tone === 'good' ? ok(GLYPHS.good) : p.tone === 'warn' ? bad(GLYPHS.warn) : warn('·');
    out.push('  ' + mark + ' ' + bold(p.title));
    out.push(dim(wrapText(p.detail, '    ')));
    if (p.paths?.length) {
      out.push(dim('    ' + fit(p.paths.slice(0, 4).join('  '), Math.max(10, termWidth() - 4))));
    }
  }
  return out.join('\n');
}

// ----------------------------------------------------------------- stats ---

// The numbers, grouped by the question each answers: what is it made of, where
// is the bulk of it, and what is the heaviest thing in it.
export function stats(repo, { limit = 10 } = {}) {
  const n = Math.min(Number(limit) || 10, MAX);
  const s = repo.scan.stats;
  const top = [...repo.scan.files].sort((a, b) => (b.loc || 0) - (a.loc || 0)).slice(0, n);
  const folders = [...repo.scan.folders].sort((a, b) => (b.loc || 0) - (a.loc || 0)).slice(0, n);
  const cx = [...repo.scan.files].filter((f) => f.complexity > 0).sort((a, b) => b.complexity - a.complexity).slice(0, 5);

  const totalLoc = repo.languages.reduce((s2, l) => s2 + l.loc, 0);
  const out = [panel('stats', [
    { label: 'files', value: `${s.filesParsed} parsed of ${s.filesTotal} seen` },
    { label: 'lines', value: `${totalLoc} code` + (s.truncated ? warn(`  (partial scan)`) : '') },
    { label: 'imports', value: `${s.edgeCount} resolved` + (s.imports?.total ? dim(`  ${s.imports.confidence}% placed`) : '') },
    { label: 'tests', value: `${repo.facts.testCoverage.ratio}% of non-test files are covered by a test import` },
  ])];

  out.push(bold('  languages'));
  for (const l of repo.languages.slice(0, 8)) {
    out.push('    ' + cyan(l.label.padEnd(14)) + dim(String(l.loc).padStart(7)));
  }
  if (folders.length) {
    out.push(bold('  biggest folders (loc)'));
    for (const d of folders) out.push('    ' + cyan(fit(d.path, 34).padEnd(34)) + dim(String(d.loc).padStart(7)));
  }
  if (top.length) {
    out.push(bold('  biggest files (loc)'));
    for (const f of top) out.push('    ' + cyan(fit(f.path, 34).padEnd(34)) + dim(String(f.loc).padStart(7)));
  }
  if (cx.length) {
    out.push(bold('  most complex'));
    for (const f of cx) out.push('    ' + cyan(fit(f.path, 34).padEnd(34)) + dim(String(f.complexity).padStart(7)));
  }
  return out.join('\n');
}

// -------------------------------------------------------------- security ---

export function security(repo, { limit = 12 } = {}) {
  const sec = repo.security;
  if (!sec.total) return ok('  No findings from the built-in rules.');
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const counts = order.filter((k) => sec.counts[k]).map((k) => `${sec.counts[k]} ${k}`).join(' · ');
  const out = [panel('security', [
    { label: 'grade', value: gradeColor(sec.grade) + dim(`   score ${sec.score}/100`) },
    { label: 'findings', value: counts },
  ])];
  for (const f of sec.files.slice(0, Math.min(Number(limit) || 12, MAX))) {
    out.push('    ' + (f.worst === 'critical' || f.worst === 'high' ? bad : warn)(GLYPHS.warn + ' ')
      + cyan(fit(f.path, Math.max(20, termWidth() - 34))) + dim(`  ${f.count} · worst ${f.worst}`));
  }
  out.push(dim(wrapText('Pattern-based heuristics only — not a substitute for a real audit.')));
  return out.join('\n');
}

// ----------------------------------------------------------------- stack ---

// The dependency picture the site shows, from the same `analyzeStack`.
export function stack(repo, { limit = 20 } = {}) {
  const st = repo.stack;
  if (!st.items.length) return dim(wrapText('No recognized dependencies (no package manifest found?).'));
  const out = [bold('  stack') + dim(`  ${st.pm.join(', ') || 'no package manager'}`)];
  for (const it of st.items.slice(0, Math.min(Number(limit) || 20, MAX))) {
    const v = it.version ? dim(' ' + it.version) : '';
    out.push('    ' + cyan(it.name.padEnd(28)) + dim(String(it.category).padEnd(12)) + v + (it.dev ? dim(' dev') : ''));
  }
  return out.join('\n');
}

// ----------------------------------------------------------------- entry ---

export function entry(repo) {
  if (!repo.facts.entries.length) {
    return dim('  No entry points recognized. tour falls back to the most depended-on files.');
  }
  return [bold('  entry points'), ...repo.facts.entries.map((p) => {
    const out = repo.facts.fanOut[p] || 0;
    return '    ' + ok(GLYPHS.entry + ' ') + cyan(fit(p, Math.max(20, termWidth() - 24))) + dim(`  reaches ${out} files`);
  })].join('\n');
}

// ------------------------------------------------------------- externals ---

// Outside packages, and who pulls them in. Dependency drift is the useful part:
// declared-but-unused and used-but-undeclared are the two lists a dependency
// audit actually acts on.
export function externals(repo) {
  const ext = repo.scan.externals || [];
  if (!ext.length) return dim('  No external imports found.');
  const sorted = [...ext].sort((a, b) => (b.usedBy?.length || 0) - (a.usedBy?.length || 0));
  const out = [bold('  external packages')];
  for (const x of sorted.slice(0, 30)) {
    out.push('    ' + cyan(String(x.name).padEnd(28)) + dim(`${x.usedBy?.length || 0} files`));
  }
  const drift = repo.facts.depsDrift;
  if (drift?.undeclaredImported?.length) {
    out.push(bold('  imported but not declared'));
    out.push(wrapText(drift.undeclaredImported.join(', '), '    ').split('\n').map(warn).join('\n'));
  }
  if (drift?.unusedDeclared?.length) {
    out.push(bold('  declared but never imported'));
    out.push(dim(wrapText(drift.unusedDeclared.join(', '), '    ')));
  }
  return out.join('\n');
}

// ----------------------------------------------------------------- about ---

// Which binary is answering. When the terminal and the website disagree, this
// is the first thing to ask.
export function about(repo, version = '') {
  return panel('onboarder', [
    { label: 'version', value: version },
    { label: 'repo', value: repo.root },
    { label: 'indexed', value: `${repo.searchIndex?.totalDocs ?? 0} files for find` },
    { label: 'scanned', value: repo.scan.scannedAt },
  ]);
}
