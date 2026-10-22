import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from '../server/index.js';
import { openSession } from '../server/sessions.js';
import { fixture, git, contextFrom, authFinding, response } from './helpers/contextualReview.mjs';
const execute = promisify(execFile);
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return 'http://127.0.0.1:' + server.address().port;
}
test('real HTTP Review API returns validated AI findings with progress and keeps static mode offline', async t => {
  const { root } = await fixture(t); let calls = 0;
  const server = createServer({ reviewComplete: async messages => { calls++; return response([authFinding(contextFrom(messages))]); } });
  const url = await listen(t, server), scanId = openSession({ root });
  const post = body => fetch(url + '/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scanId, ...body }) });
  const offline = await post({}); assert.equal(offline.status, 200); assert.equal((await offline.json()).ai, undefined); assert.equal(calls, 0);
  const result = await post({ ai: true, stream: true }); assert.equal(result.status, 200); assert.ok(result.headers.get('content-type').includes('text/event-stream'));
  const frames = (await result.text()).split('\n\n').filter(Boolean).map(f => JSON.parse(f.slice(5)));
  assert.ok(frames.some(f => f.phase?.includes('Validating'))); const report = frames.find(f => f.report).report;
  assert.equal(report.ai.accepted, 1); assert.equal(calls, 1);
  for (const body of [{ ai: 'yes' }, { ai: true, limits: { maxContextBytes: 100001 } }, { ai: true, provider: { connection: 'unknown' } }]) assert.equal((await post(body)).status, 400);
  assert.equal((await fetch(url + '/api/review', { method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: JSON.stringify({ scanId, ai: true }) })).status, 403);
});
test('disconnecting an AI Review HTTP request cancels its model and frees the request slot', async t => {
  const { root } = await fixture(t); let ready, stopped;
  const started = new Promise(resolve => { ready = resolve; }), cancelled = new Promise(resolve => { stopped = resolve; });
  const server = createServer({ reviewComplete: async (_messages, signal) => {
    ready(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { stopped(); reject(signal.reason); }, { once: true }));
  } });
  const url = await listen(t, server), scanId = openSession({ root }); const controller = new AbortController();
  const result = await fetch(url + '/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ scanId, ai: true, stream: true }) });
  await started; controller.abort(); await assert.rejects(result.text()); await cancelled;
});
test('CLI --ai supports working, staged and range reviews against a real mocked local provider', async t => {
  const { root, base } = await fixture(t); let calls = 0;
  const provider = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const value = JSON.parse(body); calls++; assert.equal(req.url, '/v1/chat/completions'); assert.equal(value.stream, false);
    assert.equal(value.max_tokens, 3000); assert.equal(body.includes('fixture-private-token'), false);
    const modelAnswer = response([authFinding(contextFrom(value.messages))]);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: modelAnswer.text }, finish_reason: 'stop' }], usage: { prompt_tokens: 101, completion_tokens: 121 } }));
  });
  const url = await listen(t, provider);
  const env = { ...process.env, ONBOARDER_CONFIG: path.join(root, 'absent-private-settings.json'), ONBOARDER_AI_BASE_URL: url + '/v1', ONBOARDER_AI_MODEL: 'mock-local-model', ONBOARDER_AI_API_KEY: 'fixture-private-token' };
  const cli = async args => execute(process.execPath, ['bin/onboarder.js', 'review', root, '--json', ...args], { cwd: process.cwd(), env, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  const offline = JSON.parse((await cli([])).stdout); assert.equal(offline.ai, undefined); assert.equal(calls, 0);
  let result = JSON.parse((await cli(['--ai'])).stdout); assert.equal(result.ai.accepted, 1); assert.equal(result.ai.usage.inputTokens, 101);
  git(root, 'add', '.'); result = JSON.parse((await cli(['--staged', '--ai'])).stdout); assert.equal(result.ai.accepted, 1);
  git(root, 'commit', '-qm', 'async change'); result = JSON.parse((await cli(['--base', base, '--head', 'HEAD', '--ai'])).stdout);
  assert.equal(result.ai.accepted, 1); assert.equal(calls, 3); assert.equal(result.ai.context.revision, git(root, 'rev-parse', 'HEAD'));
  assert.equal(JSON.stringify(result).includes('fixture-private-token'), false);
});
test('CLI returns static output and an explicit nonzero AI status when no provider is configured', async t => {
  const { root } = await fixture(t);
  const env = { ...process.env, ONBOARDER_CONFIG: path.join(root, 'absent-settings.json'), ONBOARDER_AI_BASE_URL: '', OPENAI_BASE_URL: '', ONBOARDER_AI_MODEL: '', OPENAI_MODEL: '' };
  await assert.rejects(execute(process.execPath, ['bin/onboarder.js', 'review', root, '--ai', '--json'], { env }), error => {
    const report = JSON.parse(error.stdout); assert.equal(error.code, 2); assert.equal(report.ai.status, 'not-configured'); return true;
  });
});
