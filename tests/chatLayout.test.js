import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TerminalScreen, screenDivider } from '../cli/chat/screen.js';
import { TerminalComposer } from '../cli/chat/composer.js';
import { ChatRenderer } from '../cli/chat/render.js';
import { cells } from '../cli/chat/text.js';
import { runProcess } from '../cli/agent/process.js';

test('transcript borders resize as single rows, retain code and stay anchored while new blocks arrive', () => {
  const screen = new TerminalScreen(new PassThrough());
  const top = { label: '◈ Onboarder · ask 中文', edge: 'top' }, bottom = { label: '✓ completed · 1.2s', edge: 'bottom' };
  screen.appendDivider(top); screen.append('  const value = 1;'); screen.appendDivider(bottom);
  for (const width of [100, 42, 24, 8, 2, 100]) {
    const rows = screen.view(width, 100, '');
    assert.equal(rows[0], screenDivider(top, width)); assert.equal(rows.at(-1), screenDivider(bottom, width));
    assert.ok(rows.every(row => cells(row) <= width));
    assert.equal(rows.slice(1, -1).join(''), '  const value = 1;');
  }
  screen.append(Array.from({ length: 40 }, (_, i) => 'Earlier ' + i).join('\n'));
  screen.scroll(1, 42, 8); const page = screen.view(42, 8, '');
  screen.appendDivider(top); screen.append('New answer'); screen.appendDivider(bottom);
  assert.deepEqual(screen.view(42, 8, ''), page); assert.equal(screen.unread, 3);
  screen.latest(); assert.equal(screen.view(42, 8, '').at(-1), screenDivider(bottom, 42));
});

test('assistant blocks close across success, cancellation and failure without duplicating streamed content', () => {
  for (const status of ['completed', 'cancelled', 'failed']) {
    const lines = [], borders = [], renderer = new ChatRenderer(text => lines.push(text), undefined,
      { GITHUB_TOKEN: 'fixture-secret' }, { divider: divider => borders.push(divider) });
    renderer.handle({ type: 'start', mode: 'ask', prompt: 'Explain' });
    renderer.handle({ type: 'event', event: { type: 'tool_use', name: 'mcp__onboarder__onboarder_context' } });
    renderer.handle({ type: 'event', event: { type: 'text', text: '## Result\n```ts\n  const value = 1;\n```\nfixture-' } });
    renderer.handle({ type: 'event', event: { type: 'text', text: 'secret\nDone\n' } });
    renderer.handle({ type: 'end', elapsed: 1250, result: { id: 'run-fixture', answer: status === 'completed'
      ? '## Result\n```ts\n  const value = 1;\n```\nfixture-secret\nDone\n' : 'Stopped safely.', status, branch: null, workspace: '.' } });
    renderer.finish();
    assert.equal(borders.length, 2); assert.match(borders[0].label, /Onboarder.*ask/);
    assert.equal(borders[0].edge, 'top'); assert.equal(borders[1].edge, 'bottom'); assert.ok(borders[1].label.includes(status));
    assert.equal(lines.filter(line => line === '  const value = 1;').length, 1);
    assert.equal(lines.filter(line => line === 'Done').length, 1);
    assert.ok(!lines.join('\n').includes('fixture-secret')); assert.match(lines.join('\n'), /\[redacted\]/);
    renderer.handle({ type: 'message', text: 'Offline result\n  source indentation' });
    assert.equal(borders.length, 4); assert.match(borders[2].label, /Result/);
    assert.equal(borders[3].edge, 'bottom'); assert.ok(lines.includes('Offline result\n  source indentation'));
  }
});

test('submitted messages and the pinned input have distinct borders without changing the draft or cursor', async t => {
  const input = new PassThrough(), output = new PassThrough(), submitted = [];
  input.setRawMode = () => {}; output.columns = 80; output.rows = 24;
  let data = ''; output.on('data', chunk => { data += chunk; });
  const app = new TerminalComposer({ input, output, fullscreen: true,
    state: () => ({ mode: 'ask', status: 'Ready │ offline', busy: false, pasting: false, files: [] }),
    submit: message => submitted.push(message), cancel: () => {}, exit: () => {} });
  app.start(); t.after(() => { app.close(); input.destroy(); output.destroy(); });
  app.key('Explain 中文\n  pasted source', {}); app.key('', { name: 'return' });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(submitted, ['Explain 中文\n  pasted source']);
  assert.match(data, /╭─ You /); assert.match(data, /● Explain 中文/); assert.match(data, /  pasted source/); assert.match(data, /╭─ Message /);
  app.key('Keep this draft', {}); output.columns = 32; output.rows = 12; data = ''; output.emit('resize');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(app.value, 'Keep this draft');
  assert.match(data, /╭─ Message /);
  assert.ok([...data.matchAll(/\x1b\[(\d+);(\d+)H/g)].every(match => +match[1] <= 12 && +match[2] <= 32));
});

test('actual terminal renders a streamed reply, tool activity and completion inside the new chat borders', { skip: process.platform !== 'darwin' }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-chat-layout-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const binary = path.join(home, 'hermes-fixture');
  await fs.writeFile(binary, `#!/usr/bin/python3
import json, sys, time
sys.stdin.read()
for event in [
 {'type': 'tool_use', 'name': 'mcp__onboarder__onboarder_context'},
 {'type': 'text', 'text': 'Layout fixture response\\n'},
 {'type': 'result', 'text': 'Layout fixture response\\n', 'session_id': 'layout-fixture', 'exit_code': 0}
]:
 print(json.dumps(event), flush=True)
 time.sleep(0.08)
`, { mode: 0o700 });
  const driver = String.raw`import os, pty, select, subprocess, sys, time, fcntl, termios, struct
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 26, 100, 0, 0))
child = subprocess.Popen([sys.argv[1], 'bin/onboarder.js', 'chat', '--no-color', '--model', 'Layout fixture'], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
data = b''; stage = 0; end = time.monotonic() + 10
try:
 while time.monotonic() < end:
  if select.select([master], [], [], 0.1)[0]:
   try: data += os.read(master, 65536)
   except OSError: break
   if stage == 0 and '● Ready'.encode() in data:
    os.write(master, b'Explain the repository\r'); stage = 1
   elif stage == 1 and '✓ completed'.encode() in data:
    os.write(master, b'/exit\r'); stage = 2
  if child.poll() is not None: break
 child.wait(timeout=2)
 sys.stdout.buffer.write(data)
 sys.exit(child.returncode if stage == 2 else 3)
finally:
 if child.poll() is None: child.kill(); child.wait()
 os.close(master)
`;
  const result = await runProcess('/usr/bin/python3', ['-c', driver, process.execPath], { env: {
    ...process.env, TERM: 'xterm-256color', ONBOARDER_AGENT_HOME: home, HERMES_HOME: path.join(home, 'hermes'), ONBOARDER_HERMES_BIN: binary,
  }, timeoutMs: 15000 });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /╭─ You /); assert.match(result.stdout, /╭─ ◈ Onboarder · ask /);
  assert.match(result.stdout, /→ context/); assert.match(result.stdout, /Layout fixture response/);
  assert.match(result.stdout, /╰─ ✓ completed/); assert.match(result.stdout, /╭─ Message /);
  assert.match(result.stdout, /Conversation saved/); assert.match(result.stdout, /\x1b\[\?1049l/);
});
