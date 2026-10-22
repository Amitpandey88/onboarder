import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { proxyChat, buildChatRequest } from '../server/llmProxy.js';
import { streamExplain } from '../public/js/api.js';
import { fixFixture, git } from './helpers/fixFixture.mjs';
import { fixCheckPlan } from '../cli/agent/checks.js';
import { GithubAutomation } from '../server/intelligence/githubAutomation.js';
import { triageFixture } from './helpers/triageFixture.mjs';
import { applyAIReview } from '../server/reviewAI.js';

class Capture extends EventEmitter {
  status = 0; body = ''; headersSent = false; writableEnded = false; writableLength = 0;
  writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; }
  write(value) { this.body += ArrayBuffer.isView(value) ? Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString() : String(value); return true; }
  end(value = '') { this.body += String(value); this.writableEnded = true; }
}
const input = { baseUrl: 'http://127.0.0.1:9999/v1', model: 'controlled-fixture', apiKey: 'audit-credential-that-must-not-escape', messages: [{ role: 'user', content: 'Explain this synthetic fixture.' }] };
function mockFetch(t, fn) { const original = globalThis.fetch; globalThis.fetch = fn; t.after(() => { globalThis.fetch = original; }); }
async function browserAnswer(options = {}) { let answer = ''; for await (const text of streamExplain({ messages: input.messages, ...options })) answer += text; return answer; }

