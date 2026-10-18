import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { initForceGraph } from '../public/js/forceGraph.js';
import { GraphIndex, GRAPH_NODE_LIMIT, GRAPH_EDGE_LIMIT } from '../public/js/graphScene.js';

function harness(t, width = 500, height = 500, dpr = 1) {
  const previous = Object.fromEntries(['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, globalThis[k]]));
  let graph;
  t.after(() => { graph?.destroy(); for (const [key, value] of Object.entries(previous)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; });
  const doc = new EventTarget(); doc.hidden = false; doc.documentElement = { dataset: { theme: 'light' } }; doc.getElementById = () => null;
  globalThis.document = doc; globalThis.window = Object.assign(new EventTarget(), { devicePixelRatio: dpr });
  const frames = new Map(); let frameId = 0;
  globalThis.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const calls = { clearRect: 0, arc: 0, fillText: 0, stroke: 0, filters: [], allocations: 0 };
  const ctx = new Proxy({}, { get: (_, key) => () => { if (key in calls && typeof calls[key] === 'number') calls[key]++; }, set: (_, key, value) => { if (key === 'filter') calls.filters.push(value); return true; } });
  const rect = { width, height };
  const canvas = Object.assign(new EventTarget(), { style: {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0 }), parentElement: { getBoundingClientRect: () => rect }, setPointerCapture: () => {}, hasPointerCapture: () => false });
  let backingWidth = width, backingHeight = height;
  Object.defineProperties(canvas, { width: { get: () => backingWidth, set: value => { backingWidth = value; calls.allocations++; } }, height: { get: () => backingHeight, set: value => { backingHeight = value; calls.allocations++; } } });
  graph = initForceGraph(canvas);
  const flush = () => { assert.equal(frames.size, 1); const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); };
  return { graph, doc, canvas, frames, flush, calls, rect };
}
const files = [{ path: 'a.ts', fanIn: 1 }, { path: 'b.ts', fanIn: 0 }];
const links = [{ from: 'a.ts', to: 'b.ts' }];

test('graph paints on demand, pauses off-screen, resumes, and releases all work on destroy', t => {
  const { graph, frames, flush, calls, doc, canvas } = harness(t);
  graph.update(files, links); flush(); assert.ok(calls.clearRect); assert.equal(frames.size, 0, 'idle graph has no animation loop');
  graph.setActive(false); const painted = calls.clearRect;
  graph.resize(); graph.highlight('a.ts'); assert.equal(calls.clearRect, painted); assert.equal(frames.size, 0);
  graph.setActive(true); flush(); assert.ok(calls.clearRect > painted);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(frames.size, 0);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(frames.size, 1);
  const wheel = () => Object.assign(new Event('wheel', { cancelable: true }), { deltaY: -1, clientX: 100, clientY: 100 });
  const liveWheel = wheel(); canvas.dispatchEvent(liveWheel); assert.equal(liveWheel.defaultPrevented, true);
  graph.destroy(); assert.equal(frames.size, 0);
  const afterDestroy = wheel(); canvas.dispatchEvent(afterDestroy); assert.equal(afterDestroy.defaultPrevented, false);
  graph.setActive(true); doc.dispatchEvent(new Event('visibilitychange')); assert.equal(frames.size, 0); assert.equal(graph.stats().nodes, 0);
});

test('rapid interaction coalesces to one paint; resize does not repeatedly allocate the canvas', t => {
  const { graph, canvas, flush, frames, calls } = harness(t, 6000, 4000, 4);
  graph.update(files, links); flush();
  assert.ok(graph.stats().pixels <= 2_000_000); assert.ok(canvas.width <= 4096 && canvas.height <= 4096);
  const allocations = calls.allocations, painted = calls.clearRect;
  for (let i = 0; i < 100; i++) {
    graph.resize();
    canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY: -1, clientX: 100, clientY: 100 }));
  }
  assert.equal(calls.allocations, allocations); assert.equal(calls.clearRect, painted); assert.equal(frames.size, 1);
  flush(); assert.equal(calls.clearRect, painted + 1); assert.equal(frames.size, 0);
  assert.deepEqual(calls.filters, [], 'no per-item blur filters');
});

test('same-source updates preserve positions and viewport without restarting a layout', t => {
  const { graph, flush, frames } = harness(t);
  graph.update(files, links); flush();
  const before = graph.stats(); graph.update(files.map(file => ({ ...file })), links.map(link => ({ ...link }))); flush();
  assert.deepEqual(graph.stats().positions, before.positions); assert.deepEqual(graph.stats().viewport, before.viewport); assert.equal(frames.size, 0);
});

