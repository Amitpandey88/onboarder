import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceConnections, mermaidNodeId, mermaidEdgeEnds } from '../public/js/connectionFocus.js';

const edges = [
  { from: 'root', to: 'src' }, { from: 'root', to: 'docs' },
  { from: 'src', to: 'lib' }, { from: 'lib', to: 'file' },
  { from: 'src', to: 'entry' }, { from: 'docs', to: 'readme' },
];
test('a tree thread includes ancestors and all visible descendants without sibling branches', () => {
  const active = traceConnections(edges, 'src', true);
  assert.deepEqual([...active.nodes].sort(), ['entry', 'file', 'lib', 'root', 'src']);
  assert.deepEqual([...active.edges].sort(), [0, 2, 3, 4]);
});
test('a leaf traces the entire path to root, without its parent siblings', () => {
  assert.deepEqual([...traceConnections(edges, 'file', true).nodes].sort(), ['file', 'lib', 'root', 'src']);
});
test('network focus shows both incoming and outgoing edges without traversing the whole repository', () => {
  const active = traceConnections(edges, 'src');
  assert.deepEqual([...active.nodes].sort(), ['entry', 'lib', 'root', 'src']);
  assert.deepEqual([...active.edges].sort(), [0, 2, 4]);
});
test('cycles cannot make tree tracing loop indefinitely', () => {
  const active = traceConnections([{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }], 'a', true);
  assert.equal(active.nodes.size, 2);
  assert.equal(active.edges.size, 2);
});
test('isolated nodes remain focusable', () => {
  const active = traceConnections(edges, 'isolated');
  assert.deepEqual([...active.nodes], ['isolated']);
  assert.equal(active.edges.size, 0);
});
test('Mermaid node identities survive renderer prefixes and render counters', () => {
  assert.equal(mermaidNodeId('obd1-flowchart-n83-90'), 'n83');
  assert.equal(mermaidNodeId('obd2-flowchart-n83-4'), 'n83');
  assert.equal(mermaidNodeId('flowchart-my_node-10'), 'my_node');
  assert.equal(mermaidNodeId('unrelated'), null);
});
test('Mermaid edge identities map prefixed IDs, underscore IDs and parallel edges', () => {
  const ids = ['my_node', 'target_2', 'other'];
  assert.deepEqual(mermaidEdgeEnds('L_my_node_target_2_0', ids), { from: 'my_node', to: 'target_2' });
  assert.deepEqual(mermaidEdgeEnds('obd3-L_my_node_target_2_7', ids), { from: 'my_node', to: 'target_2' });
  assert.equal(mermaidEdgeEnds('L_missing_other_0', ids), null);
});
