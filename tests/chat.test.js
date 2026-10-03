import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChatController } from '../cli/chat/controller.js';
import { ChatStore } from '../cli/chat/store.js';
import { ChatRenderer } from '../cli/chat/render.js';
import { chatHelp, completeChat, slashInput } from '../cli/chat/commands.js';
import { runAgent } from '../cli/agent/runner.js';
import { runProcess } from '../cli/agent/process.js';
import { runChat } from '../cli/chat/app.js';
import { ChatSources, githubSource } from '../cli/chat/source.js';

async function fixture(t, overrides = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-chat-test-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = await fs.realpath(temp), home = path.join(root, 'private');
  await fs.writeFile(path.join(root, 'app.ts'), 'export const value = 1;\n');
  const git = args => runProcess('git', ['-C', root, ...args]);
  await git(['init', '-b', 'main']); await git(['add', 'app.ts']);
  assert.equal((await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture'])).code, 0);
  await git(['remote', 'add', 'origin', 'https://github.com/fixture/repo.git']);
  const env = { ...process.env, HERMES_HOME: path.join(root, 'hermes-install'), GITHUB_TOKEN: '', GH_TOKEN: '' };
  const events = [], requests = [];
  const execute = async (_command, args, options) => {
    options.onLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'fixture_chat_session' }));
    options.onLine(JSON.stringify({ type: 'text', text: 'Fixture answer\n' }));
    options.onLine(JSON.stringify({ type: 'result', text: 'Fixture answer\n', session_id: 'fixture_chat_session', exit_code: 0 }));
    return { code: 0, stdout: '', stderr: '' };
  };
  const store = new ChatStore(home, env);
  const controller = new ChatController({ root, mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 }, {
    output: e => events.push(e), store, runner: { home, env, execute },
    run: async (request, options) => { requests.push(request); return runAgent(request, options); }, ...overrides,
  });
  return { root, home, env, events, requests, store, controller };
}

test('chat follow-ups resume the real saved run, while mode, model and permissions changes reset it', async t => {
  const { controller: c, requests, store } = await fixture(t);
  await c.accept('Explain the code'); const first = c.record.lastRun;
  await c.accept('Where is that defined?'); assert.equal(requests[1].resume, first);
  await c.accept('/mode invalid'); assert.equal(c.settings.mode, 'ask'); assert.ok(c.record.lastRun);
  await c.accept('/mode review'); assert.equal(c.record.lastRun, null);
  await c.accept('/review 42 Focus on correctness'); assert.equal(requests.at(-1).pr, 42); assert.equal(requests.at(-1).task, 'Focus on correctness');
  await c.accept('Also check edge cases'); assert.ok(requests.at(-1).resume); assert.equal(requests.at(-1).pr, 42);
  await c.accept('/permissions github on'); assert.equal(c.record.lastRun, null);
  await c.accept('Post the findings'); assert.equal(requests.at(-1).allowGithubWrites, true); assert.equal(requests.at(-1).resume, undefined);
  await c.accept('/model fixture-model custom'); assert.equal(c.record.lastRun, null);
  await c.accept('Continue'); assert.equal(requests.at(-1).model, 'fixture-model'); assert.equal(requests.at(-1).provider, 'custom');
  const saved = await store.load(c.record.id); assert.equal(saved.turns.length, 6); assert.equal(saved.settings.pr, 42);
});

test('implementation follow-ups retain the isolated workspace and browsing inspects that workspace', async t => {
  const browsed = [];
  const { controller: c, root, requests } = await fixture(t, { browse: async (name, args, folder) => { browsed.push({ name, args, folder }); return 'diff'; } });
  await c.accept('/implement Change the value');
  const workspace = c.workspace, branch = c.lastResult.branch;
  assert.notEqual(workspace, root); assert.match(branch, /^codex\/agent-/);
  await fs.writeFile(path.join(workspace, 'app.ts'), 'export const value = 2;\n');
  await c.accept('Now explain the change'); assert.equal(c.workspace, workspace); assert.equal(c.lastResult.branch, branch); assert.ok(requests.at(-1).resume);
  await c.accept('/diff'); assert.equal(browsed[0].folder, workspace);
  assert.equal(await fs.readFile(path.join(root, 'app.ts'), 'utf8'), 'export const value = 1;\n');
  await c.accept('/new'); assert.equal(c.workspace, root); assert.equal(c.record.lastRun, null);
});

