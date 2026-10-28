import { _electron as electron } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { root } from './setup.mjs';
import { launchPackaged } from './packagedHarness.mjs';

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-controls-'));
const repository = path.join(fixture, 'repository with spaces'); await fs.mkdir(repository);
await fs.writeFile(path.join(repository, 'app.js'), 'export const ready = true;\n');
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const env = { ...process.env, ONBOARDER_DESKTOP_TEST_HOME: path.join(fixture, 'profile'), ONBOARDER_AGENT_HOME: path.join(fixture, 'agent'), ONBOARDER_INTELLIGENCE_HOME: path.join(fixture, 'intelligence') };
const app = process.argv[2] ? await launchPackaged(executablePath, ['--project=' + repository], env) : await electron.launch({ executablePath, args: [root, '--project=' + repository], env });
const report = { views: [], drawers: [], errors: [] };
try {
  const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
  await page.locator('#workspaceNav:not([hidden])').waitFor({ timeout: 60000 });
  await page.locator('#projectLoading[hidden]').waitFor({ state: 'attached' });
  report.version = (await page.evaluate(() => window.onboarderDesktop.initial())).version;
  for (const view of ['explorer', 'graph', 'code', 'docs', 'intelligence', 'analysis', 'heatmap', 'insights', 'sbom', 'review', 'triage', 'diff', 'workflows', 'about']) {
    await page.locator(`#viewTabs [data-view="${view}"]`).click();
    for (const [button, panel] of [['toggleFiles', 'fileSidebar'], ['toggleInspector', 'inspector']]) {
      assert.equal(await page.locator('#' + panel).isVisible(), true, `${view}: ${panel} initially visible`);
      assert.equal(await page.locator('#' + button).getAttribute('aria-expanded'), 'true');
      await page.locator('#' + button).click(); assert.equal(await page.locator('#' + panel).isVisible(), false, `${view}: ${panel} hides`);
      await page.locator('#' + button).click(); assert.equal(await page.locator('#' + panel).isVisible(), true, `${view}: ${panel} restores`);
    }
    report.views.push(view);
  }
  await page.setViewportSize({ width: 820, height: 820 });
  for (const view of ['explorer', 'intelligence', 'review', 'triage']) {
    await page.locator('#navToggle').click(); await page.locator(`#viewTabs [data-view="${view}"]`).click();
    for (const [button, panel] of [['mobileFilesBtn', 'fileSidebar'], ['mobileDetailsBtn', 'inspector']]) {
      await page.locator('#' + button).click(); assert.equal(await page.locator('#' + panel).isVisible(), true, `${view}: drawer ${panel}`);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#' + panel).isVisible(), false);
    }
    report.drawers.push(view);
  }
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.locator('#viewTabs [data-view="intelligence"]').click();
  await page.locator('#terminalToggle').click();
  await page.locator('#terminalTabs [role=tab]').first().waitFor();
  assert.equal(await page.locator('#terminalTabs [role=tab]').first().textContent(), 'Shell');
  const input = () => page.locator('#terminalSurface [role=tabpanel]:not([hidden]) .xterm-helper-textarea');
  await input().focus(); await page.keyboard.type('printf "UI_%s\\n" SHELL_READY; pwd; node --version'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#terminalSurface').textContent.includes('UI_SHELL_READY') && document.querySelector('#terminalSurface').textContent.includes('v24.20.0'));
  report.shellInputAndBundledNode = true;
  await page.keyboard.type('sleep 30'); await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Control+c');
  await page.keyboard.type('printf "UI_%s\\n" CANCEL_OK'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#terminalSurface').textContent.includes('UI_CANCEL_OK')); report.ctrlC = true;
  await page.locator('#terminalClose').click(); assert.equal(await page.locator('#terminalPanel').isVisible(), false);
  await page.locator('#terminalToggle').click(); assert.equal(await page.locator('#terminalTabs [role=tab]').count(), 1);
  await page.waitForFunction(() => document.activeElement?.classList.contains('xterm-helper-textarea'));
  report.hideAndFocusRestore = true;
  await page.locator('#newShellTerminal').click(); await page.waitForFunction(() => document.querySelectorAll('#terminalTabs [role=tab]').length === 2);
  await page.locator('#terminalTabs [role=tab]').first().click();
  await page.keyboard.type('printf "UI_%s\\n" FIRST_SESSION'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#terminalSurface [role=tabpanel]:not([hidden])').textContent.includes('UI_FIRST_SESSION'));
  report.sessionSwitching = true;
  const before = await page.locator('#terminalPanel').boundingBox();
  await page.locator('#terminalResizer').focus(); await page.keyboard.press('ArrowUp');
  assert.ok((await page.locator('#terminalPanel').boundingBox()).height > before.height); report.terminalResizing = true;
  await page.locator('#terminalTabs [role=tab]').first().click(); await page.keyboard.type('exit'); await page.keyboard.press('Enter');
  await page.locator('#terminalTabs [role=tab][data-ended=true]').waitFor();
  await page.locator('#newChatTerminal').click(); await page.waitForFunction(() => document.querySelectorAll('#terminalTabs [role=tab]').length === 3);
  assert.match(await page.locator('#terminalTabs [role=tab]').last().textContent(), /Onboarder Chat/); report.chatTab = true;
  if (!app.packaged) {
    await app.evaluate(({ BrowserWindow }) => { globalThis.shortcutInputs = []; BrowserWindow.getAllWindows()[0].webContents.on('before-input-event', (_event, input) => { globalThis.shortcutInputs.push(input); if (globalThis.shortcutInputs.length > 12) globalThis.shortcutInputs.shift(); }); });
    await app.evaluate(({ Menu }) => { const view = Menu.getApplicationMenu().items.find(item => item.label === 'View'); view.submenu.items.find(item => item.label === 'Toggle Terminal').click(); });
    await page.locator('#terminalPanel[hidden]').waitFor({ state: 'attached' });
    await app.evaluate(({ Menu }) => { const view = Menu.getApplicationMenu().items.find(item => item.label === 'View'); view.submenu.items.find(item => item.label === 'Toggle Terminal').click(); });
    await page.locator('#terminalPanel:not([hidden])').waitFor(); report.nativeMenuToggle = true;
    const shortcut = () => app.evaluate(({ BrowserWindow }) => { const contents = BrowserWindow.getAllWindows()[0].webContents; contents.sendInputEvent({ type: 'keyDown', keyCode: '`', modifiers: ['control'] }); contents.sendInputEvent({ type: 'keyUp', keyCode: '`', modifiers: ['control'] }); });
    // CDP keyboard injection bypasses Electron's native input hook; use its input API.
    await shortcut();
    await page.locator('#terminalPanel[hidden]').waitFor({ state: 'attached', timeout: 3000 });
    await shortcut();
    await page.locator('#terminalPanel:not([hidden])').waitFor({ timeout: 3000 }); report.keyboardShortcut = true;
  }
  assert.equal(await page.locator('.glass-control, #liquidGlassSetting').count(), 0);
  const homePromise = app.waitForEvent('window'); await page.locator('#newRepoBtn').click(); const home = await homePromise;
  await home.waitForFunction(() => document.body.dataset.ready === 'true'); const demoPromise = app.waitForEvent('window'); await home.locator('#demoBtn').click(); const demo = await demoPromise;
  demo.on('pageerror', error => report.errors.push(error.message));
  await demo.locator('#workspaceNav:not([hidden])').waitFor({ timeout: 60000 });
  const initial = await demo.evaluate(() => window.onboarderDesktop.initial()); assert.equal(path.basename(initial.root), 'core');
  assert.ok(!initial.recents.some(recent => recent.path === initial.root));
  await demo.locator('#terminalToggle').click(); await demo.locator('#terminalTabs [role=tab]').first().waitFor();
  await demo.locator('#terminalSurface .xterm-helper-textarea').focus();
  await demo.keyboard.type('printf "DEMO_%s\\n" READY'); await demo.keyboard.press('Enter');
  await demo.waitForFunction(() => document.querySelector('#terminalSurface').textContent.includes('DEMO_READY')); report.builtInDemoTerminal = true;
  assert.deepEqual(report.errors, []);
  await fs.mkdir(path.join(root, 'dist/qa'), { recursive: true });
  await page.screenshot({ path: path.join(root, `dist/qa/controls-${report.version}.png`) });
  await fs.writeFile(path.join(root, `dist/qa/controls-${app.packaged ? 'packaged' : 'source'}-${report.version}.json`), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(error); if (!app.packaged) console.error(await app.evaluate(() => globalThis.shortcutInputs).catch(() => [])); const page = app.windows()[0]; if (page) await page.screenshot({ path: path.join(root, 'dist/qa/controls-failure.png') }).catch(() => {}); throw error; }
finally {
  if (!app.packaged) await app.evaluate(({ BrowserWindow, app }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); app.exit(0); }).catch(() => {});
  await app.close().catch(() => {}); await fs.rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
