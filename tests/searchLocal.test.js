import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalSearchIndex, searchLocalIndex } from '../public/js/searchLocal.js';
import { parseQuery, scorePath, scoreSymbol, matchesPathFilters } from '../shared/search/query.js';

test('local index keeps declaration lines and deduplicates matching exports', () => {
  const index = buildLocalSearchIndex([{ path: 'src/router.ts', functions: [{ name: 'router', line: 18 }], exports: [{ name: 'router' }, { name: 'app' }] }, 'README.md']);
  assert.equal(index[0].symbols.length, 2);
  const result = searchLocalIndex(index, parseQuery('router'));
  assert.equal(result.symbols[0].name, 'router()');
  assert.equal(result.symbols[0].line, 18);
});
test('bounded ranking returns the same top results as full sorting with honest counts', () => {
  const index = buildLocalSearchIndex(Array.from({ length: 500 }, (_, i) => ({ path: `src/module${i}/router.ts`, functions: [{ name: `createRouter${i}`, line: i + 1 }, { name: 'createRouter', line: i + 2 }] })));
  const parsed = parseQuery('router');
  const expectedFiles = []; const expectedSymbols = [];
  for (const file of index) {
    if (!matchesPathFilters(parsed, file.path)) continue;
    const score = scorePath(parsed, file.path); if (score) expectedFiles.push({ path: file.path, score });
    for (const symbol of file.symbols) { const score = scoreSymbol(parsed, symbol.name, symbol.kind); if (score) expectedSymbols.push({ path: file.path, score, ...symbol }); }
  }
  const compare = (a, b) => b.score - a.score || a.path.localeCompare(b.path);
  const actual = searchLocalIndex(index, parsed, 17);
  assert.equal(actual.counts.files, expectedFiles.length); assert.equal(actual.counts.symbols, expectedSymbols.length);
  assert.deepEqual(actual.files.map(r => r.path), expectedFiles.sort(compare).slice(0, 17).map(r => r.path));
  assert.deepEqual(actual.symbols.map(r => [r.path, r.name, r.line]), expectedSymbols.sort(compare).slice(0, 17).map(r => [r.path, r.name, r.line]));
});
test('indexed search enforces kinds, paths, exclusions and case sensitivity', () => {
  const index = buildLocalSearchIndex([{ path: 'src/router.ts', classes: [{ name: 'Router', line: 3 }], functions: [{ name: 'createRouter', line: 6 }] }, { path: 'tests/router.test.ts', functions: [{ name: 'createRouterTest', line: 2 }] }]);
  assert.equal(searchLocalIndex(index, parseQuery('kind:class')).symbols[0].name, 'Router');
  assert.deepEqual(searchLocalIndex(index, parseQuery('is:test router')).files.map(r => r.path), ['tests/router.test.ts']);
  assert.deepEqual(searchLocalIndex(index, parseQuery('path:src -tests router')).files.map(r => r.path), ['src/router.ts']);
  assert.equal(searchLocalIndex(index, parseQuery('Router', { caseSensitive: true })).symbols.length, 3);
  assert.equal(searchLocalIndex(index, parseQuery('"router"', { caseSensitive: true })).symbols.length, 0);
  assert.equal(searchLocalIndex(index, parseQuery('missing')).counts.files, 0);
  assert.equal(searchLocalIndex(index, parseQuery('')).counts.symbols, 0);
});
test('a zero preview limit still reports exact matches', () => {
  const actual = searchLocalIndex(buildLocalSearchIndex(['router.ts']), parseQuery('router'), 0);
  assert.equal(actual.counts.files, 1); assert.deepEqual(actual.files, []);
});
