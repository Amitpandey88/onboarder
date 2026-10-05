import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { hermesInstalled, hermesInstallCommand, installHermes } from '../cli/chat/runtime.js';
import { runProcess } from '../cli/agent/process.js';

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-chat-runtime-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return { home, binary: path.join(home, 'hermes'), env: { ...process.env, TERM: 'xterm-256color',
    ONBOARDER_AGENT_HOME: home, HERMES_HOME: path.join(home, 'installation'), ONBOARDER_HERMES_BIN: path.join(home, 'hermes') } };
}

test('Hermes detection respects explicit paths, permissions, and PATH without launching configuration', async t => {
  const { home, binary, env } = await fixture(t);
  assert.equal(await hermesInstalled(env), false);
  await fs.mkdir(binary);
  assert.equal(await hermesInstalled(env), false);
  await fs.rmdir(binary);
  await fs.writeFile(binary, '#!/bin/sh\nexit 0\n', { mode: 0o600 });
  if (process.platform !== 'win32') assert.equal(await hermesInstalled(env), false);
  await fs.chmod(binary, 0o700);
  assert.equal(await hermesInstalled(env), true);
  assert.equal(await hermesInstalled({ ...env, ONBOARDER_HERMES_BIN: 'hermes', PATH: home }), true);
  assert.match(hermesInstallCommand('darwin'), /^curl -fsSL https:\/\/hermes-agent.nousresearch.com\/install.sh \| bash$/);
  assert.match(hermesInstallCommand('win32'), /install.ps1/);
});

test('installer downloads the official script, keeps installation environment and cleans up after execution', async t => {
  const { env } = await fixture(t);
  let scriptFile;
  await installHermes(new AbortController().signal, env, {
    download: async url => {
      assert.equal(url, 'https://hermes-agent.nousresearch.com/install' + (process.platform === 'win32' ? '.ps1' : '.sh'));
      return new Response('fixture installer');
    },
    execute: async (command, args, childEnv) => {
      assert.equal(command, process.platform === 'win32' ? 'powershell.exe' : 'bash');
      scriptFile = args.at(-1);
      assert.equal(await fs.readFile(scriptFile, 'utf8'), 'fixture installer');
      assert.equal(childEnv.HERMES_HOME, env.HERMES_HOME);
      return 0;
    },
  });
  assert.equal(await fs.access(scriptFile).then(() => true).catch(() => false), false);
});

test('download errors and installer failures do not report installation success', async t => {
  const { env } = await fixture(t);
  let executed = false, file;
  await assert.rejects(installHermes(new AbortController().signal, env, {
    download: async () => new Response('', { status: 503 }), execute: async () => { executed = true; return 0; },
  }), /HTTP 503/);
  assert.equal(executed, false);
  await assert.rejects(installHermes(new AbortController().signal, env, {
    download: async () => new Response('fixture installer'), execute: async (_command, args) => { file = args.at(-1); return 7; },
  }), /exit 7/);
  assert.equal(await fs.access(file).then(() => true).catch(() => false), false);
});

async function terminal(env, steps) {
  const driver = String.raw`import os, pty, select, subprocess, sys, time, json, signal
master, slave = pty.openpty()
# Mock only the download; the actual installer process and model wizard own the TTY.
wrapper = "import fs from 'node:fs'; import { runChat } from './cli/chat/app.js'; globalThis.fetch = async () => new Response(fs.readFileSync(process.env.FIXTURE_INSTALL_SCRIPT, 'utf8')); process.exitCode = await runChat({ flags: { model: process.env.FIXTURE_MODEL } });"
child = subprocess.Popen([sys.argv[1], '--input-type=module', '-e', wrapper], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
steps = json.loads(sys.argv[2]); stage = 0; data = b''; pending = b''
end = time.monotonic() + 10
while time.monotonic() < end:
    if select.select([master], [], [], 0.1)[0]:
        try: chunk = os.read(master, 65536)
        except OSError: break
        data += chunk; pending += chunk
        if stage < len(steps) and steps[stage][0].encode() in pending:
            if steps[stage][1] == ':sigint': child.send_signal(signal.SIGINT)
            else: os.write(master, steps[stage][1].encode())
            stage += 1; pending = b''
    if child.poll() is not None: break
try: child.wait(timeout=1)
except subprocess.TimeoutExpired:
    child.kill(); child.wait(); sys.stdout.buffer.write(data); sys.exit(2)
os.close(master); sys.stdout.buffer.write(data)
sys.exit(child.returncode if stage == len(steps) else 3)
`;
  const result = await runProcess('/usr/bin/python3', ['-c', driver, process.execPath, JSON.stringify(steps)], { env, timeoutMs: 15000 });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result.stdout;
}