test('saved conversations restore sessions, require the same repository and never expand run permissions', async t => {
  const { controller: c, store, root, env, home } = await fixture(t);
  await c.accept('Question one'); const id = c.record.id, previousRun = c.record.lastRun;
  await c.accept('/new'); await c.accept('/resume ' + id);
  assert.equal(c.record.lastRun, previousRun); assert.equal(c.record.turns.length, 1);
  await c.accept('/permissions github on'); const current = c.record.id;
  await c.accept('/resume ' + id); assert.equal(c.record.id, current); assert.equal(c.settings.github, true); assert.equal(c.record.lastRun, null);
  const other = new ChatController({ root: path.dirname(root), mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 }, { output: () => {}, store, runner: { env, home } });
  await assert.rejects(other.resume(id), /another repository/);
  await assert.rejects(store.load('../escape'), /full run ID/);
  const record = await store.load(id); record.settings.mode = 'unknown'; await store.save(record);
  await assert.rejects(store.load(id), /invalid/);
});

test('multiline input preserves code and slash lines, bounds messages and discards cleanly', async t => {
  const { controller: c, requests } = await fixture(t);
  await c.accept('/paste'); await c.accept('Fix this:\n'); await c.accept('  const x = 1;'); await c.accept('/review 99');
  assert.equal(requests.length, 0); await c.accept('/send');
  assert.equal(requests[0].task, 'Fix this:\n\n  const x = 1;\n/review 99'); assert.equal(requests[0].mode, 'ask');
  await c.accept('/paste'); await c.accept('x'.repeat(16001)); await c.accept('/discard'); assert.equal(c.pasting, false); assert.equal(requests.length, 1);
  await c.accept('x'.repeat(16001)); assert.equal(requests.length, 1);
});

test('busy tasks reject competing work, cancel promptly and save their outcome after exit', async t => {
  let started, stopped;
  const running = new Promise(resolve => { started = resolve; });
  const { controller: c, requests, store } = await fixture(t, { run: async (request, options) => {
    started(); await new Promise(resolve => { options.signal.addEventListener('abort', resolve, { once: true }); });
    stopped = true;
    return { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'cancelled', mode: request.mode, answer: 'Cancelled', sessionId: null, workspace: request.root, branch: null, repository: null, auditFile: '', completedAt: new Date().toISOString() };
  } });
  const task = c.accept('A slow task'); await running;
  await c.accept('/mode pr'); await c.accept('Another task'); assert.equal(c.settings.mode, 'ask');
  await c.accept('/exit'); await task; assert.equal(stopped, true); assert.equal(c.closed, true); assert.equal(c.busy, false);
  await c.accept('After exit'); assert.equal(c.record.turns.length, 1);
  const saved = await store.load(c.record.id); assert.equal(saved.turns[0].status, 'cancelled');
});

test('validation and runtime failures leave the application usable and preserve the last working session', async t => {
  let fail = false;
  const { controller: c, requests } = await fixture(t, { run: async (request, options) => {
    if (fail) throw new Error('Model unavailable');
    return runAgent(request, options);
  } });
  await c.accept('First'); const working = c.record.lastRun;
  fail = true; await c.accept('Fails'); assert.equal(c.busy, false); assert.equal(c.record.lastRun, working);
  fail = false; await c.accept('Recover'); assert.equal(c.record.turns.length, 2);
  await c.accept('/limits 1 999'); assert.equal(c.settings.timeout, 30);
  await c.accept('/permissions anything yes'); assert.equal(c.settings.github, false);
});

test('conversation persistence redacts known credentials and uses private permissions', async t => {
  const { controller: c, store, env, home } = await fixture(t);
  env.ONBOARDER_AI_API_KEY = 'fixture-secret-key';
  await c.accept('Explain fixture-secret-key'); const raw = await fs.readFile(path.join(store.directory, c.record.id + '.json'), 'utf8');
  assert.ok(!raw.includes('fixture-secret-key')); assert.match(raw, /\[redacted\]/);
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(store.directory, c.record.id + '.json'))).mode & 0o777, 0o600);
  await fs.writeFile(path.join(store.directory, 'ffffffff-ffff-ffff-ffff-ffffffffffff.json'), 'broken');
  assert.equal((await store.list(c.settings.root)).length, 1);
});

