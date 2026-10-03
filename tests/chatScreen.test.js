import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TerminalScreen, wrapScreenLine } from '../cli/chat/screen.js';
import { TerminalComposer } from '../cli/chat/composer.js';
import { chatBanner } from '../cli/chat/render.js';
import { cells } from '../cli/chat/text.js';
import { terminalText, runProcess } from '../cli/agent/process.js';

const settings = { root: '/项目/onboarder', mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 };
const tick = () => new Promise(resolve => setTimeout(resolve, 35));

test('screen wraps Unicode and code indentation, retains text color and refuses cursor escape sequences', () => {
  const rows = wrapScreenLine('\x1b[33m  👨‍💻中文 é code\x1b[0m\x1b[2J', 8);
  assert.ok(rows.every(r => cells(r) <= 8));
  assert.equal(rows.map(terminalText).join(''), '  👨‍💻中文 é code');
  assert.ok(rows.some(r => r.includes('\x1b[33m'))); assert.ok(rows.every(r => !r.includes('\x1b[2J')));
  assert.deepEqual(wrapScreenLine('中😀', 1), ['?', '?']);
});

test('transcript paging preserves the reading position while new output arrives and reflows on resize', () => {
  const output = new PassThrough(), screen = new TerminalScreen(output);
  screen.append(Array.from({ length: 40 }, (_, i) => 'Line ' + String(i).padStart(2, '0')).join('\n'));
  assert.deepEqual(screen.view(30, 5, ''), ['Line 35', 'Line 36', 'Line 37', 'Line 38', 'Line 39']);
  screen.scroll(1, 30, 5); const page = screen.view(30, 5, ''); assert.equal(screen.scrolled, true);
  screen.append('Line 40'); assert.deepEqual(screen.view(30, 5, ''), page);
  screen.scroll(-1, 30, 5); screen.scroll(-1, 30, 5); assert.equal(screen.view(30, 5, '').at(-1), 'Line 40');
  screen.append('A long source line with 中文 and emoji 😀');
  assert.ok(screen.view(8, 8, '').every(r => cells(r) <= 8));
  screen.clear(); assert.deepEqual(screen.view(30, 5, 'NEW WELCOME'), ['NEW WELCOME']); assert.equal(screen.scrolled, false);
});