test('missing Hermes prompts even with a model override; offline and /model configure stay usable', { skip: process.platform !== 'darwin' }, async t => {
  const { env } = await fixture(t);
  const output = await terminal({ ...env, FIXTURE_MODEL: 'stale-model' }, [
    ['Press Enter to run the official', '\x1b'],
    ['Model selection closed', '/model configure\r'],
    ['Press Enter to run the official', '\x1b'],
    ['Model selection closed', '/exit\r'],
  ]);
  assert.match(output, /Hermes is not installed/);
  assert.match(output, /install.sh/);
  assert.doesNotMatch(output, /Could not start|Model Picker|Welcome — Model/);
});

test('Enter runs installation with exclusive terminal input, then opens provider configuration', { skip: process.platform !== 'darwin' }, async t => {
  const { home, env } = await fixture(t);
  const script = path.join(home, 'fixture-install.sh');
  await fs.writeFile(script, `#!/bin/bash
printf 'FIXTURE_INSTALL_READY\\n'
read -r answer
cat > "$ONBOARDER_HERMES_BIN" <<'WIZARD'
#!/usr/bin/env node
import fs from 'node:fs';
console.log('FIXTURE_PROVIDER_READY');
process.stdin.once('data', () => { const file = process.env.HERMES_HOME + '/config.yaml'; const config = JSON.parse(fs.readFileSync(file)); config.model = { default: 'fixture-installed-model', provider: 'fixture' }; fs.writeFileSync(file, JSON.stringify(config)); console.log('FIXTURE_MODEL_SAVED'); process.exit(0); });
WIZARD
chmod +x "$ONBOARDER_HERMES_BIN"
`);
  const output = await terminal({ ...env, FIXTURE_INSTALL_SCRIPT: script }, [
    ['Press Enter to run the official', '\r'],
    ['FIXTURE_INSTALL_READY', 'install\n'],
    ['FIXTURE_PROVIDER_READY', 'provider\n'],
    ['Hermes profile default', '/exit\r'],
  ]);
  assert.match(output, /FIXTURE_MODEL_SAVED/);
  assert.equal(await hermesInstalled(env), true);
});

test('failed installation returns to offline chat and can be retried with /model', { skip: process.platform !== 'darwin' }, async t => {
  const { home, env } = await fixture(t);
  const script = path.join(home, 'failure.sh');
  await fs.writeFile(script, 'exit 7\n');
  const output = await terminal({ ...env, FIXTURE_INSTALL_SCRIPT: script }, [
    ['Press Enter to run the official', '\r'],
    ['Model selection closed', '/model\r'],
    ['Press Enter to run the official', '\x1b'],
    ['Model selection closed', '/exit\r'],
  ]);
  assert.match(output, /installation did not complete \(exit 7\)/);
  assert.equal(await hermesInstalled(env), false);
});

test('cancelling installation restores terminal ownership and allows a clean exit', { skip: process.platform !== 'darwin' }, async t => {
  const { home, env } = await fixture(t);
  const script = path.join(home, 'cancel.sh');
  await fs.writeFile(script, 'printf "FIXTURE_CANCEL_READY\\n"\nread -r answer\n');
  const output = await terminal({ ...env, FIXTURE_INSTALL_SCRIPT: script }, [
    ['Press Enter to run the official', '\r'],
    ['FIXTURE_CANCEL_READY', ':sigint'],
    ['Task cancelled.', '/exit\r'],
  ]);
  assert.match(output, /Conversation saved/);
  assert.equal(await hermesInstalled(env), false);
});