test('UTF-8 conversation storage stays within its own loader limit', async t => {
  const { controller: c, store } = await fixture(t);
  const turn = { at: new Date().toISOString(), prompt: '😀'.repeat(8000), answer: '😀'.repeat(16000), run: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'completed' };
  c.record.turns = Array.from({ length: 100 }, () => ({ ...turn }));
  await store.save(c.record);
  const saved = await store.load(c.record.id); assert.ok(saved.turns.length > 0 && saved.turns.length < 100);
  assert.ok((await fs.stat(path.join(store.directory, c.record.id + '.json'))).size <= 5 * 1024 * 1024);
});

test('cancelling after tool activity preserves a resumable implementation session', async t => {
  const { controller: c } = await fixture(t, { run: async (request, options) => {
    options.onEvent({ type: 'tool_use', name: 'onboarder_agent_write_file' });
    return { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'cancelled', mode: request.mode, answer: 'Cancelled', sessionId: 'existing_session', workspace: request.root, branch: 'codex/task', repository: null, auditFile: '', completedAt: new Date().toISOString() };
  } });
  await c.accept('/implement Fix this'); assert.equal(c.record.lastRun, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
});

test('stream rendering handles split credentials and escapes, preserves code, and avoids duplicate final answers', () => {
  const lines = [], render = new ChatRenderer(t => lines.push(t), undefined, { GITHUB_TOKEN: 'fixture-credential' });
  render.handle({ type: 'start', prompt: 'test', mode: 'ask' });
  for (const text of ['## Result\n```ts\n  const value = 1;\n```\nfixture-', 'credential\n\x1b]0;evil', '\x07Done\n']) render.handle({ type: 'event', event: { type: 'text', text } });
  render.handle({ type: 'end', result: { id: 'run', answer: '## Result\n```ts\n  const value = 1;\n```\nfixture-credential\n\x1b]0;evil\x07Done\n', status: 'completed', workspace: '.', branch: null }, elapsed: 10 });
  const output = lines.join('\n'); assert.ok(!output.includes('fixture-credential')); assert.ok(!output.includes('evil')); assert.match(output, /\[redacted\]/);
  assert.equal(lines.filter(s => s === '  const value = 1;').length, 1); assert.equal(lines.filter(s => s === 'Done').length, 1);
});

test('slash completion is contextual and normal messages remain plain conversation', () => {
  assert.equal(slashInput('Explain /review'), null); assert.deepEqual(slashInput('/show "src/my file.ts" 10').args, ['src/my file.ts', '10']);
  assert.deepEqual(completeChat('/rev'), [['/review'], '/rev']); assert.deepEqual(completeChat('/permissions checks o')[0], ['on', 'off']);
  assert.deepEqual(completeChat('/show sr', ['src/app.ts', 'README.md'])[0], ['src/app.ts']);
  assert.match(chatHelp('paste'), /multiline/);
});

test('chat refuses noninteractive input without hanging, and exposes dedicated help', async () => {
  if (process.stdin.isTTY && process.stdout.isTTY) return;
  const output = []; assert.equal(await runChat({ out: t => output.push(t) }), 0); assert.match(output.join('\n'), /interactive terminal/);
  const help = await runProcess(process.execPath, ['bin/onboarder.js', 'chat', '--help']); assert.equal(help.code, 0); assert.match(help.stdout, /\/permissions/);
});

test('native terminal slash commands, multiline discard and exit finish without a closed-readline error', { skip: process.platform !== 'darwin' }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-chat-pty-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const terminalFixture = `import os, pty, select, subprocess, sys, time
master, slave = pty.openpty()
child = subprocess.Popen([sys.argv[1], 'bin/onboarder.js', 'chat', '--no-color', '--model', 'fixture-model'], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
data = b''
sent = False
deadline = time.monotonic() + 10
while time.monotonic() < deadline:
    if select.select([master], [], [], 0.1)[0]:
        try: chunk = os.read(master, 65536)
        except OSError: break
        if not chunk: break
        data += chunk
        if not sent and 'ask › '.encode() in data:
            os.write(master, b'/status\\n/paste\\n  pasted code\\n/discard\\n/exit\\n')
            sent = True
    if child.poll() is not None: break
try:
    child.wait(timeout=2)
except subprocess.TimeoutExpired:
    child.terminate()
    child.wait(timeout=3)
    sys.stdout.buffer.write(data)
    sys.exit(2)
os.close(master)
sys.stdout.buffer.write(data)
sys.exit(child.returncode)
`;
  const output = await runProcess('/usr/bin/python3', ['-c', terminalFixture, process.execPath], {
    env: { ...process.env, TERM: 'xterm-256color', ONBOARDER_AGENT_HOME: temp },
    timeoutMs: 15000,
  });
  assert.equal(output.code, 0, output.stderr + output.stdout); assert.match(output.stdout, /Multiline message discarded/); assert.match(output.stdout, /Conversation saved/);
  assert.ok(!output.stdout.includes('ERR_USE_AFTER_CLOSE')); const names = await fs.readdir(path.join(temp, 'chats')); assert.equal(names.length, 1);
});

