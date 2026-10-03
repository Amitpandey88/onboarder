import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initAiDraft, updateAiBtn, stopAiDraft } from '../public/js/aiDraft.js';
import { loadRepo, unloadRepo, state } from '../public/js/state.js';

const diagram = '%% caption: The entry uses a helper\nflowchart LR\n  a["app.ts"] --> b["helper.ts"]';
const response = text => new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\ndata: [DONE]\n\n');
function element() {
  const listeners = {}, attributes = new Map();
  return { hidden: false, textContent: '', title: '', addEventListener(type, fn) { listeners[type] = fn; },
    setAttribute(k, v) { attributes.set(k, v); }, removeAttribute(k) { attributes.delete(k); }, getAttribute(k) { return attributes.get(k); },
    click() { return listeners.click(); } };
}
function repo() {
  loadRepo({ scan: { name: 'fixture', files: [{ path: 'app.ts', name: 'app.ts' }], folders: [], edges: [], externals: [] },
    facts: { folderEdges: [], entries: ['app.ts'], hubs: [] } });
}
function fixture(t, fetch, validate = async () => {}) {
  stopAiDraft(); repo();
  const oldFetch = globalThis.fetch, oldStorage = globalThis.localStorage;
  globalThis.fetch = fetch;
  globalThis.localStorage = { getItem: () => JSON.stringify({ connection: 'hermes', hermesModel: 'fixture-model' }) };
  const button = element(), status = element(), errors = [], renders = [], settings = [];
  initAiDraft({ host: button, statusEl: status, nodeHost: { querySelectorAll: () => [] },
    onValidate: validate, onRender: () => renders.push(state.aiActiveKey), onToast: text => errors.push(text), onOpenSettings: () => settings.push(true) });
  updateAiBtn();
  t.after(() => { stopAiDraft(); unloadRepo(); globalThis.fetch = oldFetch; globalThis.localStorage = oldStorage; });
  return { button, status, errors, renders, settings };
}

test('AI sketch uses Hermes, validates before caching, and toggles its static/cached map', async t => {
  let request, validated = false, calls = 0;
  const f = fixture(t, async (_url, options) => { calls++; request = JSON.parse(options.body); return response(diagram); }, async source => {
    assert.match(source, /^flowchart LR/); assert.deepEqual(state.aiDiagrams, {}); validated = true;
  });
  await f.button.click();
  assert.equal(request.connection, 'hermes'); assert.equal(request.purpose, 'diagram'); assert.ok(!('apiKey' in request)); assert.match(request.messages[1].content, /fixture/);
  assert.ok(validated); assert.equal(state.aiActiveKey, 'map:'); assert.equal(f.button.textContent, 'Static'); assert.equal(f.status.hidden, true);
  assert.match(state.aiDiagrams['map:'].body, /helper.ts/); assert.equal(state.aiDiagrams['map:'].caption, 'The entry uses a helper');
  await f.button.click(); assert.equal(state.aiActiveKey, null); assert.equal(f.button.textContent, 'AI sketch ✓');
  await f.button.click(); assert.equal(state.aiActiveKey, 'map:'); assert.equal(calls, 1, 'cached sketches do not repeat inference');
});

test('invalid Mermaid is not cached or activated, and the user can retry', async t => {
  const f = fixture(t, async () => response(diagram), async () => { throw new Error('parse failed'); });
  await f.button.click();
  assert.deepEqual(state.aiDiagrams, {}); assert.equal(state.aiActiveKey, null); assert.deepEqual(f.renders, []);
  assert.match(f.errors[0], /could not be drawn/); assert.equal(f.button.textContent, 'AI sketch'); assert.equal(f.status.hidden, true);
});

test('missing diagrams and streamed Hermes errors leave the existing map intact', async t => {
  for (const text of ['prose', 'error']) await t.test(text, async t => {
    const f = fixture(t, async () => text === 'prose' ? response('Here are my thoughts.') : new Response('data: {"error":{"message":"Hermes login expired"}}\n\n'));
    await f.button.click(); assert.deepEqual(state.aiDiagrams, {}); assert.equal(state.aiActiveKey, null);
    assert.match(f.errors[0], text === 'prose' ? /without a diagram/ : /Hermes login expired/);
  });
});

test('cancel sketch aborts the HTTP request and resets its progress/button', async t => {
  let signal, started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture(t, async (_url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) {
      options.signal.addEventListener('abort', () => controller.error(new DOMException('Cancelled', 'AbortError')), { once: true }); started();
    } }));
  });
  const pending = f.button.click(); await ready;
  assert.equal(f.button.textContent, 'Cancel sketch'); assert.match(f.status.textContent, /Hermes is sketching/);
  await f.button.click(); await pending;
  assert.ok(signal.aborted); assert.deepEqual(state.aiDiagrams, {}); assert.equal(f.status.hidden, true);
  assert.equal(f.button.textContent, 'AI sketch'); assert.deepEqual(f.errors, ['Sketch cancelled.']);
});

test('navigation or loading a different repo discards late model results', async t => {
  for (const change of ['view', 'repo']) await t.test(change, async t => {
    let finish;
    const f = fixture(t, async () => new Promise(resolve => { finish = () => resolve(response(diagram)); }));
    const pending = f.button.click();
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    if (change === 'view') state.view = 'docs'; else repo();
    updateAiBtn(); finish(); await pending;
    assert.deepEqual(state.aiDiagrams, {}); assert.equal(state.aiActiveKey, null); assert.deepEqual(f.errors, []);
    assert.equal(f.status.hidden, true); assert.deepEqual(f.renders, []);
  });
});

test('offline sketch opens AI connection settings without making a request', async t => {
  let called = false;
  const f = fixture(t, async () => { called = true; return response(diagram); });
  globalThis.localStorage = { getItem: () => '{}' };
  await f.button.click(); assert.ok(!called); assert.deepEqual(f.settings, [true]); assert.match(f.errors[0], /Choose Hermes/);
});
