import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { HermesWeb } from '../server/hermesChat.js';
import { createRouter } from '../server/router.js';
import { runtimePaths } from '../cli/agent/config.js';
import { streamExplain } from '../public/js/api.js';
import { getSettings, saveSettings, isConfigured } from '../public/js/llm.js';

const messages = [{ role: 'system', content: 'Explain the supplied code.' }, { role: 'user', content: 'const value = 42;' }];
const launch = JSON.stringify(['python-fixture', '-I', '-c', "import sys; import hermes_bootstrap; runpy.run_module('hermes_cli.main', run_name='__main__', alter_sys=True)"]);
async function fixture(t, run, configured = true) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-web-hermes-'));
  const home = path.join(temp, 'agent'), env = { ...process.env, HERMES_HOME: temp, ONBOARDER_AI_API_KEY: 'secret-fixture-value' };
  const profile = runtimePaths(home, env).profile;
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(path.join(profile, 'config.yaml'), JSON.stringify(configured ? { model: { default: 'fixture-model', provider: 'fixture', api_key: 'never-expose-this' } } : {}));
  let calls = 0;
  const hermes = new HermesWeb(home, env, async (command, args, options) => {
    if (args[0] === '--print-runtime-command') return { code: 0, stdout: launch, stderr: '' };
    calls++;
    assert.equal(command, 'python-fixture');
    assert.equal(options.env.HERMES_HOME, profile);
    assert.ok(args.includes('onboarder-web')); assert.ok(args.includes('--ignore-rules'));
    assert.ok(args.some(a => a.includes('model_tools.get_tool_definitions =')));
    assert.ok(!options.input.includes('browser-secret')); assert.ok(!args.includes('override-model'));
    return run({ ...options, args });
  });
  const server = http.createServer(createRouter({ hermes }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(temp, { recursive: true, force: true }); });
  const url = 'http://127.0.0.1:' + server.address().port;
  return { url, calls: () => calls, post: body => fetch(url + '/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ connection: 'hermes', messages, apiKey: 'browser-secret', model: 'override-model', ...body }) }) };
}
const completed = (options, text = 'Hello from Hermes') => {
  options.onLine(JSON.stringify({ type: 'result', text, exit_code: 0 }));
  return { code: 0, stdout: '', stderr: '' };
};

test('Hermes status shares only display fields and obeys origin guards', async t => {
  const f = await fixture(t, completed);
  const response = await fetch(f.url + '/api/hermes');
  const data = await response.json();
  assert.equal(data.configured, true); assert.equal(data.model, 'fixture-model');
  assert.ok(!JSON.stringify(data).includes('never-expose-this')); assert.equal(f.calls(), 0);
  assert.equal((await fetch(f.url + '/api/hermes', { headers: { origin: 'https://foreign.example' } })).status, 403);
  const forgedHost = await new Promise(resolve => {
    const req = http.get(f.url + '/api/hermes', { headers: { host: 'foreign.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', error => { throw error; });
  });
  assert.equal(forgedHost, 403);
  assert.equal((await fetch(f.url + '/api/explain', { method: 'POST', headers: { origin: 'https://foreign.example' }, body: JSON.stringify({ connection: 'hermes', messages }) })).status, 403);
});

test('Hermes streams once, ignores browser credentials/model overrides and completes explicitly', async t => {
  const f = await fixture(t, options => {
    options.onLine(JSON.stringify({ type: 'text', text: 'Hello ' }));
    options.onLine(JSON.stringify({ type: 'text', text: 'world' }));
    return completed(options, 'Hello world');
  });
  const response = await f.post();
  assert.equal(response.status, 200); const text = await response.text();
  assert.ok(text.includes('Hello ')); assert.ok(text.includes('world'));
  assert.ok(!text.includes('Hello world'), 'final text must not repeat streamed deltas');
  assert.ok(text.endsWith('data: [DONE]\n\n'));
});

test('Hermes supports providers that return only a final answer', async t => {
  const f = await fixture(t, completed);
  const text = await (await f.post()).text();
  assert.match(text, /Hello from Hermes/); assert.ok(text.includes('[DONE]'));
});

test('only diagram requests use a fixed low reasoning override', async t => {
  const received = [];
  const f = await fixture(t, options => { received.push(options.args); return completed(options); });
  await (await f.post({ purpose: 'diagram' })).text();
  const args = received[0]; assert.equal(args[args.indexOf('--reasoning') + 1], 'low');
  await (await f.post({ purpose: '--reasoning high' })).text();
  assert.ok(!received[1].includes('--reasoning'), 'unrecognized browser values cannot become command flags');
});

test('invalid Hermes prompts and unconfigured profiles never invoke inference', async t => {
  const f = await fixture(t, completed, false);
  for (const bad of [[], [{ role: 'tool', content: 'x' }], [{ role: 'user', content: ['x'] }], [{ role: 'user', content: 'x'.repeat(120001) }]]) {
    assert.equal((await f.post({ messages: bad })).status, 400);
  }
  const response = await f.post(); assert.equal(response.status, 503);
  assert.match((await response.json()).error, /onboarder agent model/); assert.equal(f.calls(), 0);
});

test('structured protocol failures and partial exits become visible streamed errors', async t => {
  for (const failure of ['malformed', 'missing', 'nonzero', 'tool', 'empty', 'after']) {
    await t.test(failure, async t => {
      const f = await fixture(t, options => {
        if (failure === 'malformed') options.onLine('not JSON');
        if (failure === 'tool') options.onLine(JSON.stringify({ type: 'tool_use', name: 'write_file' }));
        if (failure === 'empty') return completed(options, '');
        if (failure === 'after') { completed(options); options.onLine(JSON.stringify({ type: 'text', text: 'late' })); }
        return { code: failure === 'nonzero' ? 1 : 0, stdout: '', stderr: 'api_key="never-expose-this"' };
      });
      const text = await (await f.post()).text();
      assert.ok(text.includes('"error"')); assert.ok(!text.includes('never-expose-this'));
    });
  }
});

test('browser disconnect aborts Hermes and frees its request slot', async t => {
  let started, stopped;
  const ready = new Promise(resolve => { started = resolve; });
  const cancelled = new Promise(resolve => { stopped = resolve; });
  let first = true;
  const f = await fixture(t, async options => {
    if (!first) return completed(options);
    first = false; started();
    await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { stopped(); reject(new Error('cancelled')); }, { once: true }));
  });
  const controller = new AbortController();
  const pending = fetch(f.url + '/api/explain', { method: 'POST', signal: controller.signal, body: JSON.stringify({ connection: 'hermes', messages }) });
  await ready; const response = await pending;
  controller.abort(); await assert.rejects(response.text()); await cancelled;
  assert.match(await (await f.post()).text(), /Hello from Hermes/);
});

test('Hermes refuses excess concurrency before spawning another process', async t => {
  const releases = [], waiting = [];
  const f = await fixture(t, options => new Promise(resolve => { releases.push(() => resolve(completed(options))); waiting.splice(0).forEach(r => r()); }));
  const first = await f.post(); const second = await f.post();
  while (releases.length < 2) await new Promise(resolve => waiting.push(resolve));
  const third = await f.post(); assert.equal(third.status, 429); assert.equal(f.calls(), 2);
  releases.forEach(r => r()); await Promise.all([first.text(), second.text()]);
});

test('browser Hermes transport omits saved API credentials and reports SSE errors', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let sent, cancelled = false;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"error":{"message":"Hermes login expired"}}\n\n')); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } });
  };
  await assert.rejects(async () => { for await (const _ of streamExplain({ connection: 'hermes', baseUrl: 'https://private', apiKey: 'browser-secret', model: 'override-model', messages, providerOptions: { connection: 'api' } })) {} }, /Hermes login expired/);
  assert.deepEqual(sent, { connection: 'hermes', messages, stream: true }); assert.ok(cancelled);
});

