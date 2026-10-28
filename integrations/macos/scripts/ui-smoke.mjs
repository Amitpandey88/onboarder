import { testShell } from './testShell.mjs';
import { checkAboutPages } from './check-about-ui.mjs';
import { checkSystemSettings } from './check-system-ui.mjs';
import { _electron as electron } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { root, run } from './setup.mjs';
import { launchPackaged } from './packagedHarness.mjs';

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-ui-check-'));
const source = path.join(fixture, 'repository with spaces'); await fs.mkdir(source);
const filename = 'a-long-task-file-name-that-must-remain-readable-on-hover.js';
await fs.writeFile(path.join(source, filename), 'export const task = "ready";\n');
run('git', ['init', '-q', source]); run('git', ['add', '.'], { cwd: source }); run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], { cwd: source }); run('git', ['update-server-info'], { cwd: source });
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/slow.git')) { await new Promise(resolve => setTimeout(resolve, 1200)); res.writeHead(404); res.end(); return; }
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/repo\.git/, '');
  const target = path.resolve(source, '.git', '.' + pathname);
  if (!target.startsWith(path.join(source, '.git') + path.sep)) { res.writeHead(403); res.end(); return; }
  try { const bytes = await fs.readFile(target); res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(bytes); } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/repo.git`;
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const env = { ...process.env, SHELL: await testShell(fixture), ONBOARDER_DESKTOP_TEST_HOME: path.join(fixture, 'profile'), ONBOARDER_AGENT_HOME: path.join(fixture, 'agent'), ONBOARDER_INTELLIGENCE_HOME: path.join(fixture, 'intelligence') };
const args = process.argv[2] ? ['--project=' + source] : [root, '--project=' + source];
const app = process.argv[2] ? await launchPackaged(executablePath, args, env) : await electron.launch({ executablePath, args, env });
const report = { pageErrors: [] };
try {
  const page = await app.firstWindow(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.locator('#workspaceNav:not([hidden])').waitFor({ timeout: 60000 });
  report.version = (await page.evaluate(() => window.onboarderDesktop.initial())).version;
  await page.locator('#navToggle').hover(); await page.locator('#workspaceTooltip:not([hidden])').waitFor();
  assert.match(await page.locator('#workspaceTooltip').textContent(), /sidebar/);
  assert.ok((await page.locator('#navToggle').boundingBox()).width >= 36);
  await page.locator('#navToggle').click(); assert.equal(await page.evaluate(() => document.body.dataset.navCollapsed), 'true');
  await page.locator('#navToggle').click();
  await page.locator('#repoChip').focus(); await page.locator('#workspaceTooltip:not([hidden])').waitFor();
  assert.ok((await page.locator('#workspaceTooltip').textContent()).includes(source));
  await page.keyboard.press('Escape');
  await page.locator('#fileTree .tree-file').first().click();
  await page.waitForFunction(name => { const title = document.querySelector('#inspTitle'); return title.textContent === name && title.getBoundingClientRect().width > 0; }, filename);
  await page.locator('#inspTitle').focus(); await page.locator('#workspaceTooltip:not([hidden])').waitFor();
  assert.equal(await page.locator('#workspaceTooltip').textContent(), filename);
  const style = await page.locator('#inspTitle').evaluate(el => ({ whiteSpace: getComputedStyle(el).whiteSpace, wordBreak: getComputedStyle(el).wordBreak }));
  assert.equal(style.whiteSpace, 'nowrap'); assert.equal(style.wordBreak, 'normal'); report.tooltipsAndNames = true;
  await page.keyboard.press('Escape');
  report.about = await checkAboutPages(page);
  report.systemSettings = await checkSystemSettings(page);
  await fs.mkdir(path.join(root, 'dist/qa'), { recursive: true });
  await page.screenshot({ path: path.join(root, `dist/qa/system-${report.version}.png`) });
  assert.equal(await page.locator('#liquidGlassSetting').count(), 0);
  assert.equal(await page.locator('.glass-control').count(), 0);
  assert.equal(await page.evaluate(() => document.body.dataset.material), undefined);
  report.solidControls = true;
  await page.locator('#motionSetting').selectOption('reduced'); await page.waitForFunction(() => document.body.dataset.motion === 'reduced');
  assert.equal(await page.locator('#projectLoading .loading-spinner').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.locator('#defaultCloneSetting').selectOption('temporary');
  await page.waitForFunction(async () => (await window.onboarderDesktop.preferences()).cloneStorage === 'temporary');
  await page.locator('#uiSettingsClose').click(); report.preferencesAndReducedMotion = true;
  const homePromise = app.waitForEvent('window'); await page.locator('#newRepoBtn').click(); const home = await homePromise;
  await home.locator('#homeDropzone').waitFor();
  await home.locator('#landingAboutBtn').click(); await home.locator('#aboutOnboarderDialog[open]').waitFor();
  await home.locator('#aboutOnboarderClose').click(); report.appAboutWithoutProject = true;
  await home.waitForFunction(() => document.querySelector('#cloneStorage input[value=temporary]').checked);
  await fs.mkdir(path.join(root, 'dist/qa'), { recursive: true });
  await home.screenshot({ path: path.join(root, `dist/qa/home-${report.version}.png`) });
  await home.locator('#gitInput').fill(url.replace('/repo.git', '/slow.git'));
  await home.locator('#gitForm').evaluate(form => form.requestSubmit());
  await home.locator('#projectLoading:not([hidden])').waitFor();
  await home.locator('#openingCancel').click();
  await home.locator('#projectLoading[hidden]').waitFor({ state: 'attached' });
  assert.match(await home.locator('#landingError').textContent(), /cancelled/);
  assert.deepEqual(await fs.readdir(path.join(fixture, 'profile', 'temporary-projects')), []);
  report.cancelFromOpeningScreen = true;
  const cloneEvents = [];
  await home.exposeFunction('onCloneEvent', event => cloneEvents.push(event));
  await home.evaluate(() => window.onboarderDesktop.subscribe(event => { if (event.type === 'clone-progress') window.onCloneEvent(event); }));
  await home.locator('#gitInput').fill(url);
  const projectPromise = app.waitForEvent('window');
  await home.locator('#gitForm').evaluate(form => form.requestSubmit());
  await home.locator('#projectLoading:not([hidden])').waitFor();
  const project = await projectPromise; project.on('pageerror', error => report.pageErrors.push(error.message));
  await project.locator('#workspaceNav:not([hidden])').waitFor({ timeout: 60000 });
  const opened = await project.evaluate(() => window.onboarderDesktop.initial());
  assert.equal(opened.temporary, true); assert.equal(path.basename(opened.root), 'repo');
  assert.ok(!opened.recents.some(item => item.path === opened.root));
  assert.ok(cloneEvents.some(event => event.percent === 100));
  assert.equal(await fs.readFile(path.join(opened.root, filename), 'utf8'), 'export const task = "ready";\n');
  report.homeCloneProgressAndTemporaryStorage = true;
  if (!app.packaged) {
    await app.evaluate(({ BrowserWindow, dialog }, title) => { dialog.showMessageBox = async () => ({ response: 1 }); const window = BrowserWindow.getAllWindows().find(window => window.getTitle() === title); window.close(); }, 'repo — Onboarder');
    const deadline = Date.now() + 8000; while (Date.now() < deadline && await fs.stat(opened.root).then(() => true, () => false)) await new Promise(resolve => setTimeout(resolve, 50));
    await assert.rejects(fs.stat(opened.root), /ENOENT/); report.cleanupOnClose = true;
  }
  assert.deepEqual(report.pageErrors, []);
  await fs.writeFile(path.join(root, `dist/qa/ui-smoke-${app.packaged ? 'packaged' : 'development'}-${report.version}.json`), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const page = app.windows()[0];
  if (page) { await fs.mkdir(path.join(root, 'dist/qa'), { recursive: true }); await page.screenshot({ path: path.join(root, 'dist/qa/ui-failure.png') }).catch(() => {}); console.error(await page.evaluate(() => ({ active: document.activeElement?.id, tooltip: document.querySelector('#workspaceTooltip')?.outerHTML, title: document.querySelector('#inspTitle')?.outerHTML } )).catch(() => {})); }
  throw error;
} finally {
  if (!app.packaged) await app.evaluate(({ BrowserWindow, app }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); app.exit(0); }).catch(() => {});
  await app.close().catch(() => {}); await new Promise(resolve => server.close(resolve)); await fs.rm(fixture, { recursive: true, force: true });
}
