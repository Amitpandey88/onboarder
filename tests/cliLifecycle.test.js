import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { writeSettings } from '../server/config.js';
import { listenError, startupBanner } from '../server/index.js';
import { pidPath, readPidFile, readRunInfo, writePidFile, removePidFile, runInfoPath } from '../server/pidfile.js';
import { runStart, runStatus, runStop } from '../cli/commands.js';
import { main } from '../cli/main.js';

// Everything here runs against a temp config and, where a real server is
// involved, a port the OS just handed us — never the developer's own instance.
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
  assert.match(lines.join('\n'), /onboarder https/);
  assert.match(lines.join('\n'), /--https/);
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

// --------------------------------------------------------- background start ---

// The real thing: spawn the actual CLI as a detached child, wait for it to
// answer, and prove it is still serving after the parent is gone. This is the
// only test that can catch a regression in "survives closing the terminal" —
// everything else about the feature is bookkeeping.
test('start background leaves a serving, recorded process behind', async (t) => {
  const { dir, configFile, flags } = await fixture();
  const port = JSON.parse(await fs.readFile(configFile, 'utf8')).port;
  const started = spawnSync(process.execPath, [
    new URL('../bin/onboarder.js', import.meta.url).pathname,
    'start', 'background', '--config', configFile, '--timeout', '25',
  ], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

  t.after(async () => {
    const pid = readPidFile(configFile);
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
    await fs.rm(dir, { recursive: true, force: true });
  });

  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.match(started.stdout, /background/i);
  // The panel is the point of the feature: the URL, the pid, and where the log is.
  assert.match(started.stdout, new RegExp(`localhost:${port}`));
  assert.match(started.stdout, /onboarder\.log/);

  // Recorded, alive, and answering HTTP.
  const pid = readPidFile(configFile);
  assert.ok(pid, 'a background start must record its pid');
  assert.doesNotThrow(() => process.kill(pid, 0));
  const health = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', () => resolve(null));
  });
  assert.equal(health?.status, 200);
  assert.deepEqual(JSON.parse(health.body), { ok: true });

  // The run record says how it was launched, which is what `status` reads to
  // tell someone their terminal is no longer load-bearing.
  const info = readRunInfo(configFile);
  assert.equal(info.mode, 'background');
  assert.equal(info.port, port);
  assert.match(info.log, /onboarder\.log$/);

  // And the log file exists, with the request we just made in it.
  const log = await fs.readFile(info.log, 'utf8');
  assert.match(log, /GET \/api\/health 200/);
});

test('a second background start refuses while one is recorded', async () => {
  const { dir, configFile, flags } = await fixture();
  writePidFile(configFile);
  const errors = [];
  try {
    const { runStartBackground } = await import('../cli/commands.js');
    const code = await runStartBackground({ flags, out() {}, err: (l) => errors.push(String(l)) });
    assert.equal(code, 1);
  } finally {
    removePidFile(configFile);
    await fs.rm(dir, { recursive: true, force: true });
  }
  assert.match(errors.join('\n'), /already running/);
});

// A background start that cannot bind must fail, not report a cheerful success —
// and the log tail it prints is the actual reason, because that is the only place
// the reason exists. The readiness probe alone cannot catch this: a *foreign*
// process on the port answers /api/health perfectly well.
test('a background start that cannot bind fails with the reason from its log', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-busy-'));
  const configFile = path.join(dir, 'config.json');
  // Hold the port with something that is not Onboarder.
  const squatter = net.createServer();
  await new Promise((resolve) => squatter.listen(0, '127.0.0.1', resolve));
  const port = squatter.address().port;
  await writeSettings({ mode: 'local', host: '127.0.0.1', port }, configFile);

  try {
    const result = spawnSync(process.execPath, [
      new URL('../bin/onboarder.js', import.meta.url).pathname,
      'start', 'background', '--config', configFile, '--timeout', '3',
    ], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

    assert.equal(result.status, 1, 'a failed start must not exit 0');
    assert.match(result.stderr, /did not start in the background/);
    // The port conflict and the way out, not a stack trace.
    assert.match(result.stderr, new RegExp(`127\\.0\\.0\\.1:${port} is already in use`));
    assert.match(result.stderr, /onboarder config set port/);
    // And no pid record is left behind claiming something is running.
    assert.equal(readPidFile(configFile), null);
  } finally {
    await new Promise((resolve) => squatter.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('logs explains itself when there is no log file yet', async () => {
  const { dir, configFile, flags } = await fixture();
  const errors = [];
  const { runLogs } = await import('../cli/commands.js');
  try {
    const code = await runLogs({ flags, out() {}, err: (l) => errors.push(String(l)) });
    assert.equal(code, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
  assert.match(errors.join('\n'), /No log file/);
  assert.match(errors.join('\n'), /start background/);
});

// The run record is a separate file from the pid on purpose: `removePidFile`
// has to clear both, or `status` keeps reporting a mode for a process that is
// long gone.
test('the run record is removed with the pid, and only by its owner', async () => {
  const { dir, configFile } = await fixture();
  try {
    writePidFile(configFile);
    const { writeRunInfo } = await import('../server/pidfile.js');
    writeRunInfo(configFile, { mode: 'background', port: 1234 });
    assert.equal(readRunInfo(configFile).mode, 'background');

    // A different pid must not be able to delete someone else's record.
    removePidFile(configFile, process.pid + 999999);
    assert.equal(readPidFile(configFile), process.pid);
    assert.equal(readRunInfo(configFile).mode, 'background');

    removePidFile(configFile, process.pid);
    assert.equal(readPidFile(configFile), null);
    assert.equal(readRunInfo(configFile), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a garbage run record is treated as absent, never as a crash', async () => {
  const { dir, configFile } = await fixture();
  try {
    await fs.writeFile(runInfoPath(configFile), 'not json at all');
    assert.equal(readRunInfo(configFile), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
