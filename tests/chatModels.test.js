import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { HermesModels } from '../cli/chat/models.js';
import { ChatController } from '../cli/chat/controller.js';
import { ChatStore } from '../cli/chat/store.js';
import { runProcess } from '../cli/agent/process.js';

const launch = ['fixture-python', '-I', '-c', "import os, sys, runpy; import hermes_bootstrap; runpy.run_module('hermes_cli.main', run_name='__main__', alter_sys=True)"];
test('Hermes model adapter uses installation bootstrap, filters catalog display fields and never exports credentials', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-model-adapter-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { HERMES_HOME: path.join(home, 'hermes'), ONBOARDER_HERMES_BIN: 'fixture-hermes' }, requests = [];
  const execute = async (command, args, options) => {
    requests.push({ command, args, options });
    if (command === 'fixture-hermes') return { code: 0, stdout: JSON.stringify(launch), stderr: '' };
    const request = JSON.parse(options.input);
    assert.equal(command, 'fixture-python'); assert.match(args[2], /import hermes_bootstrap; exec\(sys.argv\[1\]\)/);
    assert.match(args[3], /persist_model_selection/); assert.match(args[3], /redirect_stdout/);
    const value = request.action === 'catalog' ? { providers: [{ id: 'fixture', name: '\x1b[31mFixture\x1b[0m', api_key: 'secret-never-returned', models: ['model-a', 'model-a', null, 'model-b'] }] }
      : { success: true, model: request.model, provider: request.provider, api_key: 'secret-never-returned' };
    return { code: 0, stdout: 'ONBOARDER_MODEL_JSON:' + JSON.stringify(value), stderr: '' };
  };
  const api = new HermesModels(home, env, execute), signal = new AbortController().signal;
  const catalog = await api.catalog(signal);
  assert.deepEqual(catalog, [{ id: 'fixture', name: 'Fixture', models: ['model-a', 'model-b'] }]);
  assert.deepEqual(await api.select('model-b', 'fixture', signal), { model: 'model-b', provider: 'fixture' });
  assert.ok(!JSON.stringify(catalog).includes('secret'));
  assert.ok(requests.every(r => r.options.env.HERMES_HOME.startsWith(path.join(home, 'hermes', 'profiles'))));
});

test('unsupported Hermes launchers and failed model activation offer full setup without a blind config write', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-model-fallback-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { HERMES_HOME: path.join(home, 'hermes') };
  const unsupported = new HermesModels(home, env, async () => ({ code: 0, stdout: 'old launcher', stderr: '' }));
  await assert.rejects(unsupported.catalog(new AbortController().signal), /model configure/);
  const denied = new HermesModels(home, env, async (command) => ({ code: 0, stdout: command === 'hermes' ? JSON.stringify(launch) : 'ONBOARDER_MODEL_JSON:{"success":false}', stderr: '' }));
  await assert.rejects(denied.select('model', 'provider', new AbortController().signal), /credentials/);
});

test('bare /model opens the picker; cancellation keeps overrides and session, accepted selection resets context', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-model-controller-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  let changed = false; const calls = [];
  const controller = new ChatController({ root: process.cwd(), mode: 'ask', model: 'old', provider: 'old-provider', checks: false, github: false, timeout: 30, maxTurns: 4 }, {
    output: () => {}, store: new ChatStore(home), chooseModel: async configure => { calls.push(configure); return changed; },
  });
  controller.record.lastRun = 'existing-session';
  await controller.accept('/model'); assert.deepEqual(calls, [false]); assert.equal(controller.record.lastRun, 'existing-session'); assert.equal(controller.settings.model, 'old');
  changed = true; await controller.accept('/model configure'); assert.deepEqual(calls, [false, true]); assert.equal(controller.record.lastRun, null); assert.equal(controller.settings.model, undefined); assert.equal(controller.settings.provider, undefined);
});

test('native first launch offers setup, configures through Hermes, returns to chat and cancels bare /model safely', { skip: process.platform !== 'darwin' }, async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-first-model-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const binary = path.join(home, 'hermes');
  await fs.writeFile(binary, `#!/usr/bin/env node
import fs from 'node:fs';
if (process.argv.includes('--print-runtime-command')) { console.log('unsupported fixture launcher'); process.exit(0); }
console.log('MODEL_PROVIDER_WIZARD_READY');
process.stdin.once('data', () => { const file = process.env.HERMES_HOME + '/config.yaml'; const config = JSON.parse(fs.readFileSync(file)); config.model = { default: 'configured-fixture', provider: 'fixture' }; fs.writeFileSync(file, JSON.stringify(config), {mode: 0o600}); console.log('MODEL_SAVED'); process.exit(0); });
`, { mode: 0o700 });
  const python = String.raw`import os, pty, select, subprocess, sys, time
master, slave = pty.openpty()
child = subprocess.Popen([sys.argv[1], 'bin/onboarder.js', 'chat', '--no-color'], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
data = b''
stage = 0
end = time.monotonic() + 8
while time.monotonic() < end:
    if select.select([master], [], [], 0.1)[0]:
        try: data += os.read(master, 65536)
        except OSError: break
        if stage == 0 and b'Welcome' in data and b'Model & Provider' in data:
            os.write(master, b'\r'); stage = 1
        elif stage == 1 and b'MODEL_PROVIDER_WIZARD_READY' in data:
            os.write(master, b'fixture\n'); stage = 2
        elif stage == 2 and b'configured-fixture' in data and data.rfind('Type / for commands · PgUp/PgDn scroll'.encode()) > data.rfind(b'MODEL_SAVED'):
            os.write(master, b'/model\r'); stage = 3
        elif stage == 3 and b'Model Picker' in data:
            os.write(master, b'\x1b'); stage = 4
        elif stage == 4 and b'Model selection closed' in data:
            os.write(master, b'/exit\r'); stage = 5
    if child.poll() is not None: break
try: child.wait(timeout=2)
except subprocess.TimeoutExpired:
    child.kill(); child.wait(timeout=3)
    sys.stdout.buffer.write(data); sys.exit(2)
os.close(master)
sys.stdout.buffer.write(data)
sys.exit(child.returncode)
`;
  const result = await runProcess('/usr/bin/python3', ['-c', python, process.execPath], { env: { ...process.env, TERM: 'xterm-256color', ONBOARDER_AGENT_HOME: home, HERMES_HOME: path.join(home, 'hermes-root'), ONBOARDER_HERMES_BIN: binary }, timeoutMs: 16000 });
  assert.equal(result.code, 0, result.stdout + result.stderr); assert.match(result.stdout, /MODEL_SAVED/); assert.match(result.stdout, /Conversation saved/);
  assert.equal(await fs.access(path.join(home, 'runs')).then(() => true).catch(() => false), true, 'Setup prepares run storage without performing inference');
  assert.deepEqual(await fs.readdir(path.join(home, 'runs')), []);
});
