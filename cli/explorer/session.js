// One repository, loaded into memory, the way the website loads it.
//
// This is the whole reason the terminal app can stand in for the site: it runs
// the *same* modules in the *same* order as `server/apiScan.js` — FileSource →
// scanRepo → detectManifest → computeFacts → buildSearchIndex — and then the
// same projections the browser's views are projections of (health, layers,
// patterns, security, stack, tour). Nothing here re-implements analysis, so the
// two surfaces cannot drift into telling different stories about one repo.
//
// Everything below the loader is pure data plus a few lookups. The loader is
// the only async part, and it is the only part that touches the filesystem.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { nodeFileSource } from '../../server/fileSourceNode.js';
import { buildSearchIndex } from '../../server/searchIndex.js';
import { searchDocuments } from '../../server/apiSearch.js';
import { expandHome, resolveInside } from '../../server/paths.js';
import { scanRepo } from '../../shared/analyzer/scan.js';
import { detectManifest } from '../../shared/analyzer/services.js';
import { computeFacts, roleOf } from '../../shared/analyzer/graph.js';
import { analyzeHealth } from '../../shared/analyzer/health.js';
import { computeLayers, detectPatterns, couplingMatrix } from '../../shared/analyzer/patterns.js';
import { summarizeSecurity } from '../../shared/analyzer/security.js';
import { analyzeStack } from '../../shared/analyzer/stack.js';
import { buildTourStops } from '../../shared/analyzer/tour.js';
import { explainFile, explainFolder, explainOverview } from '../../shared/analyzer/explainLocal.js';
import { languageLabel } from '../../shared/analyzer/languages/index.js';

// Scan a directory and return the loaded repo, or throw an Error whose message
// is safe to print straight to the user. `target` may be `~`, a relative path,
// or anything `expandHome` understands; it defaults to the current directory.
export async function openRepo(target = '.', { onProgress } = {}) {
  const root = expandHome(String(target || '.'));
  const stat = await fs.stat(root).catch(() => null);
  if (!stat) throw new Error('No such folder: ' + root);
  if (!stat.isDirectory()) throw new Error('Not a folder: ' + root);

  const source = nodeFileSource(root);
  const scan = await scanRepo(source, { onProgress });
  const manifest = await detectManifest(source);
  const facts = computeFacts(scan, manifest);
  const searchIndex = await buildSearchIndex(source, scan.files.map((f) => f.path));

  // The layers projection is an input to patterns, not a parallel view of the
  // same thing — `detectPatterns` reads the layer depths to place a file in the
  // architecture. Compute once, share. The coupling matrix is the same kind of
  // thing: a projection of `facts.folderEdges` that both the site and the
  // terminal's heat grid read, so it is computed once here rather than per view.
  const layers = computeLayers(scan, facts);

  return {
    root,
    name: scan.name || path.basename(root),
    scan,
    facts,
    manifest,
    searchIndex,
    layers,
    coupling: couplingMatrix(scan, facts),
    health: analyzeHealth(scan, facts),
    patterns: detectPatterns(scan, facts, manifest, layers),
    security: summarizeSecurity(scan),
    stack: analyzeStack(manifest, scan.stats.languages || {}),
    tour: buildTourStops(scan, facts),
    languages: languageRows(scan),
  };
}

// LOC per language, biggest first, with the display label the site uses — so
// `JavaScript` here and `JavaScript` there are the same string.
function languageRows(scan) {
  return Object.entries(scan.stats.languages || {})
    .map(([id, loc]) => ({ id, loc, label: languageLabel(id) }))
    .sort((a, b) => b.loc - a.loc || a.label.localeCompare(b.label));
}