test('browser receives split deltas, requires Hermes completion and cancels early returns', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"answer"}}]}\n\n');
  await assert.rejects(async () => { for await (const _ of streamExplain({ connection: 'hermes', messages })) {} }, /disconnected/);
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (const character of 'data: {"choices":[{"delta":{"content":"answer"}}]}\r\n\r\ndata: [DONE]\r\n\r\n') controller.enqueue(new TextEncoder().encode(character));
  }, cancel() { cancelled = true; } }));
  let answer = ''; for await (const delta of streamExplain({ connection: 'hermes', messages })) answer += delta;
  assert.equal(answer, 'answer'); assert.ok(cancelled);
  cancelled = false;
  for await (const _ of streamExplain({ connection: 'hermes', messages })) break;
  assert.ok(cancelled, 'abandoning a generator releases its HTTP stream');
});

test('saved API settings remain compatible and switching to Hermes preserves them', t => {
  const original = globalThis.localStorage; t.after(() => { globalThis.localStorage = original; });
  let stored = JSON.stringify({ baseUrl: 'https://old/v1', apiKey: 'old-key', model: 'old-model' });
  globalThis.localStorage = { getItem: () => stored, setItem: (_k, v) => { stored = v; } };
  assert.equal(getSettings().connection, 'api'); assert.ok(isConfigured());
  saveSettings({ ...getSettings(), connection: 'hermes', hermesModel: 'native-model' });
  assert.equal(getSettings().model, 'native-model'); assert.equal(getSettings(false).model, 'old-model'); assert.ok(isConfigured());
  saveSettings({ ...getSettings(false), connection: 'api' });
  assert.equal(getSettings().model, 'old-model'); assert.equal(getSettings().apiKey, 'old-key');
});
