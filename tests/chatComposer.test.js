import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TerminalComposer } from '../cli/chat/composer.js';
import { suggestCommands, CHAT_COMMANDS, BROWSE_COMMANDS } from '../cli/chat/commands.js';
import { cells, clip } from '../cli/chat/text.js';
import { chatBanner } from '../cli/chat/render.js';
import { profileDisplay } from '../cli/chat/profile.js';
import { setupAgent } from '../cli/agent/config.js';
import { ChatController } from '../cli/chat/controller.js';
import { ChatStore } from '../cli/chat/store.js';
import { repositoryBrowser } from '../cli/chat/app.js';
import { terminalText } from '../cli/agent/process.js';
import { runProcess } from '../cli/agent/process.js';

const settings = { root: process.cwd(), mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 };
const delay = () => new Promise(resolve => setTimeout(resolve, 35));
function composer(t, columns = 80) {
  const input = new PassThrough(), output = new PassThrough(), messages = [];
  let capture = '', cancelled = 0, exited = 0;
  input.isRaw = false; input.setRawMode = value => { input.isRaw = value; };
  output.columns = columns; output.rows = 24; output.on('data', chunk => { capture += chunk.toString(); });
  const app = new TerminalComposer({ input, output, state: () => ({ mode: 'ask', status: 'fixture model │ test repository', busy: false, pasting: false, files: ['src/app.ts'] }),
    submit: text => messages.push(text), cancel: () => { cancelled++; }, exit: () => { exited++; },
  });
  app.start(); t.after(() => { app.close(); input.destroy(); output.destroy(); });
  return { app, input, output, messages, capture: () => capture, cancelled: () => cancelled, exited: () => exited };
}

test('typing slash immediately opens descriptions; filtering, keyboard selection and insertion do not execute a task', async t => {
  const { app, messages, capture } = composer(t);
  app.key('/', {}); await delay(); assert.match(capture(), /Show commands and examples/); assert.equal(messages.length, 0);
  app.key('rev', {}); await delay(); assert.match(capture(), /Review local changes or a GitHub PR/);
  app.key('', { name: 'tab' }); assert.equal(app.value, '/review '); assert.equal(messages.length, 0);
  app.key('42', {}); app.key('', { name: 'return' }); assert.deepEqual(messages, ['/review 42']);
  app.key('/', {}); app.key('', { name: 'down' }); app.key('', { name: 'return' }); assert.equal(app.value, '/ask '); assert.equal(messages.length, 1);
  app.key('', { ctrl: true, name: 'u' }); app.key('/status', {}); app.key('', { name: 'return' }); assert.equal(messages.at(-1), '/status');
});

test('bracketed paste preserves multiline code and never submits pasted slash commands', t => {
  const { app, messages } = composer(t);
  app.key('', { name: 'paste-start' }); app.key('Code:', {}); app.key('\r', { name: 'return' }); app.key('\n', { name: 'enter' });
  app.key('  const x = 1;', {}); app.key('\n', { name: 'enter' }); app.key('/exit', {}); app.key('', { name: 'paste-end' });
  assert.equal(app.value, 'Code:\n  const x = 1;\n/exit'); assert.equal(messages.length, 0);
  app.key('', { name: 'return' }); assert.deepEqual(messages, ['Code:\n  const x = 1;\n/exit']);
});

