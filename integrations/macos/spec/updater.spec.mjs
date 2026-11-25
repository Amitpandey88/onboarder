import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { DesktopStore } from '../src/store.mjs';
import { updateInput } from '../src/policy.mjs';
import {
  DesktopUpdater,
  assessMacosInstall,
  compareVersions,
  isUpdateAvailable,
  parseSemver,
  parseSha256Sums,
  resolveBundleLocation,
  selectMacosRelease,
} from '../src/updater.mjs';

const execFile = promisify(execFileCb);

test('macOS update semver, asset selection, and SHA256SUMS parsing', () => {
  assert.deepEqual(parseSemver('macos-v0.1.7-preview.1'), { major: 0, minor: 1, patch: 7, pre: ['preview', '1'] });
  assert.equal(compareVersions('0.1.7', '0.1.7-preview.1'), 1);
  assert.equal(isUpdateAvailable('0.1.6', '0.1.7'), true);
  assert.equal(isUpdateAvailable('0.1.6', '0.1.6'), false);

  const releases = [
    { tag_name: 'v1.4.0', draft: false, prerelease: false, assets: [] },
    {
      tag_name: 'macos-v0.2.0',
      draft: true,
      prerelease: false,
      assets: [{ name: 'Onboarder-0.2.0-arm64.zip', browser_download_url: 'https://github.com/a.zip', size: 10 }],
    },
    {
      tag_name: 'macos-v0.1.7',
      draft: false,
      prerelease: false,
      html_url: 'https://github.com/Amitpandey88/onboarder/releases/tag/macos-v0.1.7',
      body: 'Desktop auto-updater support.',
      published_at: '2026-11-24T10:00:00Z',
      assets: [
        { name: 'Onboarder-0.1.7-DEVELOPMENT-arm64.zip', browser_download_url: 'https://github.com/dev.zip', size: 50 },
        { name: 'Onboarder-0.1.7-arm64.zip', browser_download_url: 'https://github.com/rel.zip', size: 100 },
        { name: 'Onboarder-0.1.7-arm64.dmg', browser_download_url: 'https://github.com/rel.dmg', size: 110 },
        { name: 'SHA256SUMS', browser_download_url: 'https://github.com/SHA256SUMS', size: 1 },
      ],
    },
  ];
  const selected = selectMacosRelease(releases, { currentVersion: '0.1.6', arch: 'arm64' });
  assert.equal(selected.version, '0.1.7');
  assert.equal(selected.updateAvailable, true);
  assert.equal(selected.isDevelopment, false);
  assert.equal(selected.zipAsset.name, 'Onboarder-0.1.7-arm64.zip');
  assert.equal(selected.dmgAsset.name, 'Onboarder-0.1.7-arm64.dmg');
  assert.equal(selected.sumsUrl, 'https://github.com/SHA256SUMS');

  const sha = 'a'.repeat(64);
  const sha2 = 'b'.repeat(64);
  const parsedSums = parseSha256Sums(`${sha}  Onboarder-0.1.7-arm64.zip\n${sha2} *dist/Onboarder-0.1.7-arm64.dmg\n`);
  assert.equal(parsedSums.get('Onboarder-0.1.7-arm64.zip'), sha);
  assert.equal(parsedSums.get('Onboarder-0.1.7-arm64.dmg'), sha2);
});

test('macOS update policy validates IPC actions and arguments', () => {
  assert.deepEqual(updateInput('check', { force: true }), { force: true });
  assert.deepEqual(updateInput('install', { mode: 'dmg' }), { mode: 'dmg' });
  assert.deepEqual(updateInput('set-auto-check', { autoCheck: false }), { autoCheck: false });
  assert.deepEqual(updateInput('dismiss', { version: '0.1.7' }), { version: '0.1.7' });
  for (const [action, input] of [
    ['evil', {}],
    ['install', { mode: 'arbitrary' }],
    ['set-auto-check', { autoCheck: 'yes' }],
    ['dismiss', { version: '' }],
    ['check', ['array']],
  ]) {
    assert.throws(() => updateInput(action, input));
  }
});