test('large scene is bounded while search and focus still find files outside the overview', () => {
  const source = Array.from({ length: 20_000 }, (_, i) => ({ path: 'src/file-' + i + '.ts', fanIn: i % 17 }));
  const edges = Array.from({ length: 80_000 }, (_, i) => ({ from: source[i % source.length].path, to: source[(i * 7 + 1) % source.length].path }));
  const index = new GraphIndex(source, edges); const scene = index.select();
  assert.equal(scene.nodes.length, GRAPH_NODE_LIMIT); assert.ok(scene.edges.length <= GRAPH_EDGE_LIMIT); assert.equal(scene.totalFiles, 20_000); assert.equal(scene.limited, true);
  const hidden = source.find(file => !scene.nodes.some(node => node.path === file.path));
  const searched = index.select(hidden.path); assert.equal(searched.matches, 1); assert.ok(searched.nodes.some(node => node.path === hidden.path));
  const focused = index.select('', hidden.path); assert.ok(focused.nodes.some(node => node.path === hidden.path));
  const paths = new Set(searched.nodes.map(node => node.path)); assert.ok(searched.edges.every(edge => paths.has(edge.from) && paths.has(edge.to)));
  assert.equal(index.select('no-such-source').nodes.length, 0);
});

test('dense graph limits connections, labels and draw calls, then becomes idle', t => {
  const { graph, canvas, flush, frames, calls } = harness(t, 1200, 800, 2);
  const source = Array.from({ length: 700 }, (_, i) => ({ path: 'src/node-' + i + '.ts', fanIn: 2 }));
  const edges = Array.from({ length: 50_000 }, (_, i) => ({ from: source[i % 700].path, to: source[(Math.floor(i / 700) + i + 1) % 700].path }));
  const start = performance.now(); graph.update(source, edges); flush();
  assert.equal(graph.stats().edges, GRAPH_EDGE_LIMIT); assert.ok(calls.fillText <= 48); assert.ok(calls.arc <= GRAPH_NODE_LIMIT); assert.equal(calls.stroke, 3);
  assert.deepEqual(calls.filters, []); assert.equal(frames.size, 0);
  const state = graph.stats(), node = state.positions[0], beforeStrokes = calls.stroke;
  canvas.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: node.x * state.viewport.k + state.viewport.x, clientY: node.y * state.viewport.k + state.viewport.y }));
  flush(); assert.ok(calls.stroke - beforeStrokes <= 5, 'dense hover uses bounded style batches'); assert.equal(frames.size, 0);
  t.diagnostic('700-node / 50,000-input-edge scene prepared and painted in ' + (performance.now() - start).toFixed(1) + ' ms with a mock canvas; GPU timing is browser-dependent.');
});

test('debounced search selects unseen files and cancels pending work when destroyed', async t => {
  const { graph, frames, flush } = harness(t);
  const source = Array.from({ length: 2000 }, (_, i) => ({ path: 'node-' + i + '.ts', fanIn: 2000 - i }));
  graph.update(source, []); flush(); graph.search('node-19'); graph.search('node-1999.ts');
  await delay(130); flush(); assert.ok(graph.stats().positions.some(node => node.path === 'node-1999.ts')); assert.equal(frames.size, 0);
  graph.search('node-1'); graph.destroy(); await delay(130); assert.equal(frames.size, 0); assert.equal(graph.stats().nodes, 0);
});

test('drag and double-click do not navigate away; hidden or destroyed graphs cancel delayed navigation', async t => {
  const { graph, canvas, flush } = harness(t); graph.update(files, links); flush();
  const opened = []; canvas.addEventListener('graph-node-click', event => opened.push(event.detail.path));
  const point = () => { const state = graph.stats(), node = state.positions.find(n => n.path === 'a.ts'); return { clientX: node.x * state.viewport.k + state.viewport.x, clientY: node.y * state.viewport.k + state.viewport.y, pointerId: 1 }; };
  const send = (type, values = point()) => canvas.dispatchEvent(Object.assign(new Event(type), values));
  const start = point(); send('pointerdown', start); const end = { ...start, clientX: start.clientX + 40 };
  send('pointermove', end); send('pointerup', end); send('click', end); await delay(300); assert.deepEqual(opened, []);
  send('click'); send('click'); send('dblclick'); await delay(300); assert.deepEqual(opened, []); assert.ok(graph.stats().viewport.k >= 1.2);
  send('click'); graph.setActive(false); await delay(300); assert.deepEqual(opened, []);
  graph.setActive(true); send('click'); await delay(300); assert.deepEqual(opened, ['a.ts']);
  send('click'); graph.destroy(); await delay(300); assert.deepEqual(opened, ['a.ts']);
});

test('responsive resize fits an untouched graph and preserves user zoom around its center', t => {
  const { graph, canvas, flush, rect } = harness(t, 1200, 800);
  graph.update(Array.from({ length: 300 }, (_, i) => ({ path: 'file-' + i + '.ts' })), []); flush();
  const desktopScale = graph.stats().viewport.k; rect.width = 390; graph.resize(); flush();
  assert.ok(graph.stats().viewport.k < desktopScale);
  canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY: -1, clientX: 150, clientY: 100 })); flush();
  const before = graph.stats().viewport; rect.width = 590; graph.resize(); flush(); const after = graph.stats().viewport;
  assert.equal(after.k, before.k); assert.equal(after.x, before.x + 100); assert.equal(after.y, before.y);
});
