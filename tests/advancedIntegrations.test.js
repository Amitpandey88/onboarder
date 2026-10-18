import http from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { TeamDirectory, authorizeMember, memberCookie } from '../server/intelligence/team.js';
import { GithubAutomation, verifyWebhook, appJwt } from '../server/intelligence/githubAutomation.js';
import { createServer, CONFIG } from '../server/index.js';
import { normalizeSettings } from '../server/config.js';
import { openSession } from '../server/sessions.js';
import { createCheckpoint, restoreCheckpoint } from '../cli/agent/checkpoints.js';
import { readAgentFile, writeAgentFile } from '../cli/agent/files.js';
import { parseTelemetry } from '../shared/intelligence/telemetry.js';
import { handleFix } from '../server/apiFix.js';
import { runAgent } from '../cli/agent/runner.js';
import { createAgentTools } from '../cli/agent/tools.js';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';

async function temp(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-advanced-integration-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
test('named members have hashed credentials, exact repository grants, revocable signed sessions', async t => {
  const root = await temp(t); const team = new TeamDirectory(path.join(root, 'team.json'));
  const created = await team.add('Reviewer', 'reviewer', [root]);
  assert.equal((await readFile(team.file, 'utf8')).includes(created.token), false);
  const member = await team.authenticate(created.token); assert.equal(member.name, 'Reviewer');
  const cookie = memberCookie(member, 'test-signing-key', true);
  assert.ok(cookie.includes('HttpOnly')); assert.ok(cookie.includes('Secure')); assert.equal(cookie.includes(created.token), false);
  const req = { headers: { cookie } };
  assert.equal((await team.fromRequest(req, 'test-signing-key')).id, created.id);
  assert.equal(await team.fromRequest(req, 'rotated-key'), null);
  await team.revoke(created.id);
  assert.equal(await team.authenticate(created.token), null); assert.equal(await team.fromRequest(req, 'test-signing-key'), null);
});
test('member authorization checks every repository in a portfolio and excludes execution/settings', async t => {
  const root = await temp(t); const outside = await temp(t);
  const member = { roots: [await import('node:fs/promises').then(fs => fs.realpath(root))], role: 'viewer' };
  const sessions = { yes: root, no: outside };
  await assert.rejects(authorizeMember(member, '/api/settings', {}, new URLSearchParams(), id => sessions[id]), /settings/);
  await assert.rejects(authorizeMember(member, '/api/intelligence/fix', {}, new URLSearchParams(), id => sessions[id]), /execution/);
  await assert.rejects(authorizeMember(member, '/api/intelligence', { scanId: 'yes', action: 'portfolio', scanIds: ['yes', 'no'] }, new URLSearchParams(), id => sessions[id]), /outside/);
});
test('actual HTTP member routes enforce scope, roles, origin and revoked credentials', async t => {
  const root = await temp(t); await writeFile(path.join(root, 'app.ts'), 'export const hello = 1;\n');
  const teamFile = path.join(root, 'private', 'team.json'); const team = new TeamDirectory(teamFile);
  const viewer = await team.add('Viewer', 'viewer', [root]); const reviewer = await team.add('Reviewer', 'reviewer', [root]);
  const settings = normalizeSettings({ mode: 'self-hosted', host: '127.0.0.1', domain: 'onboarder.example', accessKey: 'owner-key-123456789012345678901234' });
  const server = createServer({ ...CONFIG, teamFile, getSettings: async () => settings });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const request = (endpoint, token, body, extra = {}) => new Promise((resolve, reject) => {
    const req = http.request(url + endpoint, { method: body ? 'POST' : 'GET', headers: { host: 'onboarder.example', authorization: 'Bearer ' + token,
      ...(body ? { 'content-type': 'application/json', origin: 'http://onboarder.example' } : {}), ...extra } }, response => {
      let raw = ''; response.setEncoding('utf8'); response.on('data', chunk => raw += chunk);
      response.on('end', () => resolve({ status: response.statusCode, json: async () => JSON.parse(raw), text: async () => raw, clone() { return this; } }));
    });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  assert.equal((await request('/api/settings', viewer.token)).status, 403);
  const scanned = await request('/api/scan', viewer.token, { path: root }); assert.equal(scanned.status, 200, await scanned.clone().text());
  const { scanId } = await scanned.json();
  assert.equal((await request('/api/file?scan=' + scanId + '&path=app.ts', viewer.token)).status, 200);
  assert.equal((await request('/api/file?scan=' + scanId + '&path=private/team.json', viewer.token)).status, 403);
  const reportResponse = await request('/api/intelligence', viewer.token, { scanId, action: 'refresh' }); assert.equal(reportResponse.status, 200);
  const report = await reportResponse.json(); assert.equal(report.snapshot.metrics.files, 1);
  const comment = { scanId, fingerprint: report.snapshot.fingerprint, text: 'Review the boundary before changing it.' };
  assert.equal((await request('/api/team/comments', viewer.token, comment)).status, 403);
  assert.equal((await request('/api/team/comments', reviewer.token, comment)).status, 200);
  const comments = await (await request('/api/team/comments?scan=' + scanId, viewer.token)).json();
  assert.equal(comments[0].author, 'Reviewer');
  assert.equal((await request('/api/intelligence', viewer.token, { scanId, action: 'refresh' }, { origin: 'https://evil.example' })).status, 403);
  const outside = await temp(t); const outsideId = openSession({ root: outside });
  assert.equal((await request('/api/file?scan=' + outsideId + '&path=app.ts', viewer.token)).status, 403);
  await team.revoke(viewer.id);
  assert.equal((await request('/api/team/me', viewer.token)).status, 401);
});
test('signed webhook validation uses exact bytes and rejects altered, weak or missing signatures', () => {
  const secret = 'fixture-webhook-secret-at-least-24-bytes'; const raw = Buffer.from('{"text":"नमस्ते"}');
  const signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifyWebhook(secret, raw, signature), true);
  assert.equal(verifyWebhook(secret, Buffer.from('{}'), signature), false);
  assert.equal(verifyWebhook('short', raw, signature), false);
  assert.equal(verifyWebhook(secret, raw, ''), false);
});
test('GitHub App JWT is an expiring, cryptographically valid RS256 signature', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = appJwt('123', privateKey.export({ type: 'pkcs8', format: 'pem' }), 100000);
  const [header, payload, signature] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
  const claims = JSON.parse(Buffer.from(payload, 'base64url')); assert.equal(claims.exp - claims.iat, 600);
  assert.equal(verify('RSA-SHA256', Buffer.from(header + '.' + payload), publicKey, Buffer.from(signature, 'base64url')), true);
});
async function automationFixture(t, publish = false, stale = false) {
  const root = await temp(t); const file = path.join(root, 'automation.json');
  await writeFile(file, JSON.stringify({ version: 1, publish, repositories: { 'fixture/repo': {} } }));
  const head = 'a'.repeat(40), base = 'b'.repeat(40); const writes = [];
  const client = {
    request: async (route, method = 'GET', body) => {
      if (method !== 'GET') { writes.push({ route, method, body }); return { data: { id: 42 } }; }
      if (route.includes('/check-runs')) return { data: { check_runs: [] } };
      return { data: { state: 'open', head: { sha: stale ? 'c'.repeat(40) : head }, base: { sha: base } } };
    },
    list: async () => ({ items: [{ filename: 'app.ts', status: 'modified', patch: '@@ -1 +1 @@\n-export const a = 1;\n+export const a = eval("1");' }], truncated: false }),
  };
  const automation = new GithubAutomation(file, 'fixture-secret-long-enough-for-tests', () => client);
  const payload = { action: 'synchronize', repository: { full_name: 'fixture/repo' }, number: 3, pull_request: { head: { sha: head }, base: { sha: base, repo: { full_name: 'fixture/repo' } } } };
  return { automation, payload, writes };
}
test('webhook jobs persist, deduplicate and analyze offline without publication by default', async t => {
  const { automation, payload, writes } = await automationFixture(t);
  const receipt = await automation.accept('pull_request', payload); await automation.idle();
  const duplicate = await automation.accept('pull_request', payload);
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.id, receipt.id);
  const job = (await automation.jobs())[0]; assert.equal(job.status, 'completed'); assert.ok(job.report.findings.some(f => f.rule === 'eval'));
  assert.equal(writes.length, 0);
});
test('explicitly enabled publication targets the verified PR head and preserves check identity', async t => {
  const { automation, payload, writes } = await automationFixture(t, true);
  await automation.accept('pull_request', payload); await automation.idle();
  assert.equal(writes.length, 1); assert.equal(writes[0].route, '/check-runs');
  assert.equal(writes[0].body.head_sha, payload.pull_request.head.sha);
  assert.equal(writes[0].body.conclusion, 'failure'); assert.ok(writes[0].body.external_id);
});
test('stale PR heads never publish results', async t => {
  const { automation, payload, writes } = await automationFixture(t, true, true);
  await automation.accept('pull_request', payload); await automation.idle();
  assert.equal((await automation.jobs())[0].status, 'stale'); assert.equal(writes.length, 0);
});
test('checkpoints restore selected worktree files, protect newer edits and remove newly created files', async t => {
  const root = await temp(t); await mkdir(path.join(root, 'run'));
  await writeFile(path.join(root, 'app.ts'), 'original\n');
  const manifest = { root, sourceRoot: path.dirname(root), branch: 'codex/test', permissions: { files: true }, auditFile: path.join(root, 'run', 'audit.jsonl') };
  const checkpoint = await createCheckpoint(manifest, ['app.ts', 'new.ts']);
  const original = await readAgentFile(root, 'app.ts');
  await writeAgentFile(root, 'app.ts', 'changed\n', original.sha256);
  await writeAgentFile(root, 'new.ts', 'created\n', 'new');
  await assert.rejects(restoreCheckpoint(manifest, checkpoint.id, { 'app.ts': original.sha256, 'new.ts': 'new' }), /changed/);
  assert.equal(await readFile(path.join(root, 'app.ts'), 'utf8'), 'changed\n');
  const changed = await readAgentFile(root, 'app.ts'); const added = await readAgentFile(root, 'new.ts');
  await restoreCheckpoint(manifest, checkpoint.id, { 'app.ts': changed.sha256, 'new.ts': added.sha256 });
  assert.equal(await readFile(path.join(root, 'app.ts'), 'utf8'), 'original\n');
  await assert.rejects(readFile(path.join(root, 'new.ts')));
  await assert.rejects(createCheckpoint({ ...manifest, root: manifest.sourceRoot }, ['app.ts']), /isolated/);
});
test('OTLP import links observed services and discards arbitrary sensitive attributes', () => {
  const span = (spanId, parentSpanId) => ({ traceId: 'a'.repeat(32), spanId, parentSpanId, name: 'GET /users', startTimeUnixNano: '1000000', endTimeUnixNano: '3000000',
    attributes: [{ key: 'http.route', value: { stringValue: '/users' } }, { key: 'authorization', value: { stringValue: 'private-token' } }] });
  const value = { resourceSpans: [
    { resource: { attributes: [{ key: 'service.name', value: { stringValue: 'gateway' } }] }, scopeSpans: [{ spans: [span('b'.repeat(16), '')] }] },
    { resource: { attributes: [{ key: 'service.name', value: { stringValue: 'users' } }] }, scopeSpans: [{ spans: [span('c'.repeat(16), 'b'.repeat(16))] }] },
  ] };
  const result = parseTelemetry(JSON.stringify(value));
  assert.deepEqual(result.connections, [{ from: 'gateway', to: 'users', count: 1 }]);
  assert.equal(result.operations[0].durationMs, 2); assert.equal(JSON.stringify(result).includes('private-token'), false);
});
test('browser fix API runs the real isolated harness, creates checkpoints and records an executed passing test', async t => {
  const parent = await temp(t); const root = path.join(parent, 'repo'); await mkdir(root);
  const original = 'export const value = 1;\n';
  await writeFile(path.join(root, 'app.js'), original);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test app.test.js' } }));
  await writeFile(path.join(root, 'app.test.js'), 'import {test} from "node:test"; import assert from "node:assert/strict"; import {value} from "./app.js"; test("fixed value",()=>assert.equal(value,2));\n');
  const git = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' });
  git(['init', '-q', '-b', 'main']); git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'initial']);
  const scanId = openSession({ root });
  class Response extends EventEmitter {
    writableEnded = false;
    writeHead(status) { this.status = status; }
    end(value) { this.value = JSON.parse(value); this.writableEnded = true; }
  }
  const response = new Response();
  const execute = async request => {
    assert.equal(request.allowGithubWrites, false); assert.equal(request.allowChecks, true);
    return runAgent(request, { home: path.join(parent, 'agent'), env: { ...process.env, HERMES_HOME: path.join(parent, 'hermes') },
      execute: async (_command, _args, options) => {
        const manifest = JSON.parse(await readFile(options.env.ONBOARDER_AGENT_RUN, 'utf8'));
        const tools = new Map(createAgentTools(manifest).map(t => [t.name, t]));
        const before = await tools.get('onboarder_agent_read_file').run({ file: 'app.js' });
        const edit = await tools.get('onboarder_agent_write_file').run({ file: 'app.js', content: 'export const value = 2;\n', expectedSha256: before.sha256 });
        assert.ok(edit.checkpointId);
        const check = await tools.get('onboarder_agent_run_check').run({ check: 'test' });
        assert.equal(check.passed, true);
        options.onLine(JSON.stringify({ type: 'result', text: 'Controlled harness fixture applied the change and ran the real test.', session_id: 'fixture', exit_code: 0 }));
        return { code: 0, stdout: '', stderr: '' };
      } });
  };
  await handleFix(response, { scanId, task: 'Set the value to 2 and verify it.', allowChecks: true }, execute);
  assert.equal(response.status, 200, JSON.stringify(response.value));
  assert.equal(response.value.run.status, 'completed');
  assert.notEqual(response.value.run.workspace, root); assert.equal(response.value.checks[0].passed, true);
  assert.ok(response.value.checks[0].sourceAfter); assert.equal(await readFile(path.join(root, 'app.js'), 'utf8'), original);
  assert.ok(JSON.stringify(response.value.review.comparison).includes('value = 2'));
});