test('model wizard cancellation returns terminal ownership to chat and allows a clean exit', { skip: process.platform !== 'darwin' }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-chat-model-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const binary = path.join(temp, 'hermes-fixture');
  await fs.writeFile(binary, '#!/usr/bin/env node\nconsole.log("MODEL_WIZARD_READY"); process.stdin.resume(); setInterval(()=>{},1000);\n', { mode: 0o700 });
  const code = `import os, pty, select, signal, subprocess, sys, time
master, slave = pty.openpty()
child = subprocess.Popen([sys.argv[1], 'bin/onboarder.js', 'chat', '--no-color', '--model', 'fixture-model'], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
data = b''
stage = 0
deadline = time.monotonic() + 10
while time.monotonic() < deadline:
    if select.select([master], [], [], 0.1)[0]:
        try: chunk = os.read(master, 65536)
        except OSError: break
        if not chunk: break
        data += chunk
        if stage == 0 and 'ask › '.encode() in data:
            os.write(master, b'/model configure\\n')
            stage = 1
        elif stage == 1 and b'MODEL_WIZARD_READY' in data:
            child.send_signal(signal.SIGINT)
            stage = 2
        elif stage == 2 and b'operation was aborted' in data:
            os.write(master, b'/exit\\n')
            stage = 3
    if child.poll() is not None: break
try: child.wait(timeout=2)
except subprocess.TimeoutExpired:
    child.terminate()
    child.wait(timeout=3)
    sys.stdout.buffer.write(data)
    sys.exit(2)
os.close(master)
sys.stdout.buffer.write(data)
sys.exit(child.returncode)
`;
  const result = await runProcess('/usr/bin/python3', ['-c', code, process.execPath], {
    env: { ...process.env, TERM: 'xterm-256color', ONBOARDER_AGENT_HOME: temp, HERMES_HOME: path.join(temp, 'hermes-install'), ONBOARDER_HERMES_BIN: binary }, timeoutMs: 15000,
  });
  assert.equal(result.code, 0, result.stdout + result.stderr); assert.match(result.stdout, /MODEL_WIZARD_READY/); assert.match(result.stdout, /Conversation saved/);
});

async function gitHubFixture(t) {
  const fixtureData = await fixture(t), { root, home, env } = fixtureData;
  const bare = path.join(root, 'remote.git');
  assert.equal((await runProcess('git', ['clone', '--bare', root, bare])).code, 0);
  // Use actual Git clones/fetches against a local bare remote. The GitHub URL
  // remains in origin; only the fixture's network transport is redirected.
  const execute = (command, args, options) => runProcess(command, [
    ...(args.includes('clone') || args.includes('pull') ? ['-c', `url.file://${bare}.insteadOf=https://github.com/fixture/repo.git`] : []), ...args,
  ], options);
  const sources = new ChatSources(home, { env, execute });
  return { ...fixtureData, bare, sources };
}

test('GitHub sources clone real files into private persistent storage and reuse the same repository identity', async t => {
  const { sources } = await gitHubFixture(t), progress = [];
  const opened = await sources.open('https://github.com/fixture/repo', undefined, undefined, line => progress.push(line));
  assert.equal(opened.sourceUrl, 'https://github.com/fixture/repo'); assert.equal(opened.reused, false);
  assert.equal(await fs.readFile(path.join(opened.root, 'app.ts'), 'utf8'), 'export const value = 1;\n');
  const again = await sources.open('git@github.com:Fixture/Repo.git');
  assert.equal(again.root, opened.root); assert.equal(again.reused, true);
  assert.match(progress.join('\n'), /Cloning fixture\/repo/);
  assert.ok((await fs.readdir(sources.directory)).every(name => !name.startsWith('.clone-')));
  if (process.platform !== 'win32') assert.equal((await fs.stat(opened.root)).mode & 0o777, 0o700);
});