test('model menus search and select below the input, keep drafts, and cancel on Escape or abort', async t => {
  const { app, messages, capture, output } = composer(t, 60);
  app.key('keep this draft', {});
  const choices = Array.from({ length: 30 }, (_, n) => ({ value: String(n), label: 'Model ' + n }));
  const selected = app.choose({ title: 'Model Picker', choices, selected: '20' });
  await delay(); assert.match(capture(), /Model 20/); assert.equal(app.value, 'keep this draft');
  app.key('Model 2', {}); app.key('', { name: 'down' }); app.key('', { name: 'return' });
  assert.equal(await selected, '20'); assert.equal(messages.length, 0); assert.equal(app.value, 'keep this draft');
  const cancelled = app.choose({ title: 'Providers', choices }); app.key('', { name: 'escape' }); assert.equal(await cancelled, null);
  const abort = new AbortController(), pending = app.choose({ title: 'Providers', choices, signal: abort.signal });
  abort.abort(); assert.equal(await pending, null); assert.equal(app.choosing, false);
  const pasted = app.choose({ title: 'Models', choices }); app.key('', { name: 'paste-start' }); app.key('Model 29', {});
  app.key('\r', { name: 'return' }); app.key('', { name: 'paste-end' }); assert.equal(app.choosing, true);
  app.key('', { ctrl: true, name: 'u' }); app.key('Model 29', {}); app.key('', { name: 'return' }); assert.equal(await pasted, '29');
  app.key('', { ctrl: true, name: 'u' }); app.key('/mode', {}); app.key('', { name: 'down' }); app.key('', { name: 'tab' }); assert.equal(app.value, '/model', 'Picker command completion has no trailing space');
  output.columns = 24; const narrow = app.choose({ title: 'Very long provider title', choices }); await delay(); app.key('', { name: 'escape' }); await narrow;
});

test('Unicode editing, argument completion, history and interrupt keys preserve the input buffer', t => {
  const { app, messages, cancelled, exited } = composer(t);
  app.key('a👨‍💻b', {}); app.key('', { name: 'left' }); app.key('', { name: 'backspace' }); assert.equal(app.value, 'ab');
  app.key('', { name: 'return', meta: true }); app.key('第二行', {}); app.key('', { name: 'return' }); assert.equal(messages[0], 'a\n第二行b');
  app.key('', { name: 'up' }); assert.equal(app.value, messages[0]); app.key('', { ctrl: true, name: 'u' });
  app.key('/show sr', {}); app.key('', { name: 'tab' }); assert.equal(app.value, '/show src/app.ts');
  app.key('', { ctrl: true, name: 'c' }); assert.equal(app.value, ''); assert.equal(cancelled(), 1);
  app.key('', { ctrl: true, name: 'd' }); assert.equal(exited(), 1);
});

test('async output and resize preserve a long draft and restore raw mode on handoff', async t => {
  const { app, input, output, capture } = composer(t, 24);
  const draft = 'A long message with 中文 and 😀 '.repeat(4);
  app.key(draft, {}); await delay(); app.print('A streamed answer'); assert.equal(app.value, draft);
  output.columns = 12; output.emit('resize'); await delay(); assert.equal(app.value, draft);
  app.suspend(); assert.equal(input.isRaw, false); app.start(); assert.equal(input.isRaw, true); assert.equal(app.value, draft);
  app.key('', { name: 'return' }); assert.match(capture(), /A streamed answer/); assert.match(capture(), /\?2004l/);
});

test('welcome and menu geometry fit narrow and wide terminals, including Unicode paths', () => {
  assert.equal(cells('👨‍💻中文é'), 7); assert.equal(cells(clip('中文😀abc', 4)), 3);
  for (const columns of [8, 24, 60, 80, 120]) {
    const banner = chatBanner({ ...settings, root: '/项目/😀/repo' }, columns, undefined, '0.7.0', { tools: 37 });
    for (const line of banner.split('\n')) assert.ok(cells(line) < columns, `${columns}: ${line}`);
  }
  assert.ok(suggestCommands('/security').some(([name]) => name === 'security'));
  assert.ok(suggestCommands('/diagram').some(([name]) => name === 'layers-diagram'));
  assert.equal(new Set(CHAT_COMMANDS.map(c => c[0])).size, CHAT_COMMANDS.length);
  assert.ok(chatBanner(settings, 80, undefined, 'fixture', { rows: 24, tools: 37 }).split('\n').length <= 19, 'Welcome leaves room for the composer on a 24-row terminal');
});