test('assessMacosInstall checks packaging, App Translocation, and permissions', async () => {
  assert.equal(resolveBundleLocation('/Applications/Onboarder.app/Contents/MacOS/Onboarder'), '/Applications/Onboarder.app');
  const unpackaged = await assessMacosInstall({ platform: 'darwin', isPackaged: false, execPath: '/usr/local/bin/node' });
  assert.equal(unpackaged.canAutoUpdate, false);

  const translocated = await assessMacosInstall({
    platform: 'darwin',
    isPackaged: true,
    execPath: '/private/var/folders/x/AppTranslocation/abc/d/Onboarder.app/Contents/MacOS/Onboarder',
    accessCheck: async () => {},
  });
  assert.equal(translocated.canAutoUpdate, false);
  assert.match(translocated.reason, /Translocation/i);

  const readOnly = await assessMacosInstall({
    platform: 'darwin',
    isPackaged: true,
    execPath: '/Applications/Onboarder.app/Contents/MacOS/Onboarder',
    accessCheck: async () => { throw new Error('EACCES'); },
  });
  assert.equal(readOnly.canAutoUpdate, false);

  const writable = await assessMacosInstall({
    platform: 'darwin',
    isPackaged: true,
    execPath: '/Applications/Onboarder.app/Contents/MacOS/Onboarder',
    accessCheck: async () => {},
  });
  assert.equal(writable.canAutoUpdate, true);
});

