import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  compareVersions, installMethodLabel, isUpdateAvailable, isValidVersionString,
  npmPackageUrl, parseSemver, releaseNotesUrl, satisfiesMinimumNode,
} from '../shared/update.js';
import {
  applyUpdate, assessInstallation, buildUpdateSteps, checkForUpdates,
  detectInstallationSync, fetchRegistryRelease, readUpdateCache, updateCachePath, writeUpdateCache,
} from '../server/update.js';
import { CONFIG, createServer } from '../server/index.js';
import { generateAccessKey, readSettings, writeSettings } from '../server/config.js';
import { TeamDirectory } from '../server/intelligence/team.js';
import { formatUpdateHintLine, formatUpdateStatusText, updateCommand } from '../cli/update.js';
import { main } from '../cli/main.js';
import { runConfig, runDoctor, runStatus } from '../cli/commands.js';
import { ChatController } from '../cli/chat/controller.js';
import { completeChat, slashInput } from '../cli/chat/commands.js';
import { chatBanner } from '../cli/chat/render.js';
import { lookup as lookupExplorerCommand } from '../cli/explorer/commands.js';
import { summarizeDesktopUpdateView, summarizeUpdateView } from '../public/js/updateUI.js';
import { fetchUpdateStatus, restartOnboarderServer, streamSelfUpdate } from '../public/js/api.js';