test('pasting a GitHub URL opens it before the question; follow-ups and conversations use the cloned repository', async t => {
  const { root, home, env, store, sources } = await gitHubFixture(t), requests = [];
  const c = new ChatController({ root, mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 }, {
    sources, store, output: () => {}, runner: { home, env }, run: async request => {
      requests.push(request);
      return { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'completed', mode: request.mode, answer: 'fixture answer', sessionId: 'fixture_session', workspace: request.root, branch: null, repository: 'fixture/repo', auditFile: '', completedAt: new Date().toISOString() };
    },
  });
  await c.accept('https://github.com/fixture/repo'); assert.equal(requests.length, 0); assert.notEqual(c.settings.root, root);
  const clonedRoot = c.settings.root;
  await c.accept('Explain this repository'); await c.accept('Where should I start?');
  assert.equal(requests[0].root, clonedRoot); assert.equal(requests[1].resume, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal((await store.load(c.record.id)).settings.sourceUrl, 'https://github.com/fixture/repo');
  await c.accept('https://github.com/fixture/repo Explain the entry point');
  assert.equal(requests.at(-1).task, 'Explain the entry point'); assert.equal(requests.at(-1).resume, undefined);
  await c.accept('/repo "' + root + '"'); assert.equal(c.settings.root, root); assert.equal(c.settings.sourceUrl, undefined);
  await c.accept('/clone https://github.com/fixture/repo'); assert.equal(c.settings.root, clonedRoot);
});

test('pull fast-forwards a saved clone, refuses local edits and keeps an active implementation workspace safe', async t => {
  const { root, bare, sources, home, env, store } = await gitHubFixture(t);
  const opened = await sources.open('https://github.com/fixture/repo');
  await fs.writeFile(path.join(root, 'app.ts'), 'export const value = 2;\n');
  await runProcess('git', ['-C', root, 'add', 'app.ts']);
  assert.equal((await runProcess('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'update'])).code, 0);
  assert.equal((await runProcess('git', ['-C', root, 'push', bare, 'main'])).code, 0);
  const c = new ChatController({ root: opened.root, sourceUrl: opened.sourceUrl, mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 }, { sources, store, runner: { home, env }, output: () => {} });
  c.record.lastRun = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await c.accept('/pull'); assert.equal(c.record.lastRun, null); assert.equal(await fs.readFile(path.join(opened.root, 'app.ts'), 'utf8'), 'export const value = 2;\n');
  await fs.writeFile(path.join(opened.root, 'app.ts'), 'local change');
  await assert.rejects(sources.pull(opened.root), /local changes/); assert.equal(await fs.readFile(path.join(opened.root, 'app.ts'), 'utf8'), 'local change');
  c.lastResult = { branch: 'codex/fixture', workspace: opened.root };
  c.record.lastRun = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await c.accept('/pull'); assert.ok(c.record.lastRun); assert.equal(c.lastResult.branch, 'codex/fixture');
});

test('invalid URLs and changed cached origins are refused without changing the current conversation', async t => {
  for (const url of ['http://github.com/a/b', 'https://token@github.com/a/b', 'https://github.com.evil/a/b', 'https://github.com/a/b/tree/main', 'https://github.com/a/b;touch', 'file:///tmp/repo', 'https://github.com/../repo']) assert.throws(() => githubSource(url));
  const { sources, controller: c } = await gitHubFixture(t);
  const opened = await sources.open('https://github.com/fixture/repo');
  await runProcess('git', ['-C', opened.root, 'remote', 'set-url', 'origin', 'https://github.com/other/repo.git']);
  await assert.rejects(sources.open('https://github.com/fixture/repo'), /origin changed/);
  assert.equal(await fs.readFile(path.join(opened.root, 'app.ts'), 'utf8'), 'export const value = 1;\n');
  const id = c.record.id, root = c.settings.root;
  await c.accept('/repo https://github.com/owner/repo/tree/main'); assert.equal(c.record.id, id); assert.equal(c.settings.root, root);
});

test('cancelled clone cleanup preserves the active repository and chat remains usable', async t => {
  const { controller: c, root, home, env, store } = await fixture(t);
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const sources = new ChatSources(home, { env, execute: async (_command, _args, options) => {
    started(); await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
    throw new Error('Clone cancelled');
  } });
  const chat = new ChatController({ ...c.settings }, { sources, store, output: () => {} });
  const id = chat.record.id, opening = chat.accept('/clone https://github.com/fixture/repo'); await ready;
  await chat.accept('/cancel'); await opening;
  assert.equal(chat.settings.root, root); assert.equal(chat.record.id, id); assert.equal(chat.busy, false);
  assert.deepEqual(await fs.readdir(sources.directory), []);
  await chat.accept('/status'); assert.equal(chat.busy, false);
});
