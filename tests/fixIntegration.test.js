import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from '../server/index.js';
import { openSession } from '../server/sessions.js';
import { fixFixture, proposalResponse, bad, git } from './helpers/fixFixture.mjs';
import { runReview } from '../server/review.js';
import { applyFix, verifyFix, fixStatus, acceptFix } from '../server/fixEngine.js';
import { fixture as contextualFixture, authFinding, contextFrom, response as reviewResponse } from './helpers/contextualReview.mjs';
import { applyAIReview } from '../server/reviewAI.js';
import { proposeFix } from '../server/fixProposal.js';
import { FixStore } from '../server/fixStore.js';
const execute = promisify(execFile);
async function listen(t, server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }); return 'http://127.0.0.1:' + server.address().port; }

test('HTTP browser lifecycle enforces AI opt-in, exact approval and session identity, executes real checks and accepts result', async t => {
  const f = await fixFixture(t); let calls = 0;
  const server = createServer({ fixStore: f.store, reviewComplete: async messages => { calls++; return proposalResponse(messages); } });
  const url = await listen(t, server), scanId = openSession({ root: f.root }), ownerToken = '12345678-1234-1234-1234-123456789abc';
  const post = async (body, headers = {}) => {
    const res = await fetch(url + '/api/intelligence/fix', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ scanId, ownerToken, ...body }) });
    return { status: res.status, ...(await res.json()) };
  };
  assert.equal((await post({ action: 'propose', report: f.report, findingId: f.finding.id })).status, 400); assert.equal(calls, 0);
  const result = await post({ action: 'propose', ai: true, report: f.report, findingId: f.finding.id }); assert.equal(result.status, 200, JSON.stringify(result)); const p = result.proposal;
  assert.equal(await readFile(path.join(f.root, 'codec.js'), 'utf8'), bad); assert.equal(calls, 1);
  assert.equal((await post({ action: 'apply', proposalId: p.id })).status, 400);
  assert.equal((await post({ action: 'apply', proposalId: p.id, approvalDigest: p.digest, ownerToken: '00000000-0000-0000-0000-000000000000' })).status, 400);
  assert.equal((await post({ action: 'apply', proposalId: p.id, approvalDigest: p.digest }, { origin: 'https://attacker.invalid' })).status, 403);
  const applied = await post({ action: 'apply', proposalId: p.id, approvalDigest: p.digest }); assert.equal(applied.run.status, 'applied', JSON.stringify(applied));
  const run = applied.run;
  const skipped = await post({ action: 'verify', runId: run.id, checks: ['test'] }); assert.equal(skipped.run.status, 'inconclusive'); assert.ok(skipped.run.checks.every(c => c.status === 'skipped'));
  const verified = await post({ action: 'verify', runId: run.id, allowChecks: true, trustWorktree: true, checkDigest: run.checkPlan.digest, checks: ['node-test:codec.test.js'] });
  assert.equal(verified.run.status, 'verified-by-checks', JSON.stringify(verified));
  assert.deepEqual(verified.run.checks.map(c => c.status), ['failed', 'passed']); assert.equal(calls, 1);
  const accepted = await post({ action: 'accept', runId: run.id, sourceFingerprint: verified.run.resultFingerprint }); assert.equal(accepted.run.status, 'accepted');
  assert.equal(await readFile(path.join(f.root, 'codec.js'), 'utf8'), bad);
});
test('packaged-compatible CLI persists proposals across processes, requires approval and executes checks with JSON receipts', async t => {
  const f = await fixFixture(t); let calls = 0;
  const provider = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const value = JSON.parse(body); calls++; const answer = proposalResponse(value.messages);
    assert.equal(body.includes('fixture-provider-secret'), false);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: answer.text }, finish_reason: 'stop' }], usage: { prompt_tokens: 222, completion_tokens: 111 } }));
  });
  const url = await listen(t, provider), env = { ...process.env, ONBOARDER_AGENT_HOME: f.store.home, ONBOARDER_CONFIG: path.join(f.parent, 'private-settings.json'), ONBOARDER_AI_BASE_URL: url + '/v1', ONBOARDER_AI_MODEL: 'mock-fix-model', ONBOARDER_AI_API_KEY: 'fixture-provider-secret' };
  const cli = async (action, flags = []) => JSON.parse((await execute(process.execPath, [process.env.ONBOARDER_TEST_CLI || 'bin/onboarder.js', 'fix', action, f.root, '--json', ...flags], { cwd: process.cwd(), env, timeout: 30000, maxBuffer: 2 * 1024 * 1024 })).stdout);
  const p = await cli('propose', ['--finding', f.finding.id]); assert.equal(p.status, 'proposed'); assert.equal(p.usage.inputTokens, 222);
  assert.equal((await cli('show', ['--proposal', p.id])).digest, p.digest);
  await assert.rejects(cli('apply', ['--proposal', p.id, '--yes']), e => e.code === 2 && /explicitly pass/.test(JSON.parse(e.stdout).error));
  const run = await cli('apply', ['--proposal', p.id, '--approve', p.digest]); assert.equal(run.status, 'applied');
  const verified = await cli('verify', ['--run', run.id, '--allow-checks', '--trust-worktree', '--check', 'node-test:codec.test.js', '--check-digest', run.checkPlan.digest]);
  assert.equal(verified.status, 'verified-by-checks'); assert.equal((await cli('status', ['--run', run.id])).status, 'verified-by-checks');
  assert.equal(calls, 1); assert.equal(JSON.stringify(verified).includes('fixture-provider-secret'), false);
  assert.equal((await cli('rollback', ['--run', run.id])).status, 'rolled-back');
});
test('staged and committed range proposals use exact reviewed source while preserving newer working changes', async t => {
  for (const mode of ['staged', 'range']) {
    const f = await fixFixture(t); git(f.root, 'add', '.'); const base = git(f.root, 'rev-parse', 'HEAD');
    if (mode === 'range') git(f.root, '-c', 'user.name=Fix', '-c', 'user.email=fix@example.invalid', 'commit', '-qm', 'bug');
    const report = await runReview(f.root, { mode, base, head: mode === 'range' ? 'HEAD' : '' });
    await writeFile(path.join(f.root, 'codec.js'), 'newer uncommitted work\n');
    const p = await f.propose({ ...{ complete: async messages => proposalResponse(messages) } }).catch(() => null);
    assert.equal(p, null); // Original working comparison is stale.
    const q = await (await import('../server/fixProposal.js')).proposeFix(f.root, f.owner, report, report.findings[0].id, { store: f.store, complete: async messages => proposalResponse(messages) });
    const run = await applyFix(f.identity, q.id, q.digest); assert.equal(run.status, 'applied', run.message);
    assert.equal(await readFile(path.join(f.root, 'codec.js'), 'utf8'), 'newer uncommitted work\n');
  }
});
test('cancelled checks retain receipts and can resume with new explicit permission', async t => {
  const f = await fixFixture(t, { scripts: { test: 'node -e "setTimeout(()=>{},5000)"' } }), p = await f.propose(), run = await applyFix(f.identity, p.id, p.digest);
  const abort = new AbortController(); const promise = verifyFix(f.identity, run.id, { allowChecks: true, trustWorktree: true, checks: ['test'], checkDigest: run.checkPlan.digest }, abort.signal);
  const poll = setInterval(async () => { const current = await fixStatus(f.identity, run.id); if (current.activity.some(a => a.event === 'Running baseline check: test')) abort.abort(); }, 20);
  let result; try { result = await promise; } finally { clearInterval(poll); }
  assert.equal(result.status, 'inconclusive'); assert.ok(result.checks.some(c => c.status === 'cancelled'));
  const resumed = await verifyFix(f.identity, run.id, { allowChecks: true, trustWorktree: true, checks: ['node-test:codec.test.js'], checkDigest: run.checkPlan.digest });
  assert.equal(resumed.status, 'verified-by-checks', resumed.message);
  assert.equal((await acceptFix(f.identity, run.id, resumed.resultFingerprint)).status, 'accepted');
});
test('Phase 2 cross-file authorization inference generates a caller fix with real failing/passing regression tests', async t => {
  const { root } = await contextualFixture(t, { language: 'javascript' });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(path.join(root, 'tests/auth.test.js'), 'import {test} from "node:test"; import assert from "node:assert/strict"; import {adminRoute} from "../route.js";\ntest("anonymous route rejected",async()=>assert.equal((await adminRoute(undefined)).status,403));\n');
  const report = await runReview(root);
  await applyAIReview(root, report, { complete: async messages => reviewResponse([authFinding(contextFrom(messages))]) });
  assert.equal(report.ai.accepted, 1);
  const finding = report.findings.find(f => f.source === 'ai'), store = new FixStore(path.join(root, '..', path.basename(root) + '-agent'));
  t.after(() => (import('node:fs/promises')).then(fs => fs.rm(store.home, { force: true, recursive: true })));
  const identity = { root, owner: 'cross-file-owner', store };
  const proposal = await proposeFix(root, identity.owner, report, finding.id, { store, complete: async messages => {
    const payload = JSON.parse(messages.at(-1).content.replace(/^UNTRUSTED_FIX_CONTEXT_JSON\n/, '')); const caller = payload.editableFiles.find(f => f.path === 'route.js');
    return { text: JSON.stringify({ schemaVersion: 1, edits: [{ path: caller.path, beforeHash: caller.beforeHash, after: caller.text.replace('export function adminRoute', 'export async function adminRoute').replace('!authorize(user)', '!(await authorize(user))') }],
      rationale: 'Await the authorization Promise before deciding route access.', sideEffects: ['The route now returns a Promise.'], affectedDependencies: ['route.js caller contract'], breakingChanges: ['Route callers must await its result.'],
      tests: ['Anonymous route regression test'], risk: 'medium', investigationRequired: false }) };
  } });
  const run = await applyFix(identity, proposal.id, proposal.digest); assert.equal(run.status, 'applied', run.message);
  const result = await verifyFix(identity, run.id, { allowChecks: true, trustWorktree: true, checks: ['node-test:tests/auth.test.js'], checkDigest: run.checkPlan.digest });
  assert.equal(result.status, 'verified-by-checks', result.message); assert.deepEqual(result.checks.map(c => c.status), ['failed', 'passed']);
  assert.ok(result.comparison.unresolved.some(f => f.id === finding.id)); // Disappearance is not behavioral proof.
});