function httpRequest(port, { method = 'GET', path: urlPath = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* SSE or non-JSON */ }
        resolve({ status: res.statusCode, text, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function fakeStatus(overrides = {}) {
  return {
    packageName: 'codebase-onboarder',
    currentVersion: '1.1.0',
    latestVersion: '1.2.0',
    updateAvailable: true,
    upToDate: false,
    checkedAt: '2026-11-25T00:00:00.000Z',
    fromCache: false,
    checkDisabled: false,
    installMethod: 'npm-global',
    canAutoUpdate: true,
    canRestart: false,
    serverMode: null,
    reason: null,
    manualCommand: 'npm install -g --ignore-scripts codebase-onboarder@1.2.0',
    releaseUrl: 'https://github.com/Amitpandey88/onboarder/releases/tag/v1.2.0',
    npmUrl: 'https://www.npmjs.com/package/codebase-onboarder/v/1.2.0',
    nodeCompatible: true,
    requiredNode: '>=20',
    releaseNotes: null,
    installing: false,
    error: null,
    ...overrides,
  };
}

// ---- shared semver and metadata helpers --------------------------------------

test('semver parser and comparator order versions and prereleases accurately', () => {
  assert.deepEqual(parseSemver('v1.2.3-beta.1+build.9'), { major: 1, minor: 2, patch: 3, pre: ['beta', '1'] });
  assert.equal(compareVersions('1.10.0', '1.2.0'), 1);
  assert.equal(compareVersions('1.2.0', '1.2.0-beta.1'), 1);
  assert.equal(compareVersions('1.2.0-beta.2', '1.2.0-beta.10'), -1);
  assert.equal(compareVersions('1.1.0', '1.1.0'), 0);

  assert.equal(isUpdateAvailable('1.1.0', '1.2.0'), true);
  assert.equal(isUpdateAvailable('1.2.0', '1.2.0'), false);
  assert.equal(isUpdateAvailable('1.3.0', '1.2.0'), false);
  assert.equal(isUpdateAvailable('1.1.0', null), false);
});

test('version string validation rejects shell/flag payloads and builds safe links', () => {
  assert.equal(isValidVersionString('1.2.3'), true);
  assert.equal(isValidVersionString('1.2.3-rc.1'), true);
  assert.equal(isValidVersionString('v1.2.3'), false);
  assert.equal(isValidVersionString('--registry=http://evil.invalid'), false);
  assert.equal(isValidVersionString('1.2.3 && id'), false);
  assert.equal(isValidVersionString('../1.2.3'), false);

  assert.equal(releaseNotesUrl('1.2.0'), 'https://github.com/Amitpandey88/onboarder/releases/tag/v1.2.0');
  assert.equal(releaseNotesUrl('1.2.0;rm'), null);
  assert.equal(npmPackageUrl('1.2.0'), 'https://www.npmjs.com/package/codebase-onboarder/v/1.2.0');
  assert.equal(installMethodLabel('npm-global'), 'npm global install');
});

test('satisfiesMinimumNode validates >= constraints conservatively', () => {
  assert.equal(satisfiesMinimumNode('24.20.0', '>=20'), true);
  assert.equal(satisfiesMinimumNode('20.10.0', '>=20.19.0'), false);
  assert.equal(satisfiesMinimumNode('20.19.0', '>=20.19.0'), true);
  assert.equal(satisfiesMinimumNode('24.0.0', '>=99'), false);
  assert.equal(satisfiesMinimumNode('24.0.0', null), true);
});

// ---- installation topology & git safety --------------------------------------

test('detectInstallationSync identifies source, npx, npm-local, npm-global, and standalone layouts', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-install-detect-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));

  const localProj = path.join(tmp, 'my-app');
  const localPkg = path.join(localProj, 'node_modules', 'codebase-onboarder');
  await fs.mkdir(localPkg, { recursive: true });
  await fs.writeFile(path.join(localProj, 'package.json'), JSON.stringify({ name: 'my-app', dependencies: { 'codebase-onboarder': '^1.1.0' } }));
  await fs.writeFile(path.join(localPkg, 'package.json'), JSON.stringify({ name: 'codebase-onboarder', version: '1.1.0' }));
  const localInfo = detectInstallationSync({
    projectRoot: localPkg,
    execPath: '/usr/local/bin/node',
    exists: (p) => p === path.join(localProj, 'package.json') || p === '/usr/local/bin/npm',
    isWritable: () => true,
  });
  assert.equal(localInfo.method, 'npm-local');
  assert.equal(localInfo.localRoot, localProj);
  assert.equal(localInfo.canAutoUpdate, true);

  const globalPosix = path.join(tmp, 'prefix', 'lib', 'node_modules', 'codebase-onboarder');
  await fs.mkdir(globalPosix, { recursive: true });
  await fs.writeFile(path.join(globalPosix, 'package.json'), JSON.stringify({ name: 'codebase-onboarder', version: '1.1.0' }));
  const globalInfo = detectInstallationSync({
    projectRoot: globalPosix,
    platform: 'linux',
    execPath: '/usr/local/bin/node',
    exists: (p) => p === '/usr/local/bin/npm',
    isWritable: () => true,
  });
  assert.equal(globalInfo.method, 'npm-global');
  assert.equal(globalInfo.prefix, path.join(tmp, 'prefix'));
  assert.equal(globalInfo.canAutoUpdate, true);

  const readonlyGlobal = detectInstallationSync({
    projectRoot: globalPosix,
    platform: 'linux',
    execPath: '/usr/local/bin/node',
    exists: (p) => p === '/usr/local/bin/npm',
    isWritable: () => false,
  });
  assert.equal(readonlyGlobal.canAutoUpdate, false);
  assert.match(readonlyGlobal.reason, /not writable/i);

  const npxInfo = detectInstallationSync({
    projectRoot: path.join(tmp, '_npx', '1234', 'node_modules', 'codebase-onboarder'),
    currentVersion: '1.1.0',
    exists: () => false,
  });
  assert.equal(npxInfo.method, 'npx');
  assert.equal(npxInfo.canAutoUpdate, false);

  const sourceInfo = detectInstallationSync({
    projectRoot: path.join(tmp, 'checkout'),
    currentVersion: '1.1.0',
    execPath: '/usr/local/bin/node',
    exists: (p) => p.endsWith('.git') || p === '/usr/local/bin/npm' || p.endsWith('/git'),
    env: { PATH: '/usr/bin' },
  });
  assert.equal(sourceInfo.method, 'source');
  assert.equal(sourceInfo.canAutoUpdate, true);
});

