import test from 'node:test';
import assert from 'node:assert';
import { computeFacts } from '../shared/analyzer/graph.js';

test('Communities and Betweenness', () => {
  const nodes = ['a', 'b'];
  const edges = [{from: 'a', to: 'b'}];
  // mocking full graph scan object
  const facts = computeFacts({ files: [{path: 'a'}, {path: 'b'}], edges }, {});
  assert.ok(facts.communities);
  assert.ok(facts.betweenness);
});
