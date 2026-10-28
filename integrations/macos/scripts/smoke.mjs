import { testShell } from './testShell.mjs';
import { _electron as electron } from 'playwright';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, run } from './setup.mjs';
import { launchPackaged } from './packagedHarness.mjs';

const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'Onboarder Desktop QA '));
const fixture = path.join(sandbox, 'project ü with spaces'); const other = path.join(sandbox, 'second project');
for (const directory of [fixture, other]) { await fs.mkdir(directory); await fs.writeFile(path.join(directory, 'package.json'), '{"name":"fixture","type":"module"}'); await fs.writeFile(path.join(directory, 'app.js'), 'export function greet(name) { return `Hello ${name}`; }\n'); await fs.writeFile(path.join(directory, 'README.md'), '# Fixture repository\n'); run('git', ['init', '-q', directory]); }
const executablePath = process.argv[2] || path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const args = process.argv[2] ? ['--project=' + fixture] : [root, '--project=' + fixture];
const env = { ...process.env, SHELL: await testShell(sandbox), PATH: '/usr/bin:/bin:/usr/sbin:/sbin', ONBOARDER_DESKTOP_TEST_HOME: path.join(sandbox, 'appdata'), ONBOARDER_AGENT_HOME: path.join(sandbox, 'agent'), ONBOARDER_INTELLIGENCE_HOME: path.join(sandbox, 'intelligence') };
const app = process.argv[2] ? await launchPackaged(executablePath, args, env) : await electron.launch({ executablePath, args, timeout: 60000, env });
const errors = []; const report = {};
if (app.packaged) { const info = JSON.parse(await fs.readFile(path.resolve(path.dirname(executablePath), '../Resources/workspace/build-info.json'), 'utf8')); report.arch = info.arch; report.execution = info.arch === process.arch ? 'native host' : 'Rosetta on Apple Silicon'; }
try {
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.locator('#workspaceNav:not([hidden])').waitFor({ timeout: 60000 });
  report.title = await page.title();
  if (!app.packaged) { const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()); assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); }
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
  await page.waitForFunction(() => document.querySelector('#canvasContent svg, #canvasContent .mm-cell'));
  report.views = [];
  for (const view of ['explorer', 'graph', 'code', 'docs', 'intelligence', 'analysis', 'heatmap', 'insights', 'sbom', 'review', 'triage', 'diff', 'workflows', 'about']) {
    await page.locator(`#viewTabs [data-view="${view}"]`).click();
    await page.waitForFunction(v => document.querySelector(`#viewTabs [data-view="${v}"]`).classList.contains('is-active'), view);
    if (view === 'code') {
      await page.waitForFunction(() => window.monaco?.editor?.getModels().length > 0);
      await page.waitForFunction(() => window.monaco.languages.typescript.typescriptDefaults.getDiagnosticsOptions().noSyntaxValidation === true);
      report.editorWorker = await page.evaluate(async () => await Promise.race([(async () => {
        const uri = window.monaco.Uri.parse('file:///onboarder-desktop-qa.ts');
        const model = window.monaco.editor.createModel('const count: number = "wrong";', 'typescript', uri);
        try { const factory = await window.monaco.languages.typescript.getTypeScriptWorker(); const worker = await factory(uri); const diagnostics = await worker.getSemanticDiagnostics(uri.toString()); return diagnostics.some(item => item.code === 2322); }
        finally { model.dispose(); }
      })(), new Promise((_, reject) => setTimeout(() => reject(new Error('Editor worker timed out.')), 20000))]));
      assert.equal(report.editorWorker, true);
    }
    report.views.push(view);
  }
  await page.locator('#viewTabs [data-view="explorer"]').click();
  await page.locator('#terminalToggle').click();
  await page.locator('#terminalTabs [role=tab]').first().waitFor();
  await page.locator('#newChatTerminal').click();
  await page.waitForFunction(() => document.querySelectorAll('#terminalTabs [role=tab]').length === 2);
  await page.locator('#terminalTabs [role=tab]').first().click();
  await page.locator('#terminalSurface .xterm-helper-textarea:visible').focus();
  await page.keyboard.type("printf 'ONBOARDER_PTY_OK_\\u263A\\n'; node --version"); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#terminalSurface').textContent.includes('ONBOARDER_PTY_OK_') && document.querySelector('#terminalSurface').textContent.includes('24.20.0'), { timeout: 15000 });
  report.terminal = 'chat + shell, Unicode, bundled Node on restricted PATH';
  await fs.mkdir(path.join(root, 'dist/qa'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'dist/qa', 'desktop-' + (report.arch || 'development') + '.png') });
  const oldWindows = app.windows().length;
  const newWindow = app.waitForEvent('window');
  await page.evaluate(folder => window.onboarderDesktop.openProject(folder), other);
  const second = await newWindow;
  if (second) await second.locator('#workspaceNav:not([hidden])').waitFor({ timeout: 60000 });
  assert.equal(app.windows().length, oldWindows + 1);
  await page.evaluate(folder => window.onboarderDesktop.openProject(folder), fixture); assert.equal(app.windows().length, oldWindows + 1);
  report.windows = 'separate roots; reopening focuses existing window';
  assert.deepEqual(errors, []); report.pageErrors = errors;
  console.log(JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(root, 'dist/qa', app.packaged ? 'packaged-smoke-' + report.arch + '.json' : 'smoke.json'), JSON.stringify(report, null, 2));
} finally {
  if (!app.packaged) await app.evaluate(({ BrowserWindow, app }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); app.exit(0); }).catch(() => {});
  await app.close().catch(() => {});
  await fs.rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
