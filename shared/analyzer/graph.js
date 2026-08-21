// Graph facts: entry points, hubs, orphans, cycles, fan-in/fan-out.
// Pure functions over the scan result — no I/O here.

import { topFolderOf } from './pathUtil.js';

const ENTRY_NAMES = new Set([
  'index', 'main', 'app', 'server', 'cli', 'manage', 'mod', '__main__',
  'run', 'start', 'cmd',
]);

const TEST_RE = /(^|[._-])(test|spec|tests|__tests__)([._-]|\/|$)/i;

export function computeFacts(scan, manifest = {}) {
  const { files, edges } = scan;
  const fanIn = new Map();
  const fanOut = new Map();
  const importers = new Map();
  const importsOf = new Map();

  for (const f of files) {
    fanIn.set(f.path, 0);
    fanOut.set(f.path, 0);
    importers.set(f.path, []);
    importsOf.set(f.path, []);
  }
  for (const e of edges) {
    if (!fanIn.has(e.to) || !fanOut.has(e.from)) continue;
    fanIn.set(e.to, fanIn.get(e.to) + 1);
    fanOut.set(e.from, fanOut.get(e.from) + 1);
    importers.get(e.to).push(e.from);
    importsOf.get(e.from).push(e.to);
  }

  const entrySet = new Set();
  for (const f of files) {
    const stem = f.name.replace(/\.[^.]+$/, '');
    if (ENTRY_NAMES.has(stem) || f.hasMain) entrySet.add(f.path);
  }
  for (const p of manifest.entryPoints || []) entrySet.add(p);

  // Tarjan is the most expensive thing in this function, and one run answers
  // both questions asked of it: which files sit in a cycle, and what the
  // largest cycles are. It used to run twice on identical input.
  const sccs = stronglyConnected(files.map((f) => f.path), edges);
  const multi = sccs.filter((scc) => scc.length > 1);

  const inCycle = new Set();
  for (const scc of multi) for (const p of scc) inCycle.add(p);

  const entries = files
    .filter((f) => entrySet.has(f.path))
    .map((f) => f.path)
    .sort();

  const hubs = files
    .map((f) => ({ path: f.path, fanIn: fanIn.get(f.path) || 0, fanOut: fanOut.get(f.path) || 0 }))
    .filter((h) => h.fanIn >= 3)
    .sort((a, b) => b.fanIn - a.fanIn);

  const orphans = files
    .filter((f) => (fanIn.get(f.path) || 0) === 0 && !entrySet.has(f.path) && !TEST_RE.test(f.path))
    .map((f) => f.path)
    .sort();

  const cycles = multi
    .slice()
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);

  // Collect all imported symbols per target file
  const importedSymbolsByTarget = new Map();
  const wildcards = new Set();
  for (const e of edges) {
    if (!e.to) continue;
    if (!importedSymbolsByTarget.has(e.to)) importedSymbolsByTarget.set(e.to, new Set());
    const set = importedSymbolsByTarget.get(e.to);
    if (!e.symbols || !e.symbols.length || e.symbols.includes('*')) {
      wildcards.add(e.to);
    } else {
      for (const s of e.symbols) set.add(s);
    }
  }

  const deadExports = [];
  for (const f of files) {
    if (!f.exports || !f.exports.length) continue;
    if (entrySet.has(f.path) || TEST_RE.test(f.path) || wildcards.has(f.path)) continue;
    const importedSet = importedSymbolsByTarget.get(f.path);
    if (!importedSet || importedSet.size === 0) {
      for (const exp of f.exports) {
        deadExports.push({ file: f.path, name: exp.name, kind: exp.kind });
      }
    } else {
      for (const exp of f.exports) {
        if (!importedSet.has(exp.name) && exp.name !== 'default') {
          deadExports.push({ file: f.path, name: exp.name, kind: exp.kind });
        }
      }
    }
  }

  // Test coverage & untested hubs
  const testFiles = files.filter((f) => TEST_RE.test(f.path));
  const testedSet = new Set();
  const testQueue = [];
  for (const tf of testFiles) {
    for (const target of importsOf.get(tf.path) || []) {
      if (!TEST_RE.test(target) && !testedSet.has(target)) {
        testedSet.add(target);
        testQueue.push(target);
      }
    }
  }
  let hop = 0;
  while (testQueue.length && hop < 500) {
    hop++;
    const curr = testQueue.shift();
    for (const next of importsOf.get(curr) || []) {
      if (!TEST_RE.test(next) && !testedSet.has(next)) {
        testedSet.add(next);
        testQueue.push(next);
      }
    }
  }
  const nonTestFiles = files.filter((f) => !TEST_RE.test(f.path));
  const untestedHubs = hubs.filter((h) => !TEST_RE.test(h.path) && !testedSet.has(h.path));
  const testCoverage = {
    testedCount: testedSet.size,
    totalNonTest: nonTestFiles.length,
    ratio: nonTestFiles.length ? Math.round((testedSet.size / nonTestFiles.length) * 100) : 100,
  };

  // Dependency drift
  const declaredDeps = new Set([
    ...Object.keys(manifest.deps?.npm || {}),
    ...Object.keys(manifest.deps?.dev || {}),
    ...(manifest.deps?.pip || []),
    ...(manifest.deps?.go || []),
    ...(manifest.deps?.cargo || []),
  ]);
  const importedExternals = new Set((scan.externals || []).map((x) => x.name));
  const unusedDeclared = [...declaredDeps].filter((d) => !importedExternals.has(d)).sort();
  const BUILTIN_MODULES = new Set([
    'fs', 'path', 'http', 'https', 'url', 'crypto', 'os', 'stream', 'util',
    'events', 'child_process', 'buffer', 'assert', 'net', 'zlib', 'tls', 'dns',
    'perf_hooks', 'worker_threads',
  ]);
  const undeclaredImported = [...importedExternals]
    .filter((i) => !declaredDeps.has(i) && !BUILTIN_MODULES.has(i))
    .sort();
  const depsDrift = { unusedDeclared, undeclaredImported };

  const folderEdges = new Map();
  for (const e of edges) {
    const a = topFolderOf(e.from);
    const b = topFolderOf(e.to);
    if (a === b) continue;
    const key = a + '->' + b;
    folderEdges.set(key, (folderEdges.get(key) || 0) + 1);
  }

  return {
    fanIn: Object.fromEntries(fanIn),
    fanOut: Object.fromEntries(fanOut),
    importers: Object.fromEntries(importers),
    importsOf: Object.fromEntries(importsOf),
    entries,
    hubs,
    orphans,
    cycles,
    inCycle: [...inCycle],
    deadExports,
    testCoverage,
    untestedHubs,
    depsDrift,
    folderEdges: [...folderEdges.entries()].map(([key, count]) => {
      const [from, to] = key.split('->');
      return { from, to, count };
    }),
    entrySet: entries,
  };
}

