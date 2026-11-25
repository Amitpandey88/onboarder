import { testShell } from './testShell.mjs';
import { _electron as electron } from 'playwright';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root } from './setup.mjs';

const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-update-smoke-'));
const downloadsDir = path.join(fixture, 'profile', 'Downloads');
const installerName = `Onboarder-9.9.9-${process.arch}.dmg`;
const installerBytes = Buffer.from('verified-test-dmg-payload-9.9.9\n');
const installerSha = createHash('sha256').update(installerBytes).digest('hex');

let port = 0;
const server = http.createServer((req, res) => {
  const base = `http://127.0.0.1:${port}`;
  if (req.url.startsWith('/releases')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{
      tag_name: 'macos-v9.9.9',
      draft: false,
      prerelease: false,
      html_url: 'https://github.com/Amitpandey88/onboarder/releases/tag/macos-v9.9.9',
      body: 'Live Electron update integration check.',
      published_at: '2026-11-25T00:00:00Z',
      assets: [
        { name: installerName, browser_download_url: `${base}/download/${installerName}`, size: installerBytes.length },
        { name: 'SHA256SUMS', browser_download_url: `${base}/download/SHA256SUMS`, size: 128 },
      ],
    }]));
    return;
  }
  if (req.url === '/download/SHA256SUMS') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`${installerSha}  ${installerName}\n`);
    return;
  }
  if (req.url === `/download/${installerName}`) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(installerBytes.length) });
    res.end(installerBytes);
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
port = server.address().port;

const executablePath = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const env = {
  ...process.env,
  SHELL: await testShell(fixture),
  ONBOARDER_DESKTOP_TEST_HOME: path.join(fixture, 'profile'),
  ONBOARDER_AGENT_HOME: path.join(fixture, 'agent'),
  ONBOARDER_INTELLIGENCE_HOME: path.join(fixture, 'intelligence'),
  ONBOARDER_DESKTOP_UPDATE_API_URL: `http://127.0.0.1:${port}/releases`,
};

const app = await electron.launch({ executablePath, args: [root], env });
const report = { pageErrors: [] };

try {
  const page = await app.firstWindow();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.locator('#homeDropzone').waitFor({ timeout: 30000 });

  // Wait for startup check + broadcast to populate topbar, menu, and landing banner.
  await page.waitForFunction(() => document.getElementById('updateBtnLabel')?.textContent === 'Update · v9.9.9', { timeout: 15000 });
  await page.locator('#landingUpdateBanner:not([hidden])').waitFor();
  assert.match(await page.locator('#landingUpdateTitle').textContent(), /9\.9\.9/);
  report.bannerAndTopbar = true;

  // Verify native macOS App Menu reflects update availability and opens the drawer.
  const menuLabel = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items[1].label);
  assert.equal(menuLabel, 'Update Available (v9.9.9)…');
  await app.evaluate(({ Menu }) => { Menu.getApplicationMenu().items[0].submenu.items[1].click(); });
  await page.locator('#updateDrawer:not([hidden])').waitFor();
  assert.equal(await page.locator('#updateCurrentVer').textContent(), `Mac v${pkg.version}`);
  assert.equal(await page.locator('#updateLatestVer').textContent(), 'v9.9.9');
  assert.match(await page.locator('#updateNotesBody').textContent(), /Live Electron update integration check/);
  report.nativeMenuAndDrawer = true;

  // Close drawer, verify System dialog exposes Updates entry and opens the drawer.
  await page.locator('#updateClose').click();
  await page.locator('#updateDrawer[hidden]').waitFor({ state: 'attached' });
  await page.locator('#appearanceHeaderBtn').click();
  await page.locator('#uiSettingsDialog[open]').waitFor();
  await page.locator('#systemUpdatesBtn:visible').click();
  await page.locator('#updateDrawer:not([hidden])').waitFor();
  report.systemDialogEntry = true;

  // Toggle automatic check preference via IPC.
  await page.locator('#updateAutoCheck').uncheck();
  await page.waitForFunction(async () => (await window.onboarderDesktop.update('status')).autoCheckEnabled === false);
  await page.locator('#updateAutoCheck').check();
  await page.waitForFunction(async () => (await window.onboarderDesktop.update('status')).autoCheckEnabled === true);
  report.autoCheckPreference = true;

  // Download SHA-256 verified installer into isolated fixture Downloads folder.
  await page.locator('#updateInstallBtn').click();
  await page.locator('#updateConsoleVerdict.is-ok').waitFor({ timeout: 15000 });
  const savedPath = path.join(downloadsDir, installerName);
  assert.deepEqual(await fs.readFile(savedPath), installerBytes);
  report.verifiedInstallerDownload = true;

  assert.deepEqual(report.pageErrors, []);
  await fs.mkdir(path.join(root, 'dist/qa'), { recursive: true });
  await fs.writeFile(path.join(root, 'dist/qa/update-smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.evaluate(({ BrowserWindow, app }) => { for (const w of BrowserWindow.getAllWindows()) w.destroy(); app.exit(0); }).catch(() => {});
  await app.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  await fs.rm(fixture, { recursive: true, force: true });
}