test('assessInstallation permits source auto-update only on clean main from official remote', async () => {
  const base = {
    packageName: 'codebase-onboarder',
    currentVersion: '1.1.0',
    projectRoot: '/tmp/checkout',
    method: 'source',
    prefix: null,
    localRoot: null,
    canAutoUpdate: true,
    reason: null,
    manualCommand: 'git pull --ff-only && npm ci --ignore-scripts && npm run build',
    npmBin: '/usr/bin/npm',
    gitBin: '/usr/bin/git',
  };

  const clean = await assessInstallation(base, async (args) => {
    if (args[0] === 'rev-parse') return { code: 0, stdout: 'main\n', stderr: '' };
    if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/Amitpandey88/onboarder.git\n', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  });
  assert.equal(clean.canAutoUpdate, true);

  const dirty = await assessInstallation(base, async (args) => {
    if (args[0] === 'rev-parse') return { code: 0, stdout: 'main\n', stderr: '' };
    if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/Amitpandey88/onboarder.git\n', stderr: '' };
    return { code: 0, stdout: ' M package.json\n', stderr: '' };
  });
  assert.equal(dirty.canAutoUpdate, false);
  assert.match(dirty.reason, /uncommitted/i);

  const featureBranch = await assessInstallation(base, async (args) => {
    if (args[0] === 'rev-parse') return { code: 0, stdout: 'auto_update_feature\n', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  });
  assert.equal(featureBranch.canAutoUpdate, false);
  assert.match(featureBranch.reason, /auto_update_feature/);

  const forkRemote = await assessInstallation(base, async (args) => {
    if (args[0] === 'rev-parse') return { code: 0, stdout: 'main\n', stderr: '' };
    if (args[0] === 'remote') return { code: 0, stdout: 'https://github.com/other/onboarder.git\n', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  });
  assert.equal(forkRemote.canAutoUpdate, false);
  assert.match(forkRemote.reason, /official Onboarder repository/i);
});

// ---- registry fetch & caching & safe install ---------------------------------

test('fetchRegistryRelease validates origin, redirects, package name, version, and size', async () => {
  const valid = await fetchRegistryRelease({
    fetchImpl: async () => Response.json({
      name: 'codebase-onboarder',
      version: '1.2.0',
      engines: { node: '>=20' },
      dist: {
        tarball: 'https://registry.npmjs.org/codebase-onboarder/-/codebase-onboarder-1.2.0.tgz',
        integrity: 'sha512-abc123==',
      },
    }),
  });
  assert.equal(valid.version, '1.2.0');
  assert.equal(valid.requiredNode, '>=20');

  await assert.rejects(
    () => fetchRegistryRelease({
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/payload' } }),
    }),
    /not trusted/,
  );

  await assert.rejects(
    () => fetchRegistryRelease({
      fetchImpl: async () => Response.json({ name: 'codebase-onboarder', version: '1.2.0;rm' }),
    }),
    /invalid package version/i,
  );

  await assert.rejects(
    () => fetchRegistryRelease({
      fetchImpl: async () => Response.json({ name: 'other-pkg', version: '1.2.0' }),
    }),
    /did not match/,
  );
});

test('checkForUpdates respects TTL cache, opt-outs, force refresh, and offline degradation', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-update-cache-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configFile = path.join(dir, 'config.json');
  const pkgRoot = path.join(dir, 'prefix', 'lib', 'node_modules', 'codebase-onboarder');
  await fs.mkdir(pkgRoot, { recursive: true });
  await fs.writeFile(path.join(pkgRoot, 'package.json'), JSON.stringify({ name: 'codebase-onboarder', version: '1.1.0' }));

  let networkCalls = 0;
  const mockFetch = async () => {
    networkCalls += 1;
    return Response.json({ name: 'codebase-onboarder', version: '1.2.0', engines: { node: '>=20' } });
  };

  const first = await checkForUpdates({
    configFile,
    projectRoot: pkgRoot,
    platform: 'linux',
    env: { PATH: '/bin' },
    fetchImpl: mockFetch,
    exists: () => false,
    isWritable: () => true,
  });
  assert.equal(first.updateAvailable, true);
  assert.equal(first.latestVersion, '1.2.0');
  assert.equal(first.fromCache, false);
  assert.equal(networkCalls, 1);

  const cached = await checkForUpdates({
    configFile,
    projectRoot: pkgRoot,
    platform: 'linux',
    env: { PATH: '/bin' },
    fetchImpl: mockFetch,
    exists: () => false,
    isWritable: () => true,
  });
  assert.equal(cached.fromCache, true);
  assert.equal(cached.latestVersion, '1.2.0');
  assert.equal(networkCalls, 1, 'within TTL, cache avoids extra network requests');

  const forced = await checkForUpdates({
    force: true,
    configFile,
    projectRoot: pkgRoot,
    platform: 'linux',
    env: { PATH: '/bin' },
    fetchImpl: mockFetch,
    exists: () => false,
    isWritable: () => true,
  });
  assert.equal(forced.fromCache, false);
  assert.equal(networkCalls, 2);

  const optedOut = await checkForUpdates({
    configFile,
    projectRoot: pkgRoot,
    cacheFile: null,
    env: { ONBOARDER_NO_UPDATE_CHECK: '1' },
    fetchImpl: mockFetch,
  });
  assert.equal(optedOut.checkDisabled, true);
  assert.equal(optedOut.latestVersion, null);
  assert.equal(networkCalls, 2);

  const offline = await checkForUpdates({
    force: true,
    configFile,
    projectRoot: pkgRoot,
    platform: 'linux',
    env: { PATH: '/bin' },
    fetchImpl: async () => { throw new Error('ENOTFOUND registry.npmjs.org'); },
  });
  assert.match(offline.error, /ENOTFOUND/);
  assert.equal(offline.latestVersion, '1.2.0', 'retains cached latest version as fallback');
});

test('applyUpdate executes pinned --ignore-scripts npm command with isolated env and updates cache', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-apply-update-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configFile = path.join(dir, 'config.json');
  const pkgRoot = path.join(dir, 'prefix', 'lib', 'node_modules', 'codebase-onboarder');
  const binDir = path.join(dir, 'prefix', 'bin');
  await fs.mkdir(pkgRoot, { recursive: true });
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(path.join(pkgRoot, 'package.json'), JSON.stringify({ name: 'codebase-onboarder', version: '1.1.0' }));

  const spawned = [];
  const events = [];
  const res = await applyUpdate(
    {
      configFile,
      projectRoot: pkgRoot,
      platform: 'linux',
      execPath: path.join(binDir, 'node'),
      env: { PATH: binDir, OPENAI_API_KEY: 'must-not-leak', NPM_TOKEN: 'must-not-leak' },
      exists: (p) => p === path.join(binDir, 'npm'),
      isWritable: () => true,
      canRestart: true,
      fetchImpl: async () => Response.json({ name: 'codebase-onboarder', version: '1.2.0', engines: { node: '>=20' } }),
      spawnCommand: async (cmd, args, opts) => {
        spawned.push({ cmd, args, env: opts.env, cwd: opts.cwd });
        opts.onLine('added 1 package in 2s');
        return 0;
      },
    },
    (ev) => events.push(ev),
  );

  assert.equal(res.ok, true);
  assert.equal(res.previousVersion, '1.1.0');
  assert.equal(res.updatedTo, '1.2.0');
  assert.equal(res.canRestart, true);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].cmd, path.join(binDir, 'npm'));
  assert.deepEqual(spawned[0].args, [
    'install', '-g', '--ignore-scripts', '--registry=https://registry.npmjs.org/', '--prefer-online',
    '--prefix', path.join(dir, 'prefix'), 'codebase-onboarder@1.2.0',
  ]);
  assert.equal(spawned[0].env.OPENAI_API_KEY, undefined);
  assert.equal(spawned[0].env.NPM_TOKEN, undefined);
  assert.equal(spawned[0].env.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
  assert.ok(events.some((e) => e.type === 'log' && e.line.includes('added 1 package')));

  const cache = await readUpdateCache(updateCachePath(configFile));
  assert.equal(cache.currentVersion, '1.2.0');
  assert.equal(cache.latestVersion, '1.2.0');

  const steps = buildUpdateSteps({
    packageName: 'codebase-onboarder',
    currentVersion: '1.1.0',
    projectRoot: '/tmp/repo',
    method: 'source',
    prefix: null,
    localRoot: null,
    canAutoUpdate: true,
    reason: null,
    manualCommand: '',
    npmBin: '/usr/bin/npm',
    gitBin: '/usr/bin/git',
  }, '1.2.0', { tmpDir: '/tmp/t', emptyHooksDir: '/tmp/h' });
  assert.equal(steps.length, 3);
  assert.ok(steps[0].args.includes('core.hooksPath=/tmp/h'));
  assert.ok(steps[1].args.includes('--ignore-scripts'));
});

test('applyUpdate rejects incompatible Node engines and already-current installs', async () => {
  const incompatible = await applyUpdate({
    currentVersion: '1.1.0',
    cacheFile: null,
    fetchImpl: async () => Response.json({ name: 'codebase-onboarder', version: '2.0.0', engines: { node: '>=99' } }),
    spawnCommand: async () => { throw new Error('must not spawn'); },
  });
  assert.equal(incompatible.ok, false);
  assert.match(incompatible.error, /requires Node >=99/);

  const upToDate = await applyUpdate({
    currentVersion: '1.2.0',
    cacheFile: null,
    fetchImpl: async () => Response.json({ name: 'codebase-onboarder', version: '1.2.0', engines: { node: '>=20' } }),
    spawnCommand: async () => { throw new Error('must not spawn'); },
  });
  assert.equal(upToDate.ok, true);
  assert.equal(upToDate.alreadyCurrent, true);
});

// ---- HTTP routes, auth gates, and team boundaries ----------------------------

test('update HTTP endpoints enforce same-origin, self-hosted auth, team isolation, and stream SSE', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-update-http-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const configFile = path.join(dir, 'config.json');
  const teamFile = path.join(dir, 'team.json');
  const accessKey = generateAccessKey();
  await writeSettings({ mode: 'self-hosted', host: '127.0.0.1', port: 4310, domain: 'map.example.com', accessKey }, configFile);

  const team = new TeamDirectory(teamFile);
  const member = await team.add('Viewer', 'viewer', [dir]);

  let busy = false;
  let restarted = false;
  const server = createServer({
    ...CONFIG,
    configPath: configFile,
    teamFile,
    getSettings: () => readSettings(configFile),
    boot: { host: '127.0.0.1', port: 4310, domain: 'map.example.com', https: false, mode: 'background' },
    update: {
      serverMode: 'background',
      canRestart: true,
      isUpdating: () => busy,
      check: async ({ force }) => fakeStatus({ releaseNotes: force ? 'Fixed bugs.' : null, canRestart: true, serverMode: 'background' }),
      apply: async (_opts, onEvent) => {
        onEvent({ type: 'status', phase: 'installing', message: 'Installing…' });
        onEvent({ type: 'log', line: '+ codebase-onboarder@1.2.0' });
        const done = { type: 'done', ok: true, previousVersion: '1.1.0', currentVersion: '1.2.0', updatedTo: '1.2.0', restartRequired: true, canRestart: true };
        onEvent(done);
        return done;
      },
      restart: () => { restarted = true; },
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  // Remote unauthenticated requests are blocked.
  const unauth = await httpRequest(port, { path: '/api/update', headers: { host: 'map.example.com' } });
  assert.equal(unauth.status, 401);

  // Cross-origin requests are blocked.
  const cross = await httpRequest(port, { path: '/api/update', headers: { origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);

  // Team members are denied access to update endpoints.
  const memberRes = await httpRequest(port, {
    path: '/api/update',
    headers: { host: 'map.example.com', authorization: `Bearer ${member.token}` },
  });
  assert.equal(memberRes.status, 403);

  // Authenticated owner can inspect updates with notes.
  const okRes = await httpRequest(port, {
    path: '/api/update?refresh=1',
    headers: { host: 'map.example.com', authorization: `Bearer ${accessKey}` },
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.json.latestVersion, '1.2.0');
  assert.equal(okRes.json.releaseNotes, 'Fixed bugs.');

  // Concurrent update returns 409.
  busy = true;
  const conflict = await httpRequest(port, {
    method: 'POST', path: '/api/update/install',
    headers: { host: 'map.example.com', authorization: `Bearer ${accessKey}`, 'content-type': 'application/json' },
    body: {},
  });
  assert.equal(conflict.status, 409);
  busy = false;

  // SSE update install streams events.
  const sse = await httpRequest(port, {
    method: 'POST', path: '/api/update/install',
    headers: { host: 'map.example.com', authorization: `Bearer ${accessKey}`, 'content-type': 'application/json' },
    body: { version: '1.2.0' },
  });
  assert.equal(sse.status, 200);
  assert.match(sse.headers['content-type'], /^text\/event-stream/);
  assert.match(sse.text, /codebase-onboarder@1\.2\.0/);
  assert.match(sse.text, /"updatedTo":"1\.2\.0"/);

  // Restart triggers restart handler.
  const restartRes = await httpRequest(port, {
    method: 'POST', path: '/api/update/restart',
    headers: { host: 'map.example.com', authorization: `Bearer ${accessKey}`, 'content-type': 'application/json' },
    body: {},
  });
  assert.equal(restartRes.status, 200);
  await new Promise((r) => setImmediate(r));
  assert.equal(restarted, true);

  // Bare test server refuses restart cleanly.
  const bare = createServer();
  await new Promise((r) => bare.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => bare.close(r)));
  const bareRestart = await httpRequest(bare.address().port, {
    method: 'POST', path: '/api/update/restart',
    headers: { 'content-type': 'application/json' },
    body: {},
  });
  assert.equal(bareRestart.status, 400);
});

// ---- CLI, config, chat, and explorer integration -----------------------------

test('CLI update command handles check, non-TTY safety, confirmation, install, and restart', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-cli-update-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configFile = path.join(dir, 'config.json');
  await writeSettings({ mode: 'local', host: '127.0.0.1', port: 4310 }, configFile);

  const checkOut = [];
  const checkCode = await updateCommand('check', [], {
    flags: { config: configFile, json: true },
    out: (l) => checkOut.push(l),
    checkFn: async () => fakeStatus(),
  });
  assert.equal(checkCode, 0);
  assert.equal(JSON.parse(checkOut.join('\n')).latestVersion, '1.2.0');

  // Non-TTY without --yes refuses cleanly instead of hanging.
  const nonTtyErr = [];
  const nonTtyCode = await updateCommand(undefined, [], {
    flags: { config: configFile },
    isTTY: false,
    out: () => {},
    err: (l) => nonTtyErr.push(l),
    checkFn: async () => fakeStatus(),
  });
  assert.equal(nonTtyCode, 1);
  assert.match(nonTtyErr.join('\n'), /--yes/);

  // Interactive prompt declined exits cleanly without applying update.
  let applied = false;
  const declineOut = [];
  const declineCode = await updateCommand(undefined, [], {
    flags: { config: configFile },
    isTTY: true,
    out: (l) => declineOut.push(l),
    confirmFn: async () => false,
    checkFn: async () => fakeStatus(),
    applyFn: async () => { applied = true; return { type: 'done', ok: true, previousVersion: '1.1.0', currentVersion: '1.2.0' }; },
  });
  assert.equal(declineCode, 0);
  assert.equal(applied, false);
  assert.match(declineOut.join('\n'), /Update skipped/);

  // --yes --restart installs and restarts running background server.
  let restarted = false;
  const yesOut = [];
  const yesCode = await updateCommand('install', [], {
    flags: { config: configFile, yes: true, restart: true, json: true },
    isTTY: false,
    out: (l) => yesOut.push(l),
    checkFn: async () => fakeStatus(),
    applyFn: async (_opts, onEvent) => {
      onEvent({ type: 'log', line: 'installed v1.2.0' });
      return { type: 'done', ok: true, previousVersion: '1.1.0', currentVersion: '1.2.0', updatedTo: '1.2.0' };
    },
    isServerRunning: () => 42424,
    restartFn: async () => { restarted = true; return 0; },
  });
  assert.equal(yesCode, 0);
  assert.equal(restarted, true);
  assert.equal(JSON.parse(yesOut.join('\n')).restarted, true);

  assert.match(formatUpdateStatusText(fakeStatus({ releaseNotes: 'Added auto-update' }), { verbose: true }), /Added auto-update/);
  assert.match(formatUpdateHintLine(fakeStatus()), /1\.1\.0 → .*1\.2\.0/);
});

test('main dispatches update --help and update --check without breaking fix --check', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-main-update-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configFile = path.join(dir, 'config.json');

  const logs = [];
  const origLog = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    assert.equal(await main(['update', '--help']), 0);
  } finally {
    console.log = origLog;
  }
  assert.match(logs.join('\n'), /onboarder update check/);

  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    if (String(url).includes('registry.npmjs.org')) {
      return Response.json({ name: 'codebase-onboarder', version: '9.9.9', engines: { node: '>=20' } });
    }
    return new Response(null, { status: 404 });
  };

  const jsonLogs = [];
  console.log = (line) => jsonLogs.push(String(line));
  try {
    const code = await main(['update', '--check', '--json', '--config', configFile]);
    assert.equal(code, 0);
  } finally {
    console.log = origLog;
  }
  const parsed = JSON.parse(jsonLogs.join('\n'));
  assert.equal(parsed.latestVersion, '9.9.9');
  assert.equal(parsed.updateAvailable, true);

  // Verify `--check <value>` remains a string option for `fix verify`.
  const errLogs = [];
  const origErr = console.error;
  console.error = (line) => errLogs.push(String(line));
  try {
    const fixHelp = await main(['fix', 'verify', '--check', 'node-test:a.js', '--help']);
    assert.equal(fixHelp, 0);
  } finally {
    console.error = origErr;
  }
});

test('config, status, and doctor expose updateCheck preference and cached update hints', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-config-update-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configFile = path.join(dir, 'config.json');
  await writeSettings({ mode: 'local', host: '127.0.0.1', port: 4310 }, configFile);

  const setOut = [];
  assert.equal(await runConfig('set', ['updateCheck', 'false'], { flags: { config: configFile }, out: (l) => setOut.push(l) }), 0);
  assert.match(setOut.join('\n'), /updateCheck = false/);
  assert.equal((await readSettings(configFile)).updateCheck, false);

  await runConfig('set', ['updateCheck', 'true'], { flags: { config: configFile }, out: () => {} });
  await writeUpdateCache(updateCachePath(configFile), {
    checkedAt: new Date().toISOString(),
    currentVersion: '0.0.1',
    latestVersion: '9.9.9',
    requiredNode: '>=20',
    tarball: null,
    integrity: null,
  });

  // Note: readCachedUpdateHint compares against actual package.json version (1.1.0), so 9.9.9 > 1.1.0!
  const statusLines = [];
  const prevDisable = process.env.ONBOARDER_NO_UPDATE_CHECK;
  const prevNoNotify = process.env.NO_UPDATE_NOTIFIER;
  const prevCi = process.env.CI;
  delete process.env.ONBOARDER_NO_UPDATE_CHECK;
  delete process.env.NO_UPDATE_NOTIFIER;
  delete process.env.CI;
  try {
    await runStatus({ flags: { config: configFile }, out: (l) => statusLines.push(l) });
    assert.match(statusLines.join('\n'), /9\.9\.9 available/);

    const docOut = [];
    await runDoctor({ flags: { config: configFile, json: true }, out: (l) => docOut.push(l) });
    const parsedDoc = JSON.parse(docOut.join('\n'));
    const updateCheck = parsedDoc.checks.find((c) => c.id === 'updates');
    assert.ok(updateCheck);
    assert.match(updateCheck.detail, /9\.9\.9 available/);
  } finally {
    if (prevDisable !== undefined) process.env.ONBOARDER_NO_UPDATE_CHECK = prevDisable;
    if (prevNoNotify !== undefined) process.env.NO_UPDATE_NOTIFIER = prevNoNotify;
    if (prevCi !== undefined) process.env.CI = prevCi;
  }
});