// Tarjan's strongly connected components, iterative so deep graphs don't
// blow the stack.
function stronglyConnected(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) {
    if (adj.has(e.from)) adj.get(e.from).push(e.to);
  }
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const result = [];
  let counter = 0;

  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [[start, 0]];
    while (work.length) {
      const [v, pi] = work[work.length - 1];
      if (pi === 0) {
        index.set(v, counter);
        low.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);
      }
      const children = adj.get(v) || [];
      if (pi < children.length) {
        work[work.length - 1][1] = pi + 1;
        const w = children[pi];
        if (!index.has(w)) {
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), index.get(w)));
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1][0];
          low.set(parent, Math.min(low.get(parent), low.get(v)));
        }
        if (low.get(v) === index.get(v)) {
          const scc = [];
          let w;
          do {
            w = stack.pop();
            onStack.delete(w);
            scc.push(w);
          } while (w !== v);
          result.push(scc);
        }
      }
    }
  }
  return result;
}

// Lookup shapes for the render loops.
//
// `facts` is plain data on purpose — it is serialized to JSON and handed to the
// browser, so `entries`, `inCycle` and `hubs` have to travel as arrays. But the
// UI asks "is this file in a cycle?" once per file per redraw, and an array
// answers that in O(n): drawing a 2,000-file map turned into four million string
// comparisons. This builds the Sets and Maps once per facts object and
// remembers them in a WeakMap, so the index costs nothing on the second call
// and is collected the moment the scan it describes is dropped.
//
// It assumes nobody mutates `facts` after computing it. Nothing does — the
// engine returns it and every consumer reads.
const INDEXES = new WeakMap();

export function factIndex(facts) {
  let index = INDEXES.get(facts);
  if (index) return index;
  index = {
    entries: new Set(facts.entries || []),
    inCycle: new Set(facts.inCycle || []),
    hubs: new Map((facts.hubs || []).map((h) => [h.path, h])),
  };
  INDEXES.set(facts, index);
  return index;
}

export function roleOf(path, facts) {
  if (TEST_RE.test(path)) return 'test';
  const index = factIndex(facts);
  if (index.entries.has(path)) return 'entry';
  const hub = index.hubs.get(path);
  if (hub && hub.fanIn >= 5) return 'hub';
  const fin = facts.fanIn[path] || 0;
  const fout = facts.fanOut[path] || 0;
  if (fout === 0 && fin > 0) return 'leaf';
  if (/config|settings|\.json$|\.ya?ml$|\.toml$/.test(path)) return 'config';
  return 'module';
}

// Is this file part of an import cycle? Same answer as
// `facts.inCycle.includes(path)`, without the scan.
export function inCycle(path, facts) {
  return factIndex(facts).inCycle.has(path);
}

// The same trick for the scan itself. `scan.files.find((f) => f.path === p)` and
// `scan.files.filter((f) => f.dir === d)` were written a dozen times across the
// engine and the UI, both inside per-file loops — the docs generator alone ran
// the first one once per file per folder. One pass builds both lookups.
//
// `byDir` hands back the same array to every caller, in `scan.files` order.
// Treat it as read-only: copy before sorting.
const SCAN_INDEXES = new WeakMap();
const NO_FILES = Object.freeze([]);

export function scanIndex(scan) {
  let index = SCAN_INDEXES.get(scan);
  if (index) return index;
  const byPath = new Map();
  const byDir = new Map();
  for (const f of scan.files || []) {
    byPath.set(f.path, f);
    const bucket = byDir.get(f.dir);
    if (bucket) bucket.push(f);
    else byDir.set(f.dir, [f]);
  }
  index = {
    byPath,
    byDir,
    fileAt: (path) => byPath.get(path) || null,
    filesIn: (dir) => byDir.get(dir) || NO_FILES,
  };
  SCAN_INDEXES.set(scan, index);
  return index;
}