test('DesktopUpdater downloads, verifies SHA-256 and bundle, atomically swaps .app, and protects against tampering', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-mac-updater-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const storeDir = path.join(dir, 'userData');
  const downloadsDir = path.join(dir, 'Downloads');
  const appBundle = path.join(dir, 'Applications', 'Onboarder.app');
  const appExec = path.join(appBundle, 'Contents', 'MacOS', 'Onboarder');
  await fs.mkdir(path.dirname(appExec), { recursive: true });
  await fs.writeFile(appExec, 'binary-0.1.6');
  await fs.writeFile(path.join(appBundle, 'Contents', 'marker.txt'), 'old-version');

  // Build a real macOS zip archive of v0.1.7 Onboarder.app when ditto is present, else synthetic payload.
  const nextSourceDir = path.join(dir, 'next-src');
  const nextBundle = path.join(nextSourceDir, 'Onboarder.app');
  await fs.mkdir(path.join(nextBundle, 'Contents', 'MacOS'), { recursive: true });
  await fs.writeFile(path.join(nextBundle, 'Contents', 'MacOS', 'Onboarder'), 'binary-0.1.7');
  await fs.writeFile(path.join(nextBundle, 'Contents', 'marker.txt'), 'new-version');
  await fs.writeFile(path.join(nextBundle, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict></dict></plist>');
  const zipFile = path.join(dir, 'Onboarder-0.1.7-arm64.zip');
  if (process.platform === 'darwin') {
    await execFile('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', nextBundle, zipFile]);
  } else {
    await fs.writeFile(zipFile, Buffer.from('synthetic-zip-0.1.7'));
  }
  const zipBytes = await fs.readFile(zipFile);
  const dmgBytes = Buffer.from('verified-dmg-installer-0.1.7');
  const zipSha = createHash('sha256').update(zipBytes).digest('hex');
  const dmgSha = createHash('sha256').update(dmgBytes).digest('hex');

  let corruptNextZip = false;
  let redirectEvil = false;
  let serverPort = 0;

  const server = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${serverPort}`;
    if (req.url.startsWith('/releases')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{
        tag_name: 'macos-v0.1.7',
        draft: false,
        prerelease: false,
        html_url: 'https://github.com/Amitpandey88/onboarder/releases/tag/macos-v0.1.7',
        body: 'Includes automated macOS updates.',
        published_at: '2026-11-24T12:00:00Z',
        assets: [
          { name: 'Onboarder-0.1.7-arm64.zip', browser_download_url: `${base}/download/Onboarder-0.1.7-arm64.zip`, size: zipBytes.length },
          { name: 'Onboarder-0.1.7-arm64.dmg', browser_download_url: `${base}/download/Onboarder-0.1.7-arm64.dmg`, size: dmgBytes.length },
          { name: 'SHA256SUMS', browser_download_url: `${base}/download/SHA256SUMS`, size: 200 },
        ],
      }]));
      return;
    }
    if (req.url === '/download/SHA256SUMS') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`${zipSha}  Onboarder-0.1.7-arm64.zip\n${dmgSha}  Onboarder-0.1.7-arm64.dmg\n`);
      return;
    }
    if (req.url === '/download/Onboarder-0.1.7-arm64.zip') {
      if (redirectEvil) {
        res.writeHead(302, { location: 'https://evil.example/payload.zip' });
        res.end();
        return;
      }
      const payload = corruptNextZip ? Buffer.from('tampered-bytes') : zipBytes;
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(payload.length) });
      res.end(payload);
      return;
    }
    if (req.url === '/download/Onboarder-0.1.7-arm64.dmg') {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(dmgBytes.length) });
      res.end(dmgBytes);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  serverPort = server.address().port;

  const store = new DesktopStore(storeDir, {});
  const progressEvents = [];
  let relaunched = false;
  let quitCalled = false;
  let openedInstaller = null;
  let failInspect = false;

  const updater = new DesktopUpdater({
    store,
    currentVersion: '0.1.6',
    coreVersion: '1.2.1',
    arch: 'arm64',
    platform: 'darwin',
    isPackaged: true,
    execPath: appExec,
    userDataDir: storeDir,
    downloadsDir,
    apiUrl: `http://127.0.0.1:${serverPort}/releases`,
    allowHttpForTests: true,
    extractZip: process.platform === 'darwin'
      ? undefined
      : async (_zip, stageDir) => {
        await fs.cp(nextBundle, path.join(stageDir, 'Onboarder.app'), { recursive: true });
      },
    inspectBundle: async (stagedPath, version) => {
      assert.equal(version, '0.1.7');
      await fs.stat(path.join(stagedPath, 'Contents', 'Info.plist'));
      if (failInspect) throw new Error('Code signature verification failed.');
    },
    readTeamId: async () => null,
    openPath: async target => { openedInstaller = target; return ''; },
    relaunchApp: () => { relaunched = true; },
    quitApp: () => { quitCalled = true; },
    onProgress: p => progressEvents.push(p),
  });

  // 1. Respect auto-check opt-out for background check while manual check still runs.
  await updater.setAutoCheck(false);
  const bgDisabled = await updater.startupCheck();
  assert.equal(bgDisabled.latestVersion, null);
  assert.equal(bgDisabled.checkDisabled, true);

  const manual = await updater.checkForUpdates({ force: true });
  assert.equal(manual.updateAvailable, true);
  assert.equal(manual.latestVersion, '0.1.7');
  assert.equal(manual.canAutoUpdate, true);

  // 2. Reject untrusted redirect host and corrupted SHA-256 download.
  redirectEvil = true;
  const blockedRedirect = await updater.installUpdate({ mode: 'auto' });
  assert.match(blockedRedirect.error, /Blocked unexpected update host/);
  assert.equal(await fs.readFile(path.join(appBundle, 'Contents', 'marker.txt'), 'utf8'), 'old-version');
  redirectEvil = false;

  corruptNextZip = true;
  const corrupted = await updater.installUpdate({ mode: 'auto' });
  assert.match(corrupted.error, /checksum mismatch/i);
  assert.equal(await fs.readFile(path.join(appBundle, 'Contents', 'marker.txt'), 'utf8'), 'old-version');
  corruptNextZip = false;

  // 3. Reject bundle verification failure before replacing existing Onboarder.app.
  failInspect = true;
  const badSig = await updater.installUpdate({ mode: 'auto' });
  assert.match(badSig.error, /Code signature verification failed/);
  assert.equal(await fs.readFile(path.join(appBundle, 'Contents', 'marker.txt'), 'utf8'), 'old-version');
  failInspect = false;

  // 4. Download verified DMG when explicitly requested (e.g. non-writable /Applications fallback).
  const dmgDone = await updater.installUpdate({ mode: 'dmg' });
  assert.equal(dmgDone.error, undefined);
  assert.ok(dmgDone.downloadedInstallerPath.endsWith('Onboarder-0.1.7-arm64.dmg'));
  assert.equal(openedInstaller, dmgDone.downloadedInstallerPath);
  assert.deepEqual(await fs.readFile(dmgDone.downloadedInstallerPath), dmgBytes);

  // 5. Complete atomic .app replacement and trigger relaunch cleanly.
  const replaced = await updater.installUpdate({ mode: 'auto' });
  assert.equal(replaced.error, undefined);
  assert.equal(replaced.updateReadyToRestart, true);
  assert.equal(replaced.pendingVersion, '0.1.7');
  assert.equal(replaced.state, 'restart-required');
  assert.equal(await fs.readFile(path.join(appBundle, 'Contents', 'marker.txt'), 'utf8'), 'new-version');
  assert.ok(progressEvents.some(p => p.phase === 'downloading'));
  assert.ok(progressEvents.some(p => p.phase === 'complete'));

  updater.restartApp();
  assert.equal(relaunched, true);
  assert.equal(quitCalled, true);

  // 6. Enforce strict HTTPS origin rejection when allowHttpForTests is false.
  const strictUpdater = new DesktopUpdater({
    store,
    currentVersion: '0.1.6',
    apiUrl: `http://127.0.0.1:${serverPort}/releases`,
    allowHttpForTests: false,
  });
  const blockedHttp = await strictUpdater.checkForUpdates({ force: true });
  assert.match(blockedHttp.error, /Blocked insecure update URL scheme/);
});
