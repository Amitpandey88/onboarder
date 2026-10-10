import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { commandChoices, fileChoices, searchChoices, FILE_ACTIONS } from '../cli/chat/navigation.js';
import { CHAT_COMMANDS, chatHelp, commandGroup } from '../cli/chat/commands.js';
import { TerminalComposer } from '../cli/chat/composer.js';
import { TerminalScreen } from '../cli/chat/screen.js';
import { ChatController } from '../cli/chat/controller.js';
import { ChatStore, newChat } from '../cli/chat/store.js';
import { repositoryBrowser } from '../cli/chat/app.js';
import { chatBanner, chatStatus } from '../cli/chat/render.js';
import { cells } from '../cli/chat/text.js';
import { runProcess } from '../cli/agent/process.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 40));
const settings = root => ({ root, mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 });
async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-navigation-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = await fs.realpath(temp), home = path.join(root, 'private');
  return { root, home, store: new ChatStore(home, {}) };
}
function composer(t, state = {}) {
  const input = new PassThrough(), output = new PassThrough(), messages = [];
  input.setRawMode = () => {};
  output.columns = 100; output.rows = 28;
  let capture = ''; output.on('data', chunk => { capture += chunk; });
  const app = new TerminalComposer({ input, output, fullscreen: true, state: () => ({ mode: 'ask', status: 'Ready', busy: false, pasting: false, files: [], ...state }),
    submit: line => messages.push(line), cancel: () => {}, exit: () => {} });
  app.start(); t.after(() => { app.close(); input.destroy(); output.destroy(); });
  return { app, output, messages, capture: () => capture };
}

test('command search covers topics, all query words and fuzzy paths, with exact names ranked first', () => {
  const commands = commandChoices();
  assert.equal(commands.length, CHAT_COMMANDS.length);
  assert.equal(new Set(commands.map(c => c.value)).size, commands.length);
  assert.equal(searchChoices(commands, '/health')[0].value, 'health');
  assert.equal(searchChoices(commands, 'security findings')[0].value, 'security');
  assert.ok(searchChoices(commands, 'conversation').some(c => c.value === 'resume'));
  assert.deepEqual(searchChoices(commands, 'not-a-real-command-xyz'), []);
  const files = fileChoices(['src/public/app.ts', 'src/server/app.ts', 'src/ui/my module.ts', 'src/public/app.ts']);
  assert.equal(files.length, 3);
  assert.equal(searchChoices(files, 'ui module')[0].value, 'src/ui/my module.ts');
  assert.equal(searchChoices(files, 'srcpapp')[0].value, 'src/public/app.ts');
  const unusual = 'src/\x1b[31mred\x1b[0m\nmodule.ts', displayed = fileChoices([unusual])[0];
  assert.equal(displayed.value, unusual, 'Filesystem path is preserved');
  assert.equal(displayed.label, 'red module.ts'); assert.equal(displayed.detail, 'src/red module.ts');
  assert.equal(commandGroup('open'), 'Browse the repository');
  assert.ok(CHAT_COMMANDS.every(([name]) => commandGroup(name) !== 'Other commands'));
});

test('command palette preserves drafts on cancel, inserts without running and restores the draft after submitting', async t => {
  const { app, messages, capture } = composer(t);
  app.key('Keep my draft 中文', {}); app.key('', { name: 'left' });
  app.key('', { ctrl: true, name: 'p' }); await tick();
  assert.equal(app.choosing, true); assert.match(capture(), /Command palette/);
  app.key('health', {}); app.key('', { name: 'return' }); await tick();
  assert.equal(app.value, '/health '); assert.deepEqual(messages, []);
  app.key('', { name: 'escape' }); assert.equal(app.value, 'Keep my draft 中文');
  app.key('X', {}); assert.equal(app.value, 'Keep my draft 中X文', 'Original cursor restored');
  app.key('', { ctrl: true, name: 'p' }); app.key('map', {}); app.key('', { name: 'return' }); await tick();
  app.key('', { name: 'return' });
  assert.deepEqual(messages, ['/map ']); assert.equal(app.value, 'Keep my draft 中X文');
  app.key('', { ctrl: true, name: 'p' }); app.key('', { name: 'escape' }); await tick();
  assert.equal(app.value, 'Keep my draft 中X文');
});