test('profile display reads wizard YAML and JSON without returning credentials', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-profile-display-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { HERMES_HOME: path.join(home, 'hermes') }, setup = await setupAgent(home, env);
  await fs.writeFile(setup.configFile, 'model:\n  default: "fixture:model"\n  provider: custom\n  api_key: do-not-show\nagent:\n  max_turns: 20\n');
  assert.deepEqual(await profileDisplay(home, env), { model: 'fixture:model', provider: 'custom' });
  await fs.writeFile(setup.configFile, JSON.stringify({ model: { default: 'another', provider: 'ollama', api_key: 'hidden' } }));
  assert.deepEqual(await profileDisplay(home, env), { model: 'another', provider: 'ollama' });
  await fs.writeFile(setup.configFile, '{"model": {"default": "saved-model", "provider": "custom:fixture", api_mode: chat_completions, api_key: "hidden,{secret}"}, "agent": {"max_turns": 24}}');
  assert.deepEqual(await profileDisplay(home, env), { model: 'saved-model', provider: 'custom:fixture' });
});

test('every explorer slash feature is reachable and external analysis requires checks permission', async t => {
  const names = [], controller = new ChatController(settings, { output: () => {}, browse: async name => { names.push(name); return 'ok'; } });
  for (const name of BROWSE_COMMANDS.filter(n => n !== 'deep')) await controller.accept('/' + name);
  assert.equal(names.length, BROWSE_COMMANDS.length - 1);
  await controller.accept('/deep fixture'); assert.ok(!names.includes('deep'));
  // Use private fixture storage rather than persisting test preferences into the user's profile.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-chat-features-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const enabled = new ChatController(settings, { output: () => {}, store: new ChatStore(home), browse: async name => { names.push(name); return 'ok'; } });
  await enabled.accept('/permissions checks on'); await enabled.accept('/deep fixture'); assert.equal(names.at(-1), 'deep');
});

test('explorer adapter renders newly exposed commands from the real repository analysis', async () => {
  const browser = repositoryBrowser({ maxFiles: 1000 }, () => {}, 'fixture');
  for (const [name, args] of [['stats', []], ['stack', []], ['symbols', ['src/cli/chat/composer.ts']], ['diagram', []], ['about', []], ['engines', []]]) {
    const text = await browser.run(name, args, process.cwd(), new AbortController().signal);
    assert.ok(typeof text === 'string' && text.trim().length, name);
  }
});

test('export writes a private Markdown transcript with redacted environment credentials', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-export-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const store = new ChatStore(home, { GITHUB_TOKEN: 'private-fixture-token' });
  const controller = new ChatController(settings, { output: () => {}, store });
  controller.record.turns.push({ at: '', prompt: 'private-fixture-token', answer: 'Answer', run: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'completed' });
  const file = await store.export(controller.record), contents = await fs.readFile(file, 'utf8');
  assert.match(contents, /## You/); assert.match(contents, /\[redacted\]/); assert.ok(!contents.includes('private-fixture-token'));
  if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});

test('a native terminal opens slash suggestions without Enter and keeps bracketed paste unsent', { skip: process.platform !== 'darwin' }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-live-menu-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const python = `import os, pty, select, subprocess, sys, time, termios, struct, fcntl
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 60, 0, 0))
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
            os.write(master, b'/')
            stage = 1
        elif stage == 1 and '↑/↓ select'.encode() in data:
            os.write(master, b'rev')
            stage = 2
        elif stage == 2 and b'Review local changes or' in data:
            os.write(master, b'\\t\\x15/skills\\n')
            stage = 3
        elif stage == 3 and b'Built-in workflow skills' in data:
            os.write(master, b'\\x1b[200~PASTE_NOT_SUBMITTED\\n/exit\\x1b[201~')
            stage = 4
        elif stage == 4 and b'PASTE_NOT_SUBMITTED' in data:
            os.write(master, b'\\x15/exit\\n')
            stage = 5
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
  const result = await runProcess('/usr/bin/python3', ['-c', python, process.execPath], { env: { ...process.env, TERM: 'xterm-256color', ONBOARDER_AGENT_HOME: home, HERMES_HOME: path.join(home, 'hermes'), ONBOARDER_HERMES_BIN: process.execPath }, timeoutMs: 15000 });
  assert.equal(result.code, 0, result.stdout + result.stderr); assert.match(result.stdout, /Built-in workflow skills/); assert.match(result.stdout, /Conversation saved/);
  assert.equal(await fs.access(path.join(home, 'runs')).then(() => true).catch(() => false), false, 'Pasted input did not start an agent run');
});