// The one place a typed path becomes a real file. People type `logger.js`, not
// `server/logger.js`, and a tool that says "no such file" for a file that is
// right there is worse than no tool. So: exact, then folder, then suffix, then
// basename, then a substring. Ambiguity is reported with the candidates rather
// than guessed at — silently picking the wrong `index.js` is the failure mode
// that makes people stop trusting a map.
export function resolveTarget(repo, typed) {
  const raw = String(typed || '').trim().replace(/^\.\//, '');
  if (!raw) return { error: 'Name a file or folder.' };

  // `.` and `./` are the root, which is a real folder and a common thing to type
  // (`tree .`, `explain .`). Without this they fell through to the substring
  // match and offered eight unrelated files as "did you mean", which is worse
  // than useless — it is actively misleading. The root folder's path is `''`.
  if (raw === '.' || raw === './') return { folder: ROOT_FOLDER };

  const files = repo.scan.files;
  if (!repo.byPath) repo.byPath = new Map(files.map((f) => [f.path, f]));
  if (repo.byPath.has(raw)) return { file: repo.byPath.get(raw) };

  const folder = folderFor(repo, raw);
  if (folder) return { folder };

  const lower = raw.toLowerCase();
  const suffix = files.filter((f) => f.path.endsWith('/' + raw));
  if (suffix.length === 1) return { file: suffix[0] };
  if (suffix.length > 1) return { error: 'Which one?', candidates: suffix.map((f) => f.path) };

  const base = files.filter((f) => f.name.toLowerCase() === lower);
  if (base.length === 1) return { file: base[0] };
  if (base.length > 1) return { error: 'Which one?', candidates: base.map((f) => f.path) };

  const loose = files.filter((f) => f.path.toLowerCase().includes(lower));
  if (loose.length) {
    loose.sort((a, b) => a.path.length - b.path.length);
    return { error: 'No exact match. Did you mean:', candidates: loose.slice(0, 8).map((f) => f.path) };
  }
  return { error: 'Nothing in this repo matches "' + raw + '".' };
}

// The root folder is a real answer, not a sentinel: `tree .` and `explain .`
// both need one, and it carries the same fields `resolveTarget` returns for any
// other folder so the callers need no special case.
const ROOT_FOLDER = Object.freeze({ name: '', path: '', loc: 0, comment: 0, blank: 0, size: 0, langs: {} });

function folderFor(repo, typed) {
  const clean = typed.replace(/\/+$/, '');
  if (clean === '') return ROOT_FOLDER;
  const exact = repo.scan.folders.find((d) => d.path === clean);
  if (exact) return exact;
  const matches = repo.scan.folders.filter((d) => d.path.endsWith('/' + clean) || d.name === clean);
  return matches.length === 1 ? matches[0] : null;
}

// Read a file through the same containment check the HTTP route uses. A tool
// whose job is showing you one repository has no business reading any path on
// the machine, and going through `resolveInside` means there is no second,
// looser door to get there.
export async function readRepoFile(repo, repoPath) {
  const abs = resolveInside(repo.root, repoPath);
  if (!abs) throw new Error('That path is outside the repository.');
  return fs.readFile(abs, 'utf8');
}

// The website's search, verbatim: same TF-IDF ranking, same query language
// (`ext:`, `path:`, `-exclude`, `"phrases"`, `/regex/`), same result shape. A
// query that works in one surface works in the other, because it is the same
// function.
export function searchRepo(repo, query, { limit = 12 } = {}) {
  return searchDocuments(repo.searchIndex, query, { limit });
}

// A number a person typed, or nothing. `show f 1.5 2.5` used to print
// `1.5–3 of 344`: `Number('1.5')` passed the `|| 1` fallback, the label
// interpolated the fraction, and only `slice()` coerced it. A line range is
// either a whole number of lines or it is a mistake, and a mistake gets a
// message rather than a wrong heading.
export function lineNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function explainRepoFile(repo, file) {
  return explainFile(file.path, file, repo.facts);
}

export function explainRepoFolder(repo, folder) {
  return explainFolder(folder.path, repo.scan, repo.facts);
}

export function explainRepoOverview(repo) {
  return explainOverview(repo.scan, repo.facts, repo.manifest);
}

// Short facts about a file, in the order `docs.js` states them, so the terminal
// and the generated docs never describe the same file differently.
export function fileFacts(repo, file) {
  return {
    role: roleOf(file.path, repo.facts),
    loc: file.loc || 0,
    complexity: file.complexity || 0,
    fanIn: repo.facts.fanIn[file.path] || 0,
    fanOut: repo.facts.fanOut[file.path] || 0,
    inCycle: (repo.facts.inCycle || []).includes(file.path),
    findings: (file.findings || []).length,
  };
}
