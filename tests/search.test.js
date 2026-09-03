import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTfIdfIndex, searchIndex } from '../server/apiSearch.js';

test('buildTfIdfIndex computes token frequencies', () => {
  const docs = [
    { path: 'a.js', content: 'function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }' },
    { path: 'b.js', content: 'export function renderChart() { return "chart"; }' },
  ];

  const index = buildTfIdfIndex(docs);
  assert.equal(index.totalDocs, 2);
  assert.ok(index.index.has('a.js'));
  assert.ok(index.index.has('b.js'));
  assert.equal(index.docCounts.get('calculatetotal'), 1);
});

test('searchIndex ranks matching documents by relevance', () => {
  const docs = [
    { path: 'math.js', content: 'export function add(a, b) { return a + b; }\nexport function sum(arr) { return arr.reduce(add); }' },
    { path: 'ui.js', content: 'export function renderButton() { return "<button>Click</button>"; }' },
    { path: 'app.js', content: 'import { add } from "./math.js";\nconst x = add(1, 2);' },
  ];

  const index = buildTfIdfIndex(docs);
  const results = searchIndex(index, 'add');
  
  assert.equal(results.length, 2);
  const paths = results.map(r => r.path);
  assert.ok(paths.includes('math.js'));
  assert.ok(paths.includes('app.js'));
  assert.ok(!paths.includes('ui.js'));
  assert.ok(results[0].snippet.includes('add'));
  assert.equal(results[0].line, 1);
});

test('searchIndex returns empty array for blank query or missing index', () => {
  const index = buildTfIdfIndex([{ path: 'x.js', content: 'console.log("hello");' }]);
  assert.deepEqual(searchIndex(index, ''), []);
  assert.deepEqual(searchIndex(null, 'hello'), []);
  assert.deepEqual(searchIndex(index, '   '), []);
});

