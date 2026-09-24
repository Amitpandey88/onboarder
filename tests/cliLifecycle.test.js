import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { writeSettings } from '../server/config.js';
import { listenError, startupBanner } from '../server/index.js';
import { pidPath, readPidFile, writePidFile, removePidFile } from '../server/pidfile.js';
import { runStart, runStatus, runStop } from '../cli/commands.js';
import { main } from '../cli/main.js';

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-cli-test-'));
  const configFile = path.join(dir, 'config.json');
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  await writeSettings({ mode: 'local', host: '127.0.0.1', port }, configFile);
  return { dir, configFile, flags: { config: configFile } };
}

test('help is a command as well as a flag', async () => {
  const original = console.log;
  const lines = [];
  console.log = (line) => lines.push(String(line));
  try {
    assert.equal(await main(['help']), 0);
    assert.equal(await main(['--help']), 0);
  } finally {
    console.log = original;
  }
  assert.match(lines.join('\n'), /onboarder status/);
  assert.match(lines.join('\n'), /onboarder config/);
});

test('a second start is refused cleanly when the PID record is live', async () => {
  const { dir, configFile, flags } = await fixture();
  writePidFile(configFile);
  const errors = [];
  try {
    const code = await runStart({ flags, out() {}, err: (line) => errors.push(String(line)) });
    assert.equal(code, 1);
  } finally {
    removePidFile(configFile);
    await fs.rm(dir, { recursive: true, force: true });
  }
  assert.match(errors.join('\n'), /already running/);
  assert.match(errors.join('\n'), /onboarder stop/);
});

test('status and stop understand a stale process record', async () => {
  const { dir, configFile, flags } = await fixture();
  const status = [];
  const stopped = [];
  try {
    await fs.writeFile(pidPath(configFile), '99999999\n');
    assert.equal(await runStatus({ flags, out: (line) => status.push(String(line)) }), 0);
    assert.match(status.join('\n'), /Stopped/);
    assert.equal(readPidFile(configFile), null);

    await fs.writeFile(pidPath(configFile), '99999999\n');
    assert.equal(await runStop({ flags, out: (line) => stopped.push(String(line)) }), 0);
    assert.equal(readPidFile(configFile), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
  assert.match(stopped.join('\n'), /stale process record/);
});

test('busy ports produce recovery commands, not a raw EADDRINUSE sentence', () => {
  const error = listenError(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }), {
    host: '127.0.0.1', port: 4310, pid: 123,
  });
  assert.match(error.message, /127\.0\.0\.1:4310 is already in use/);
  assert.match(error.message, /PID 123/);
  assert.match(error.message, /onboarder status/);
  assert.match(error.message, /config set port/);
});

test('a self-hosted loopback summary warns that it is not directly reachable', () => {
  const banner = startupBanner({
    mode: 'self-hosted', host: '127.0.0.1', port: 4310, domain: '', accessKey: 'x'.repeat(20),
    autoOpen: false, tunnel: { cloudflare: false, tailscale: false },
  });
  assert.match(banner, /self-hosted/);
  const summary = startupBanner({
    mode: 'self-hosted', host: '127.0.0.1', port: 4310, domain: '', accessKey: '',
    autoOpen: false, tunnel: { cloudflare: false, tailscale: false },
  });
  assert.match(summary, /no access key/);
});