test('full screen uses alternate terminal state and paints only changed rows', () => {
  const output = new PassThrough(); let data = ''; output.on('data', s => { data += s; });
  const screen = new TerminalScreen(output); screen.enter(); screen.draw(['Header', 'Answer', 'ask ›'], 80, 2, 6);
  assert.match(data, /\x1b\[\?1049h/); data = '';
  screen.draw(['Header', 'Answer', 'ask › hi'], 80, 2, 8);
  assert.ok(!data.includes('\x1b[2J')); assert.ok(!data.includes('Header')); assert.match(data, /ask › hi/);
  data = ''; screen.draw(['Header', 'Answer', 'ask › hi'], 80, 2, 8); assert.ok(!data.includes('\x1b[2K'));
  data = ''; screen.leave(); screen.leave(); assert.equal((data.match(/\?1049l/g) || []).length, 1);
  assert.match(data, /\?25h/);
});

test('welcome automatically fits the viewport and switches between full and compact original logos', () => {
  for (const columns of [8, 24, 60, 80, 120, 240]) for (const height of [1, 4, 9, 12, 18, 24, 36, 60]) {
    const banner = chatBanner(settings, columns, undefined, 'fixture', { fullscreen: true, rows: height, tools: 37 });
    assert.ok(banner.split('\n').length <= height, `${columns}x${height} height`);
    assert.ok(banner.split('\n').every(r => cells(r) < columns), `${columns}x${height} width`);
  }
  const wide = chatBanner(settings, 240, undefined, 'fixture', { fullscreen: true, rows: 40, tools: 37 });
  assert.ok(wide.includes('▄██████▄')); assert.ok(wide.includes('Available Tools')); assert.ok(wide.split('\n').some(r => cells(r) > 200));
  assert.ok(chatBanner(settings, 80, undefined, 'fixture', { fullscreen: true, rows: 18 }).includes('●┼●'));
});

test('fullscreen composer pins input, keeps drafts through resizing and wizard handoff, and scrolls without editing', async t => {
  const input = new PassThrough(), output = new PassThrough(); let data = '';
  input.isRaw = false; input.setRawMode = raw => { input.isRaw = raw; };
  output.columns = 80; output.rows = 24; output.on('data', s => { data += s; });
  const app = new TerminalComposer({ input, output, fullscreen: true, welcome: (c, r) => chatBanner(settings, c, undefined, 'fixture', { fullscreen: true, rows: r }),
    header: () => 'ONBOARDER HEADER', state: () => ({ mode: 'ask', status: 'model │ repo', busy: false, pasting: false, files: [] }), submit: () => {}, cancel: () => {}, exit: () => {},
  });
  t.after(() => { app.close(); input.destroy(); output.destroy(); });
  app.start(); assert.ok(data.includes('\x1b[22;7H'), 'Input cursor sits two rows above terminal bottom');
  app.print(Array.from({ length: 60 }, (_, i) => 'Conversation ' + i).join('\n'));
  app.key('A draft with 中文 and 😀', {}); await tick();
  app.key('', { name: 'pageup' }); await tick(); assert.ok(data.includes('history · PgDn')); assert.equal(app.value, 'A draft with 中文 and 😀');
  output.columns = 42; output.rows = 12; output.emit('resize'); await tick();
  assert.equal(app.value, 'A draft with 中文 and 😀');
  app.suspend(); assert.equal(input.isRaw, false); assert.equal(input.isPaused(), true); assert.ok(data.includes('\x1b[?1049l'));
  app.start(); assert.equal(input.isRaw, true); assert.equal(app.value, 'A draft with 中文 and 😀');
  const picker = app.choose({ title: 'Models', choices: [{ value: 'a', label: 'Model A' }] });
  output.rows = 5; output.emit('resize'); data = ''; await tick();
  const positions = [...data.matchAll(/\x1b\[(\d+);(\d+)H/g)];
  assert.ok(positions.every(p => Number(p[1]) <= 5 && Number(p[2]) <= 42));
  app.key('', { name: 'escape' }); assert.equal(await picker, null);
});

test('real terminal resizes fullscreen chat and restores the shell screen on exit', { skip: process.platform !== 'darwin' }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-screen-pty-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const python = String.raw`import os, pty, select, subprocess, sys, time, fcntl, termios, struct, signal
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 38, 120, 0, 0))
child = subprocess.Popen([sys.argv[1], 'bin/onboarder.js', 'chat', '--no-color', '--model', 'fixture'], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
data = b''
stage = 0
end = time.monotonic() + 8
while time.monotonic() < end:
    if select.select([master], [], [], 0.1)[0]:
        try: chunk = os.read(master, 65536)
        except OSError: break
        data += chunk
        if stage == 0 and 'ask › '.encode() in data:
            os.write(master, b'RESIZE_DRAFT'); stage = 1
        elif stage == 1 and b'RESIZE_DRAFT' in data:
            fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 16, 48, 0, 0))
            child.send_signal(signal.SIGWINCH); stage = 2
        elif stage == 2 and b'\x1b[14;' in chunk:
            os.write(master, b'\x15/exit\r'); stage = 3
    if child.poll() is not None: break
try: child.wait(timeout=2)
except subprocess.TimeoutExpired:
    child.kill(); child.wait(timeout=3); sys.stdout.buffer.write(data); sys.exit(2)
os.close(master)
sys.stdout.buffer.write(data)
sys.exit(child.returncode)
`;
  const result = await runProcess('/usr/bin/python3', ['-c', python, process.execPath], { env: { ...process.env, TERM: 'xterm-256color', ONBOARDER_AGENT_HOME: home }, timeoutMs: 12000 });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\x1b\[\?1049h/); assert.match(result.stdout, /\x1b\[\?1049l/); assert.match(result.stdout, /Conversation saved/);
  assert.match(result.stdout, /RESIZE_DRAFT/); assert.ok(result.stdout.indexOf('\x1b[?1049l') < result.stdout.indexOf('Conversation saved'));
});