test('file and resume shortcuts retain input and remain inactive during tasks or multiline paste', t => {
  const state = {}, { app, messages } = composer(t, state);
  app.key('Draft', {}); app.key('', { ctrl: true, name: 'o' }); app.key('', { ctrl: true, name: 'r' });
  assert.deepEqual(messages, ['/open', '/resume']); assert.equal(app.value, 'Draft');
  state.busy = true;
  for (const name of ['p', 'o', 'r']) app.key('', { ctrl: true, name });
  assert.equal(app.choosing, false); assert.equal(messages.length, 2);
  state.busy = false; state.pasting = true;
  for (const name of ['p', 'o', 'r']) app.key('', { ctrl: true, name });
  assert.equal(app.choosing, false); assert.equal(messages.length, 2);
});

test('file menus support an initial fuzzy query, spaces and duplicate basenames, and keep the draft', async t => {
  const { app, output, capture } = composer(t);
  app.key('An unfinished question', {});
  const selected = app.choose({ title: 'Files', choices: fileChoices(['src/ui/my module.ts', 'src/server/my module.ts', 'src/app.ts']), query: 'ui module', fuzzy: true });
  await tick(); assert.match(capture(), /my module.ts/);
  output.columns = 28; output.rows = 8; output.emit('resize'); await tick();
  app.key('', { name: 'return' }); assert.equal(await selected, 'src/ui/my module.ts');
  assert.equal(app.value, 'An unfinished question');
});

test('open actions use the active isolated workspace, pass paths as single arguments and never invoke AI', async t => {
  const { root, store } = await fixture(t), browsed = [], events = [];
  let action = 'deps';
  const c = new ChatController(settings(root), { store, output: e => events.push(e),
    chooseFile: async (folder, query) => { assert.equal(folder, root + '/worktree'); assert.equal(query, 'my module'); return { path: 'src/my module.ts', action }; },
    browse: async (...args) => { browsed.push(args); return 'Connections'; }, run: async () => { throw new Error('AI must not run'); } });
  c.lastResult = { workspace: root + '/worktree' };
  await c.accept('/open "my module"');
  assert.deepEqual(browsed[0].slice(0, 3), ['deps', ['src/my module.ts'], root + '/worktree']);
  action = 'implement'; await c.accept('/open my module');
  assert.equal(browsed.length, 1); assert.match(events.at(-1).text, /supported file action/);
  assert.ok(FILE_ACTIONS.every(a => !['implement', 'deep', 'docs'].includes(a.value)));
  assert.equal(c.settings.checks, false); assert.equal(c.settings.github, false);
});

test('cancelled file selection restores the controller and cannot continue into browsing', async t => {
  const { root, store } = await fixture(t), events = []; let browsed = false;
  const c = new ChatController(settings(root), { store, output: e => events.push(e),
    chooseFile: (_root, _query, signal) => new Promise(resolve => signal.addEventListener('abort', () => resolve(null), { once: true })),
    browse: async () => { browsed = true; return ''; } });
  const pending = c.accept('/open'); c.cancel(); await pending;
  assert.equal(browsed, false); assert.equal(c.busy, false); assert.match(events.at(-1).text, /cancelled/);
});

test('conversation picker is scoped to the repository and resume retains current permissions', async t => {
  const { root, store } = await fixture(t);
  const saved = newChat({ ...settings(root), github: true, checks: true });
  const other = newChat(settings(root + '/other'));
  await store.save(saved); await store.save(other);
  let picks = 0;
  const c = new ChatController(settings(root), { store, output: () => {}, chooseConversation: async records => {
    picks++; assert.deepEqual(records.map(r => r.id), [saved.id]); return saved.id;
  } });
  await c.accept('/resume'); assert.equal(c.record.id, saved.id);
  assert.equal(c.settings.checks, false); assert.equal(c.settings.github, false);
  await c.accept('/resume'); assert.equal(picks, 1, 'Current conversation excluded');
});

test('repository file indexing stays lazy, refreshes for the active root and hides stale completions', async t => {
  const { root } = await fixture(t), second = path.join(root, 'second');
  await fs.writeFile(path.join(root, 'first.ts'), 'export const first = 1;');
  await fs.mkdir(second); await fs.writeFile(path.join(second, 'second.ts'), 'export const second = 2;');
  const progress = [], browser = repositoryBrowser({}, text => progress.push(text));
  assert.deepEqual(browser.filesFor(root), []); assert.equal(progress.length, 0);
  const signal = new AbortController().signal;
  assert.ok((await browser.listFiles(root, signal)).includes('first.ts'));
  assert.deepEqual(browser.filesFor(second), []);
  assert.deepEqual(await browser.listFiles(second, signal), ['second.ts']);
  assert.deepEqual(browser.filesFor(root), []);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(browser.listFiles(root, abort.signal));
  assert.deepEqual(browser.filesFor(second), ['second.ts']);
});

