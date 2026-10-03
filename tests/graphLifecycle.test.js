import test from 'node:test';
import assert from 'node:assert/strict';
import { initForceGraph } from '../public/js/forceGraph.js';

test('graph physics pause off-screen, resume without resetting, and stop when destroyed', t => {
  const previous = Object.fromEntries(['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, globalThis[k]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; });
  const doc = new EventTarget(); doc.hidden = false; doc.documentElement = { dataset: { theme: 'light' } }; doc.getElementById = () => null;
  globalThis.document = doc; globalThis.window = new EventTarget();
  const frames = new Map(); let frameId = 0; let paints = 0;
  globalThis.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const ctx = new Proxy({}, { get: (_, key) => key === 'clearRect' ? () => paints++ : () => {} });
  const canvas = Object.assign(new EventTarget(), { width: 500, height: 500, style: {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0 }), parentElement: { getBoundingClientRect: () => ({ width: 500, height: 500 }) } });
  const graph = initForceGraph(canvas);
  const runFrame = () => { const [id, cb] = frames.entries().next().value; frames.delete(id); cb(); };
  graph.update([{ path: 'a.ts', fanIn: 1 }, { path: 'b.ts', fanIn: 0 }], [{ from: 'a.ts', to: 'b.ts' }]);
  assert.equal(frames.size, 1); runFrame(); assert.ok(paints > 0); assert.equal(frames.size, 1);
  graph.setActive(false); assert.equal(frames.size, 0);
  const pausedPaints = paints; graph.resize(); graph.search('a'); assert.equal(paints, pausedPaints);
  graph.setActive(true); assert.equal(frames.size, 1); runFrame(); assert.ok(paints > pausedPaints);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(frames.size, 0);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(frames.size, 1);
  const wheel = () => Object.assign(new Event('wheel', { cancelable: true }), { deltaY: -1, clientX: 100, clientY: 100 });
  const liveWheel = wheel(); canvas.dispatchEvent(liveWheel); assert.equal(liveWheel.defaultPrevented, true);
  graph.destroy(); assert.equal(frames.size, 0);
  const afterDestroy = wheel(); canvas.dispatchEvent(afterDestroy); assert.equal(afterDestroy.defaultPrevented, false);
  graph.setActive(true); doc.dispatchEvent(new Event('visibilitychange')); assert.equal(frames.size, 0);
});