test('legacy proxy refuses redirects and never echoes a credential-bearing endpoint on network failure', async t => {
  let request;
  mockFetch(t, async (_url, init) => { request = init; throw new Error('private upstream diagnostic'); });
  const res = new Capture(); await proxyChat(res, { ...input, apiKey: 'AIza' + 'x'.repeat(30) });
  assert.equal(request.redirect, 'error');
  assert.ok(!res.body.includes('AIza')); assert.ok(!res.body.includes('private upstream diagnostic'));
});
test('legacy proxy withholds upstream credential errors and bounds unsuccessful bodies', async t => {
  mockFetch(t, async () => Response.json({ error: { message: input.apiKey } }, { status: 401, headers: { 'x-request-id': 'trace-fixture' } }));
  const res = new Capture(); await proxyChat(res, input);
  assert.equal(res.status, 401); assert.ok(!res.body.includes(input.apiKey)); assert.equal(JSON.parse(res.body).requestId, 'trace-fixture');
});
test('legacy proxy redacts configured credentials and known source secrets before model submission', async t => {
  let sent; mockFetch(t, async (_url, init) => { sent = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: 'answer' } }] }); });
  const res = new Capture();
  await proxyChat(res, { ...input, stream: false, messages: [{ role: 'user', content: 'Comment ' + input.apiKey + '\nconst password = "sensitive-test-only-credential";' }] });
  assert.equal(res.status, 200); assert.ok(!JSON.stringify(sent.messages).includes(input.apiKey)); assert.ok(!JSON.stringify(sent.messages).includes('sensitive-test-only-credential'));
});
test('legacy proxy redacts credentials spanning streaming chunks without corrupting SSE', async t => {
  const raw = 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Answer ' + input.apiKey } }] }) + '\n\ndata: [DONE]\n\n';
  mockFetch(t, async () => new Response(new ReadableStream({ start(c) { for (const ch of raw) c.enqueue(new TextEncoder().encode(ch)); c.close(); } })));
  const res = new Capture(); await proxyChat(res, input); assert.equal(res.status, 200); assert.ok(!res.body.includes(input.apiKey));
  const parsed = JSON.parse(res.body.split('\n').find(l => l.startsWith('data: {')).slice(6)); assert.match(parsed.choices[0].delta.content, /redact/);
});
test('legacy proxy cancels an in-flight provider when the browser disconnects', async t => {
  const res = new Capture(); let signal;
  mockFetch(t, async (_url, init) => { signal = init.signal; setImmediate(() => res.emit('close'));
    await new Promise(resolve => setTimeout(resolve, 20)); if (signal.aborted) throw signal.reason;
    return Response.json({ choices: [] }); });
  await proxyChat(res, { ...input, stream: false }); assert.equal(signal.aborted, true); assert.equal(res.writableEnded, false);
});
test('legacy proxy bounds non-streaming response size and validates input message roles', async t => {
  let calls = 0; mockFetch(t, async () => { calls++; return Response.json({ content: 'x'.repeat(300000) }); });
  const res = new Capture(); await proxyChat(res, { ...input, stream: false }); assert.equal(res.status, 502); assert.ok(res.body.length < 1000);
  const invalid = new Capture(); await proxyChat(invalid, { ...input, messages: [{ role: 'tool', content: 'untrusted tool execution' }] }); assert.equal(invalid.status, 400); assert.equal(calls, 1);
});
test('browser API transport rejects premature EOF and token-truncated completions', async t => {
  mockFetch(t, async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
  await assert.rejects(browserAnswer(), /disconnected|incomplete/);
  globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n');
  await assert.rejects(browserAnswer(), /limit|truncat/);
});
test('browser accepts actual Anthropic and Gemini event dialects with explicit completion', async t => {
  mockFetch(t, async () => new Response('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Anthropic answer"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'));
  assert.equal(await browserAnswer(), 'Anthropic answer');
  globalThis.fetch = async () => new Response('data: {"candidates":[{"content":{"parts":[{"text":"Gemini answer"}]},"finishReason":"STOP"}]}\n\n');
  assert.equal(await browserAnswer(), 'Gemini answer');
});
test('browser stream limit counts cumulative bytes across complete frames', async t => {
  const frame = 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(100000) } }] }) + '\n\n';
  mockFetch(t, async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 22; i++) c.enqueue(new TextEncoder().encode(frame)); c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close(); } })));
  await assert.rejects(browserAnswer(), /limit/);
});
test('provider URLs preserve Azure query parameters and form valid Gemini JSON requests', () => {
  const azure = buildChatRequest({ ...input, baseUrl: 'https://example.openai.azure.com/openai/deployments/demo?api-version=2024-10-21' }, false);
  assert.equal(new URL(azure.url).pathname, '/openai/deployments/demo/chat/completions');
  assert.equal(new URL(azure.url).searchParams.get('api-version'), '2024-10-21');
  const gemini = buildChatRequest({ ...input, apiKey: 'AIza' + 'x'.repeat(30) }, false);
  assert.equal(new URL(gemini.url).searchParams.get('key'), 'AIza' + 'x'.repeat(30));
  assert.match(new URL(gemini.url).pathname, /:generateContent$/);
});
test('browser never treats malformed answer events followed by DONE as successful', async t => {
  mockFetch(t, async () => new Response('data: {invalid-json}\n\ndata: [DONE]\n\n'));
  await assert.rejects(browserAnswer(), /malformed/);
});
test('check-plan approval binds raw script changes even when private display text is identical', async t => {
  const first = 'node -e "const password = \'fixture-one-secret-value\'; process.exit(0)"';
  const second = 'node -e "const password = \'fixture-two-secret-value\'; process.exit(1)"';
  const f = await fixFixture(t, { scripts: { test: first } });
  const before = await fixCheckPlan(f.root), pkg = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(path.join(f.root, 'package.json'), 'utf8')));
  pkg.scripts.test = second; await writeFile(path.join(f.root, 'package.json'), JSON.stringify(pkg));
  git(f.root, 'add', 'package.json'); git(f.root, '-c', 'user.name=Audit fixture', '-c', 'user.email=audit@example.invalid', 'commit', '-qm', 'changed script');
  const after = await fixCheckPlan(f.root);
  assert.equal(before.checks.find(c => c.id === 'test').script, after.checks.find(c => c.id === 'test').script);
  assert.notEqual(before.digest, after.digest); assert.ok(!JSON.stringify(after).includes('fixture-two-secret-value'));
});
test('disabled GitHub publication mints an installation token without check-write permission', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-audit-app-')); t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = triageFixture(), file = path.join(root, 'automation.json'), key = path.join(root, 'key.pem');
  await writeFile(key, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  await writeFile(file, JSON.stringify({ version: 1, publish: false, repositories: { 'fixture/repo': { installationId: 11 } } }));
  const previous = [process.env.ONBOARDER_GITHUB_APP_KEY_FILE, process.env.ONBOARDER_GITHUB_APP_ID];
  process.env.ONBOARDER_GITHUB_APP_KEY_FILE = key; process.env.ONBOARDER_GITHUB_APP_ID = '1';
  t.after(() => { for (const [i, name] of ['ONBOARDER_GITHUB_APP_KEY_FILE', 'ONBOARDER_GITHUB_APP_ID'].entries()) { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; } });
  let permissions;
  mockFetch(t, async (url, init) => { if (String(url).includes('/app/installations/')) { permissions = JSON.parse(init.body).permissions; return Response.json({ token: 'fake-installation-token' }); } return fixture.fetchImpl(url, init); });
  const automation = new GithubAutomation(file, 'test-only-webhook-secret-with-24-bytes');
  await automation.accept('pull_request', { action: 'opened', number: 7, repository: { full_name: 'fixture/repo' }, pull_request: fixture.pull }); await automation.idle();
  assert.equal(permissions.checks, 'read'); assert.ok(fixture.calls.every(c => c.method === 'GET'));
});
test('unresponsive review and fix adapters settle at their deadline even when they ignore cancellation', async t => {
  const f = await fixFixture(t), unresponsive = async () => new Promise(() => {});
  const reviewed = await applyAIReview(f.root, f.report, { complete: unresponsive, limits: { timeoutMs: 1000 } });
  assert.equal(reviewed.ai.status, 'failed'); assert.match(reviewed.ai.message, /timed out/);
  await assert.rejects(f.propose({ complete: unresponsive, limits: { timeoutMs: 1000 } }), /timed out/);
  assert.equal(await import('node:fs/promises').then(fs=>fs.readFile(path.join(f.root,'codec.js'),'utf8')), (await import('./helpers/fixFixture.mjs')).bad);
});