test('chat and explorer expose /update and update commands cleanly', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-chat-update-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const events = [];
  const controller = new ChatController(
    { root: dir, mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 },
    {
      output: (e) => events.push(e),
      update: async (args) => `update-port:${args.join(',') || 'default'}`,
    },
  );
  await controller.accept('/update check');
  assert.ok(events.some((e) => e.type === 'message' && e.text.includes('update-port:check')));
  await controller.accept('/update invalid');
  assert.ok(events.some((e) => e.type === 'message' && e.text.includes('Usage: /update')));

  assert.equal(slashInput('/update check').name, 'update');
  assert.deepEqual(completeChat('/up')[0], ['/update']);
  assert.deepEqual(completeChat('/update ')[0], ['check', 'install']);

  const banner = chatBanner(
    { root: dir, mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 },
    90,
    undefined,
    '1.1.0',
    { updateAvailable: '1.2.0', fullscreen: true, rows: 30 },
  );
  assert.match(banner, /Update available: v1\.2\.0/);

  assert.equal(lookupExplorerCommand('update').name, 'update');
  assert.equal(lookupExplorerCommand('upgrade').name, 'update');
});

// ---- Web UI view model & API client ------------------------------------------

test('Web UI update view model and browser API client handle all update states', async (t) => {
  const upToDate = summarizeUpdateView(fakeStatus({ updateAvailable: false, upToDate: true, latestVersion: '1.1.0' }));
  assert.equal(upToDate.badgeText, 'Up to date');
  assert.equal(upToDate.bannerVisible, false);
  assert.equal(upToDate.buttonLabel, 'v1.1.0');

  const available = summarizeUpdateView(fakeStatus());
  assert.equal(available.badgeText, 'v1.2.0 available');
  assert.equal(available.bannerVisible, true);
  assert.equal(available.buttonLabel, 'Update · v1.2.0');

  const dismissed = summarizeUpdateView(fakeStatus(), { dismissedVersion: '1.2.0' });
  assert.equal(dismissed.bannerVisible, false);
  assert.equal(dismissed.buttonLabel, 'Update · v1.2.0');

  const updated = summarizeUpdateView(fakeStatus(), { updatedVersion: '1.2.0' });
  assert.equal(updated.badgeText, 'Updated to v1.2.0');
  assert.equal(updated.buttonLabel, 'Restart · v1.2.0');

  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('/api/update/install')) {
      const sse = [
        'data: ' + JSON.stringify({ type: 'status', phase: 'installing', message: 'Installing…' }),
        'data: ' + JSON.stringify({ type: 'log', line: 'added 1 package' }),
        'data: ' + JSON.stringify({ type: 'done', ok: true, previousVersion: '1.1.0', currentVersion: '1.2.0', updatedTo: '1.2.0', canRestart: true }),
      ].join('\n\n') + '\n\n';
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (String(url).startsWith('/api/update/restart')) {
      assert.equal(init.method, 'POST');
      return Response.json({ ok: true, restarting: true });
    }
    return Response.json(fakeStatus());
  };

  const fetched = await fetchUpdateStatus({ refresh: true, notes: true });
  assert.equal(fetched.latestVersion, '1.2.0');

  const seen = [];
  const done = await streamSelfUpdate({ version: '1.2.0' }, (ev) => seen.push(ev));
  assert.equal(done.ok, true);
  assert.equal(done.updatedTo, '1.2.0');
  assert.equal(seen.length, 3);

  const restart = await restartOnboarderServer();
  assert.equal(restart.restarting, true);

  const desktopAvailable = summarizeDesktopUpdateView({
    platform: 'macos-app',
    currentVersion: '0.1.6',
    coreVersion: '1.2.1',
    arch: 'arm64',
    channel: 'release',
    latestVersion: '0.1.7',
    updateAvailable: true,
    updateReadyToRestart: false,
    pendingVersion: null,
    state: 'available',
    canAutoUpdate: true,
    canDownloadInstaller: true,
    installPath: '/Applications/Onboarder.app',
    autoCheckEnabled: true,
    checkDisabled: false,
    optedOutByEnv: false,
    checkedAt: '2026-11-25T00:00:00Z',
    fromCache: false,
    assetName: 'Onboarder-0.1.7-arm64.zip',
    assetSize: 120000000,
    assetSha256: null,
    signedForDistribution: true,
    releaseUrl: 'https://github.com/Amitpandey88/onboarder/releases/tag/macos-v0.1.7',
    releaseNotes: 'Bug fixes',
    publishedAt: null,
    dismissedVersion: null,
    downloadedInstallerPath: null,
  });
  assert.equal(desktopAvailable.badgeText, 'v0.1.7 available');
  assert.equal(desktopAvailable.buttonLabel, 'Update · v0.1.7');
  assert.equal(desktopAvailable.bannerVisible, true);

  const desktopReady = summarizeDesktopUpdateView({
    platform: 'macos-app',
    currentVersion: '0.1.6',
    coreVersion: '1.2.1',
    arch: 'arm64',
    channel: 'release',
    latestVersion: '0.1.7',
    updateAvailable: false,
    updateReadyToRestart: true,
    pendingVersion: '0.1.7',
    state: 'restart-required',
    canAutoUpdate: true,
    canDownloadInstaller: true,
    installPath: '/Applications/Onboarder.app',
    autoCheckEnabled: true,
    checkDisabled: false,
    optedOutByEnv: false,
    checkedAt: '2026-11-25T00:00:00Z',
    fromCache: false,
    assetName: 'Onboarder-0.1.7-arm64.zip',
    assetSize: null,
    assetSha256: null,
    signedForDistribution: true,
    releaseUrl: null,
    releaseNotes: null,
    publishedAt: null,
    dismissedVersion: null,
    downloadedInstallerPath: null,
  });
  assert.equal(desktopReady.badgeText, 'Restart for v0.1.7');
  assert.equal(desktopReady.buttonLabel, 'Restart · v0.1.7');
  assert.equal(desktopReady.bannerVisible, true);
});