test('history counts unseen output, preserves the reading position and jumps to latest without losing text', () => {
  const screen = new TerminalScreen(new PassThrough());
  screen.append(Array.from({ length: 50 }, (_, i) => 'Line ' + i).join('\n'));
  screen.scroll(1, 30, 8); const before = screen.view(30, 8, '');
  screen.append('New one\nNew two'); assert.equal(screen.unread, 2);
  assert.deepEqual(screen.view(30, 8, ''), before);
  screen.latest(); assert.equal(screen.unread, 0); assert.equal(screen.scrolled, false);
  assert.equal(screen.view(30, 8, '').at(-1), 'New two');
});

test('status and welcome fit different sizes while surfacing offline actions and permissions', () => {
  const s = settings('/项目/😀/a-long-repository');
  for (const width of [8, 24, 42, 60, 80, 120, 240]) {
    const status = chatStatus(s, width, { model: 'A very long model name with 中文', repo: 'Repository', busy: true, elapsed: 1250, activity: 'Reading source', calls: 2, turns: 1, tools: 39 });
    assert.ok(cells(status) < width);
    for (const height of [4, 10, 14, 18, 32]) {
      const banner = chatBanner(s, width, undefined, 'fixture', { fullscreen: true, rows: height, indexedFiles: 12, tools: 39 });
      assert.ok(banner.split('\n').length <= height);
      assert.ok(banner.split('\n').every(line => cells(line) < width));
    }
  }
  const offline = chatStatus(s, 80, { model: 'model not configured', repo: 'repo', busy: false, elapsed: 0, calls: 0, turns: 0, tools: 39 });
  assert.match(offline, /^Offline/); assert.match(offline, /checks off.*GitHub off/);
  assert.match(chatHelp(), /Ctrl-P.*Search all commands/); assert.match(chatHelp('open'), /Pick a code file/);
  assert.ok(CHAT_COMMANDS.every(([name]) => chatHelp('all').includes('/' + name)));
});

test('native terminal browses a file with spaces, chooses an action and resumes a conversation with its draft intact', { skip: process.platform !== 'darwin' }, async t => {
  const { root, home, store } = await fixture(t);
  await fs.mkdir(path.join(root, 'src')); await fs.writeFile(path.join(root, 'src/my module.ts'), 'export const FILE_PICKER_OK = 42;\n');
  const saved = newChat(settings(root));
  saved.turns.push({ at: new Date().toISOString(), prompt: 'Previous navigation fixture', answer: 'RESUMED_FIXTURE_OK', run: randomUUID(), status: 'completed' });
  await store.save(saved);
  const driver = String.raw`import os, pty, select, subprocess, sys, time, fcntl, termios, struct
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 110, 0, 0))
child = subprocess.Popen([sys.argv[1], 'bin/onboarder.js', 'chat', sys.argv[2], '--no-color', '--model', 'fixture'], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
steps = [('ask › '.encode(), b'KEEP_DRAFT\x10'), (b'Command palette', b'map\r'), (b'Enter runs this command', b'\x1b'), ('ask › KEEP_DRAFT'.encode(), b'\x0f'), (b'Open a code file', b'my module\r'), (b'Read source', b'\r'), (b'FILE_PICKER_OK', b'\x12'), (b'Resume a conversation', b'\r'), (b'RESUMED_FIXTURE_OK', b'\x15/exit\r')]
stage=0; data=b''; pending=b''; end=time.monotonic()+12
while time.monotonic()<end:
    if select.select([master], [], [], .1)[0]:
        try: chunk=os.read(master, 65536)
        except OSError: break
        data+=chunk; pending+=chunk
        if stage<len(steps) and steps[stage][0] in pending:
            os.write(master,steps[stage][1]); stage+=1; pending=b''
    if child.poll() is not None: break
try: child.wait(timeout=1)
except subprocess.TimeoutExpired:
    child.kill(); child.wait(); sys.stdout.buffer.write(data); sys.exit(2)
os.close(master); sys.stdout.buffer.write(data)
sys.exit(child.returncode if stage==len(steps) else 3)
`;
  const result = await runProcess('/usr/bin/python3', ['-c', driver, process.execPath, root], { env: { ...process.env, TERM: 'xterm-256color', ONBOARDER_AGENT_HOME: home, HERMES_HOME: home + '/hermes', ONBOARDER_HERMES_BIN: process.execPath }, timeoutMs: 16000 });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Conversation saved/); assert.match(result.stdout, /KEEP_DRAFT/);
  assert.match(result.stdout, /FILE_PICKER_OK/); assert.match(result.stdout, /RESUMED_FIXTURE_OK/);
  assert.equal(await fs.access(path.join(home, 'runs')).then(() => true).catch(() => false), false);
});
