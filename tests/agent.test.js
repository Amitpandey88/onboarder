import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runProcess, redact, terminalText } from '../cli/agent/process.js';
import { readAgentFile, writeAgentFile, deleteAgentFile, FILE_LIMIT, safeRelative } from '../cli/agent/files.js';
import { GithubClient, positiveId, repositoryFromRemote, githubToken } from '../cli/agent/github.js';
import { setupAgent, prepareAgentProfile, runtimePaths } from '../cli/agent/config.js';
import { GithubSourceReader } from '../cli/agent/gitSource.js';
import { createAgentDispatcher, scopedTools } from '../cli/agent/mcp.js';
import { createAgentTools } from '../cli/agent/tools.js';
import { runAgent, savedRun } from '../cli/agent/runner.js';
import { parseAgentEvent } from '../cli/agent/protocol.js';

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-agent-test-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'repo'), home = path.join(temp, 'home');
  await fs.mkdir(root); await fs.writeFile(path.join(root, 'app.ts'), 'export const value = 1;\n');
  const git = args => runProcess('git', ['-C', root, ...args], { timeoutMs: 10000 });
  await git(['init', '-b', 'main']); await git(['add', '.']);
  assert.equal((await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture'])).code, 0);
  await git(['remote', 'add', 'origin', 'https://github.com/fixture/repo.git']);
  const env = { ...process.env, HERMES_HOME: path.join(temp, 'hermes-install'), GITHUB_TOKEN: '', GH_TOKEN: '' };
  const manifest = { schemaVersion: 1, id: randomUUID(), mode: 'ask', sourceRoot: await fs.realpath(root), root: await fs.realpath(root), repository: 'fixture/repo', remote: 'https://github.com/fixture/repo.git', branch: null, baseBranch: 'main', task: 'Explain this repository', permissions: { files: false, checks: false, github: false }, startedAt: new Date().toISOString(), timeoutSeconds: 30, maxTurns: 4, auditFile: path.join(temp, 'audit.jsonl') };
  return { temp, root: manifest.root, home, env, manifest, git };
}
test('agent file tools refuse traversal, credential paths and symlinks; fresh hashes protect edits', async t => {
  const { root, temp } = await fixture(t);
  for (const file of ['../outside', '/etc/passwd', 'a/../app.ts', '.env', '.env.production', '.git/config', 'node_modules/a.js', 'a.key', 'a\\b']) assert.throws(() => safeRelative(file));
  await fs.writeFile(path.join(temp, 'outside.txt'), 'private');
  if (process.platform !== 'win32') {
    await fs.symlink(path.join(temp, 'outside.txt'), path.join(root, 'linked.txt'));
    await assert.rejects(readAgentFile(root, 'linked.txt'), /symbolic/);
    await fs.symlink(temp, path.join(root, 'linked-dir'));
    await assert.rejects(writeAgentFile(root, 'linked-dir/new.ts', 'bad', 'new'), /symbolic/);
  }
  const read = await readAgentFile(root, 'app.ts');
  const write = await writeAgentFile(root, 'app.ts', 'export const value = 2;\n', read.sha256);
  assert.notEqual(write.sha256, read.sha256);
  await assert.rejects(writeAgentFile(root, 'app.ts', 'stale', read.sha256), /changed/);
  await assert.rejects(deleteAgentFile(root, 'app.ts', read.sha256), /changed/);
  await writeAgentFile(root, 'src/new.ts', 'new source', 'new');
  await assert.rejects(writeAgentFile(root, 'src/new.ts', 'overwritten', 'new'), /changed/);
  await deleteAgentFile(root, 'app.ts', write.sha256);
  assert.equal(await fs.readFile(path.join(root, 'src/new.ts'), 'utf8'), 'new source');
  await fs.writeFile(path.join(root, 'big.txt'), 'a'.repeat(FILE_LIMIT + 1));
  await fs.writeFile(path.join(root, 'binary.txt'), Buffer.from([0, 1, 2]));
  await assert.rejects(readAgentFile(root, 'big.txt'), /at most/);
  await assert.rejects(readAgentFile(root, 'binary.txt'), /binary/);
});
test('argument-array subprocess preserves arbitrary text and split Unicode, with bounded output and cancellation', async () => {
  const input = 'hello $(touch bad) `whoami` 😀';
  const lines = [];
  const output = await runProcess(process.execPath, ['-e', 'process.stdin.on("data", b => process.stdout.write(b));'], { input: input + '\n', onLine: line => lines.push(line) });
  assert.equal(output.stdout, input + '\n'); assert.deepEqual(lines, [input]);
  const unicode = await runProcess(process.execPath, ['-e', 'const b=Buffer.from("😀\\n"); process.stdout.write(b.subarray(0,2)); setTimeout(()=>process.stdout.write(b.subarray(2)),20);']);
  assert.equal(unicode.stdout, '😀\n');
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(2000)); setInterval(()=>{},100);'], { maxBytes: 1000 }), /output limit/);
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},100);'], { timeoutMs: 30 }), /time limit/);
  const abort = new AbortController(); const pending = runProcess(process.execPath, ['-e', 'setInterval(()=>{},100);'], { signal: abort.signal }); setTimeout(() => abort.abort(), 30);
  await assert.rejects(pending, /cancelled/);
  assert.equal(terminalText('\x1b[31mhello\x00\x1b[0m'), 'hello');
  assert.equal(redact('access=my-fixture-secret', { GITHUB_TOKEN: 'my-fixture-secret' }), 'access=[redacted]');
  assert.equal(redact('const token = response.token;\nfunction login(token: string) {}', {}), 'const token = response.token;\nfunction login(token: string) {}');
});
test('subprocess cleanup removes descendants even when the parent exits first', { skip: process.platform === 'win32' }, async () => {
  let pid;
  const code = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{}); setInterval(()=>{},100);'],{stdio:'ignore'}); setTimeout(()=>{console.log(child.pid); process.exit(0);},50);`;
  await runProcess(process.execPath, ['-e', code], { onLine: line => { pid = Number(line); } });
  assert.ok(pid > 0);
  // Reaping may take a brief scheduler tick on POSIX.
  let gone = false;
  for (let i = 0; i < 40 && !gone; i++) { try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 25)); } catch { gone = true; } }
  assert.equal(gone, true, 'No orphan check process remains');
});
test('GitHub identity and token parsing are strict and ignore unset MCP placeholders', () => {
  for (const remote of ['https://github.com/fixture/repo.git', 'git@github.com:fixture/repo.git', 'ssh://git@github.com/fixture/repo.git']) assert.equal(repositoryFromRemote(remote), 'fixture/repo');
  for (const remote of ['https://github.com.evil/fixture/repo', 'https://token@github.com/fixture/repo', 'https://github.com/../repo']) assert.equal(repositoryFromRemote(remote), null);
  assert.equal(githubToken({ GITHUB_TOKEN: '${GITHUB_TOKEN}', GH_TOKEN: 'actual-token' }), 'actual-token');
  assert.equal(positiveId('42', 'PR'), 42);
  for (const value of [true, [], {}, '', '1.5', 0, -1, Infinity, 2147483648]) assert.throws(() => positiveId(value, 'PR'));
  assert.throws(() => new GithubClient('../repo'));
});
test('GitHub client pins requests, authenticates, bounds lists and reports errors without credential leaks', async () => {
  const requests = [];
  const client = new GithubClient('fixture/repo', { token: 'fixture-key', fetchImpl: async (url, init) => {
    requests.push({ url, init }); return new Response(JSON.stringify([{ number: requests.length }]), { headers: { link: '<ignored>; rel="next"' } });
  } });
  const list = await client.list('/issues?state=open'); assert.equal(list.items.length, 2); assert.equal(list.truncated, true);
  assert.match(requests[0].url, /^https:\/\/api.github.com\/repos\/fixture\/repo\/issues\?/);
  assert.equal(requests[0].init.headers.authorization, 'Bearer fixture-key'); assert.equal(requests[0].init.redirect, 'error');
  for (const route of ['https://evil', '/../other', '/%2e%2e/other', '/a\\b', '/a#b']) await assert.rejects(client.request(route), /route/);
  for (const status of [401, 403, 404, 422, 500]) {
    const denied = new GithubClient('fixture/repo', { fetchImpl: async () => new Response('secret response', { status }) });
    await assert.rejects(denied.request(''), e => !e.message.includes('secret response'));
  }
  const oversized = new GithubClient('fixture/repo', { fetchImpl: async () => new Response('{}', { headers: { 'content-length': String(3 * 1024 * 1024) } }) });
  await assert.rejects(oversized.request(''), /size limit/);
  const malformed = new GithubClient('fixture/repo', { fetchImpl: async () => new Response('not json') });
  await assert.rejects(malformed.request(''), /unreadable/);
});
test('dedicated setup preserves model configuration and never writes an API key', async t => {
  const { home, env } = await fixture(t);
  const setup = await setupAgent(home, { ...env, ONBOARDER_AI_BASE_URL: 'http://localhost:11434/v1', ONBOARDER_AI_MODEL: 'fixture-model', ONBOARDER_AI_API_KEY: 'private-api-key' });
  const config = await fs.readFile(setup.configFile, 'utf8'); assert.ok(!config.includes('private-api-key'));
  const parsed = JSON.parse(config); assert.equal(parsed.model.provider, 'custom'); assert.equal(parsed.mcp_servers.onboarder.args[0], runtimePaths(home, env).server);
  await fs.writeFile(setup.configFile, 'model:\n  default: user-choice\n');
  await setupAgent(home, env); assert.equal(await fs.readFile(setup.configFile, 'utf8'), 'model:\n  default: user-choice\n');
  if (process.platform !== 'win32') assert.equal((await fs.stat(setup.configFile)).mode & 0o777, 0o600);
});
test('profile preparation repairs stale MCP paths while retaining the selected model', async t => {
  const { home, env } = await fixture(t);
  const setup = await setupAgent(home, env), config = JSON.parse(await fs.readFile(setup.configFile, 'utf8'));
  config.model = { provider: 'custom', default: 'user-model', base_url: 'https://example.invalid/v1' };
  config.mcp_servers.onboarder.args = ['/obsolete/stdio.js'];
  await fs.writeFile(setup.configFile, JSON.stringify(config));
  await prepareAgentProfile(home, env);
  const refreshed = JSON.parse(await fs.readFile(setup.configFile, 'utf8'));
  assert.deepEqual(refreshed.model, config.model); assert.deepEqual(refreshed.mcp_servers.onboarder.args, [setup.server]);
});
test('scoped MCP rejects root overrides, checks and all write operations by default; audit stores metadata', async t => {
  const { manifest } = await fixture(t);
  let fetched = 0;
  const client = new GithubClient('fixture/repo', { fetchImpl: async () => { fetched++; return new Response('{}'); } });
  const dispatch = createAgentDispatcher(manifest, { client });
  const call = (name, args) => dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const tools = scopedTools(manifest); assert.ok(tools.length > 25);
  assert.ok(tools.every(t => !Object.hasOwn(t.inputSchema.properties, 'path')));
  assert.ok(!tools.some(t => t.name === 'onboarder_deep_analysis' || t.name === 'onboarder_read_file'));
  assert.equal((await call('onboarder_scan', { path: '/tmp/elsewhere' })).result.isError, true);
  assert.equal((await call('onboarder_agent_write_file', { file: 'a.ts', content: 'bad', expectedSha256: 'new' })).result.isError, true);
  assert.equal((await call('onboarder_agent_run_check', { check: 'test' })).result.isError, true);
  assert.equal((await call('onboarder_agent_deep_analysis', { tools: ['gitleaks'] })).result.isError, true);
  assert.equal((await call('onboarder_agent_deep_analysis', { path: '/tmp/elsewhere' })).result.isError, true);
  assert.equal((await call('github_comment', { number: 1, body: 'private comment' })).result.isError, true);
  assert.equal(fetched, 0);
  const context = await call('onboarder_agent_context', {}); assert.equal(context.result.structuredContent.repository, 'fixture/repo');
  const scan = await call('onboarder_scan', {}); assert.equal(scan.result.isError, false);
  const audit = await fs.readFile(manifest.auditFile, 'utf8'); assert.ok(!audit.includes('private comment')); assert.ok(!audit.includes('bad')); assert.match(audit, /github_comment/);
});
test('Hermes deep-analysis tools expose shared settings and pin execution to the task workspace', { skip: process.platform === 'win32' }, async t => {
  const { manifest, temp, root } = await fixture(t);
  const bin = path.join(temp, 'bin'); await fs.mkdir(bin);
  const argvFile = path.join(temp, 'analyzer-args.json');
  await fs.writeFile(path.join(bin, 'gitleaks'), `#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);fs.writeFileSync(${JSON.stringify(argvFile)},JSON.stringify(args));fs.writeFileSync(args[args.indexOf('--report-path')+1],'[]');`, { mode: 0o700 });
  const { clearDetectionCache } = await import('../server/tools.js');
  const before = process.env.PATH; process.env.PATH = bin; clearDetectionCache();
  t.after(() => { process.env.PATH = before; clearDetectionCache(); });
  manifest.permissions.checks = true;
  const dispatch = createAgentDispatcher(manifest);
  const call = (name, args) => dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const status = await call('onboarder_agent_engines', {});
  assert.equal(status.result.isError, false); assert.ok(status.result.structuredContent.gitleaks.options.some(option => option.key === 'history'));
  const report = await call('onboarder_agent_deep_analysis', { tools: ['gitleaks'], options: { gitleaks: { history: true } } });
  assert.equal(report.result.isError, false); assert.equal(report.result.structuredContent.ranCount, 1);
  const args = JSON.parse(await fs.readFile(argvFile, 'utf8')); assert.equal(args[args.indexOf('--source') + 1], root); assert.ok(!args.includes('--no-git'));
  assert.equal((await call('onboarder_agent_deep_analysis', { tools: ['arbitrary-command'] })).result.isError, true);
  assert.equal((await call('onboarder_agent_deep_analysis', { tools: [] })).result.isError, true);
  assert.equal((await call('onboarder_agent_deep_analysis', { tools: ['gitleaks'], path: '/etc' })).result.isError, true);
});
test('GitHub writes require capability and identical successful operations are not duplicated', async t => {
  const { manifest } = await fixture(t); manifest.permissions.github = true;
  const requests = [];
  const client = new GithubClient('fixture/repo', { fetchImpl: async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify({ id: 123, html_url: 'https://github.com/fixture/repo/issues/1#issuecomment-123' })); } });
  const tools = createAgentTools(manifest, { client }), comment = tools.find(t => t.name === 'github_comment');
  const args = { number: 1, body: 'Please inspect the diff.' };
  await comment.run(args); const second = await comment.run(args); assert.equal(second.replayed, true); assert.equal(requests.length, 1);
  assert.equal(requests[0].init.method, 'POST'); assert.equal(JSON.parse(requests[0].init.body).body, args.body);
  await assert.rejects(tools.find(t => t.name === 'github_draft_pr').run({ title: 'Test', body: 'Test' }), /isolated/);
});
test('PR review submissions refuse a stale head and bind successful reviews to the inspected commit', async t => {
  const { manifest } = await fixture(t); manifest.permissions.github = true;
  const sha = 'b'.repeat(40), requests = [];
  const client = new GithubClient('fixture/repo', { fetchImpl: async (url, init) => {
    requests.push({ url, init }); return new Response(JSON.stringify(init.method === 'GET' ? { head: { sha } } : { id: 1 }));
  } });
  const review = createAgentTools(manifest, { client }).find(t => t.name === 'github_submit_review');
  await assert.rejects(review.run({ number: 1, body: 'Reviewed', expectedHeadSha: 'a'.repeat(40) }), /head changed/);
  assert.equal(requests.filter(r => r.init.method === 'POST').length, 0);
  await review.run({ number: 1, body: 'Reviewed', expectedHeadSha: sha });
  const body = JSON.parse(requests.find(r => r.init.method === 'POST').init.body); assert.equal(body.commit_id, sha); assert.equal(body.event, 'COMMENT');
});
test('PR tools report missing patch coverage and use checks from the exact PR head', async t => {
  const { manifest } = await fixture(t), sha = 'a'.repeat(40), routes = [];
  const client = new GithubClient('fixture/repo', { fetchImpl: async url => {
    routes.push(url); let data = { head: { sha }, changed_files: 2 };
    if (url.includes('/files')) data = [{ filename: 'app.ts', patch: '@@ -1 +1 @@\n-old\n+new' }, { filename: 'image.png' }];
    if (url.includes('/check-runs')) data = { total_count: 1, check_runs: [{ conclusion: 'success' }] };
    if (url.includes('/status')) data = { state: 'success' };
    return new Response(JSON.stringify(data));
  } });
  const tools = createAgentTools(manifest, { client });
  const pr = await tools.find(t => t.name === 'github_get_pr').run({ number: 3 });
  assert.equal(pr.files.items.length, 2); assert.equal(pr.missingPatches, 1);
  const checks = await tools.find(t => t.name === 'github_pr_checks').run({ number: 3 });
  assert.equal(checks.sha, sha); assert.ok(routes.some(r => r.includes(`/commits/${sha}/check-runs`)));
});
test('exact-commit GitHub reads verify Git modes, cache trees, and refuse symlinks and truncated coverage', async () => {
  const sha = 'a'.repeat(40), tree = 'b'.repeat(40), blob = 'c'.repeat(40), text = 'export const head = true;\n';
  let mode = '100644', truncated = false, requests = [];
  const client = new GithubClient('fixture/repo', { fetchImpl: async url => {
    requests.push(url); let data;
    if (url.endsWith(`/git/commits/${sha}`)) data = { tree: { sha: tree } };
    else if (url.endsWith(`/git/trees/${tree}`)) data = { tree: [{ path: 'app.ts', type: 'blob', mode, sha: blob, size: Buffer.byteLength(text) }], truncated };
    else if (url.endsWith(`/git/blobs/${blob}`)) data = { encoding: 'base64', content: Buffer.from(text).toString('base64'), size: Buffer.byteLength(text) };
    else throw new Error('Unexpected route: ' + url);
    return new Response(JSON.stringify(data));
  } });
  const reader = new GithubSourceReader(client), first = await reader.read('app.ts', sha);
  assert.equal(first.content, text); assert.equal(first.commitSha, sha); assert.equal(first.blobSha, blob);
  await reader.read('app.ts', sha); assert.equal(requests.filter(r => r.endsWith(`/git/trees/${tree}`)).length, 1);
  await assert.rejects(reader.read('.env', sha), /scope/);
  await assert.rejects(reader.read('app.ts', 'main'), /exact/);
  mode = '120000'; requests = [];
  await assert.rejects(new GithubSourceReader(client).read('app.ts', sha), /symlink/);
  assert.ok(!requests.some(r => r.includes('/git/blobs/')));
  truncated = true; mode = '100644';
  await assert.rejects(new GithubSourceReader(client).read('app.ts', sha), /coverage/);
});
test('structured event validation refuses fake completion and corrupt frames', () => {
  for (const frame of ['not json', '{}', '[]', '{"type":"result","text":"done"}', '{"type":"result","text":"done","exit_code":0,"tokens":{"total":-1}}']) assert.throws(() => parseAgentEvent(frame));
  assert.equal(parseAgentEvent('{"type":"result","text":"done","exit_code":0}').text, 'done');
});
test('agent stdio speaks valid MCP and rejects malformed writable manifests', async t => {
  const { temp, manifest, env, home } = await fixture(t);
  manifest.auditFile = path.join(temp, 'audit.jsonl');
  const manifestFile = path.join(temp, 'manifest.json');
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'onboarder_agent_read_file', arguments: { file: 'app.ts' } } },
  ];
  const run = () => runProcess(process.execPath, [runtimePaths(home).server], { env: { ...env, ONBOARDER_AGENT_RUN: manifestFile }, input: messages.map(m => JSON.stringify(m)).join('\n') + '\n', timeoutMs: 10000 });
  const output = await run(); assert.equal(output.code, 0);
  const replies = output.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(replies.map(r => r.id), [1, 2, 3]); assert.equal(replies[2].result.isError, false); assert.match(replies[2].result.structuredContent.content, /value = 1/);
  manifest.permissions.files = true;
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  const denied = await run(); assert.equal(denied.code, 1); assert.equal(denied.stdout, ''); assert.match(denied.stderr, /Invalid writable/);
});
test('agent dry-run has no profile, run, worktree or model side effects', async t => {
  const { root, home, env, git } = await fixture(t);
  let executions = 0;
  const plan = await runAgent({ root, mode: 'implement', task: 'Change value', dryRun: true }, { home, env, execute: async () => { executions++; throw new Error('must not execute'); } });
  assert.equal(plan.isolatedWorkspace, true); assert.equal(executions, 0);
  assert.equal(await fs.access(home).then(() => true).catch(() => false), false);
  assert.equal((await git(['worktree', 'list', '--porcelain'])).stdout.match(/^worktree /gm).length, 1);
});
test('CLI exposes agent help and parses a scoped PR plan without executing a model', async t => {
  const { root, home, env } = await fixture(t), entry = new URL('../bin/onboarder.js', import.meta.url);
  const help = await runProcess(process.execPath, [entry.pathname, 'agent', '--help'], { env }); assert.equal(help.code, 0); assert.match(help.stdout, /Hermes/); assert.match(help.stdout, /allow-github-writes/);
  const output = await runProcess(process.execPath, [entry.pathname, 'agent', 'pr', root, '--task', 'Fix the bug', '--base', 'main', '--allow-checks', '--dry-run', '--json'], { env: { ...env, ONBOARDER_AGENT_HOME: home } });
  assert.equal(output.code, 0, output.stderr); const plan = JSON.parse(output.stdout); assert.equal(plan.baseBranch, 'main'); assert.equal(plan.permissions.github, false); assert.equal(plan.permissions.checks, true);
});
test('implementation runs in a worktree, preserves dirty source, and saves structured results', async t => {
  const { root, home, env, git } = await fixture(t);
  await fs.writeFile(path.join(root, 'app.ts'), 'dirty source');
  const execute = async (_command, args, options) => {
    assert.ok(args.includes('stream-json')); assert.ok(args.includes('--query-file')); assert.equal(args[args.indexOf('--query-file') + 1], '-');
    assert.notEqual(options.cwd, root); assert.match(await fs.readFile(path.join(options.cwd, 'app.ts'), 'utf8'), /value = 1/);
    await fs.writeFile(path.join(options.cwd, 'app.ts'), 'changed in worktree');
    options.onLine('{"type":"system","subtype":"init","session_id":"fixture-session"}');
    options.onLine('{"type":"result","text":"Implemented","session_id":"fixture-session","exit_code":0,"tokens":{"total":20}}');
    return { code: 0, stdout: '', stderr: '' };
  };
  const result = await runAgent({ root, mode: 'implement', task: 'Change value' }, { home, env, execute });
  assert.equal(result.status, 'completed'); assert.match(result.branch, /^codex\/agent-/);
  assert.equal(await fs.readFile(path.join(root, 'app.ts'), 'utf8'), 'dirty source');
  assert.equal((await savedRun(result.id, home)).result.sessionId, 'fixture-session');
  assert.equal(await fs.readFile(path.join(result.workspace, 'app.ts'), 'utf8'), 'changed in worktree');
  await git(['worktree', 'remove', '--force', result.workspace]);
});
test('missing completion, nonzero exit, timeouts and cancellation remain failed/cancelled saved runs', async t => {
  const { root, home, env } = await fixture(t);
  for (const kind of ['missing', 'nonzero', 'timeout', 'after-result']) {
    const execute = async (_command, _args, options) => {
      if (kind === 'timeout') throw new Error('time limit');
      if (kind !== 'missing') options.onLine('{"type":"result","text":"Done","exit_code":0}');
      if (kind === 'after-result') options.onLine('{"type":"text","text":"extra"}');
      return { code: kind === 'nonzero' ? 1 : 0, stdout: '', stderr: '' };
    };
    const result = await runAgent({ root, mode: 'ask', task: 'Explain' }, { home, env, execute });
    assert.equal(result.status, 'failed', kind); assert.equal((await savedRun(result.id, home)).result.status, 'failed');
  }
  const abort = new AbortController();
  const result = await runAgent({ root, mode: 'ask', task: 'Explain' }, { home, env, signal: abort.signal, execute: async () => { abort.abort(); throw new Error('cancelled'); } });
  assert.equal(result.status, 'cancelled');
});
test('resume stays in the original workspace and refuses permission expansion or repository changes', async t => {
  const { root, home, env } = await fixture(t);
  const execute = async (_command, _args, opts) => { opts.onLine('{"type":"result","text":"Done","session_id":"resume-session","exit_code":0}'); return { code: 0, stdout: '', stderr: '' }; };
  const initial = await runAgent({ root, mode: 'ask', task: 'Explain' }, { home, env, execute });
  await assert.rejects(runAgent({ root, mode: 'ask', task: 'Continue', resume: initial.id, allowGithubWrites: true }, { home, env, execute }), /expand/);
  const resumed = await runAgent({ root, mode: 'ask', task: 'Continue', resume: initial.id }, { home, env, execute: async (command, args, opts) => { assert.ok(args.includes('--no-restore-cwd')); assert.ok(args.includes('resume-session')); return execute(command, args, opts); } });
  assert.equal(resumed.status, 'completed'); assert.equal(resumed.workspace, initial.workspace);
  await assert.rejects(savedRun('../escape', home), /full run ID/);
});
