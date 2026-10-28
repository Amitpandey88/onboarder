import { _electron as electron } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { root } from './setup.mjs';
import { launchPackaged } from './packagedHarness.mjs';

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-performance-'));
const repository = path.join(fixture, 'working repository'); await fs.mkdir(repository);
const count = Number(process.argv.find(arg => arg.startsWith('--files='))?.slice(8) || 320);
assert.ok(Number.isInteger(count) && count >= 100 && count <= 3000);
for (let i = 0; i < count; i++) await fs.writeFile(path.join(repository, `task-${String(i).padStart(3, '0')}.js`), `export function task${i}(value) { return value + ${i}; }\n`);
const packagedPath = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const executablePath = packagedPath || path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const env = { ...process.env, ONBOARDER_DESKTOP_TEST_HOME: path.join(fixture, 'profile'), ONBOARDER_AGENT_HOME: path.join(fixture, 'agent'), ONBOARDER_INTELLIGENCE_HOME: path.join(fixture, 'intelligence') };
const app = packagedPath ? await launchPackaged(executablePath, ['--project=' + repository], env) : await electron.launch({ executablePath, args: [root, '--project=' + repository], env });
const results = { version: '', files: count, scenarios: [], pageErrors: [] };
try {
  const page = await app.firstWindow(); page.on('pageerror', error => results.pageErrors.push(error.message));
  await page.locator('#workspaceNav:not([hidden])').waitFor({ timeout: 60000 });
  await page.locator('#projectLoading[hidden]').waitFor({ state: 'attached' });
  results.version = (await page.evaluate(() => window.onboarderDesktop.initial())).version;
  await page.locator('#viewTabs [data-view="code"]').click();
  await page.waitForFunction(() => window.monaco?.editor?.getModels().length > 0);
  for (const method of ['solid']) {
    // Let Monaco finish its own first-frame layout before sampling steady work.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const frames = await page.evaluate(async () => {
      const durations = [], longTasks = []; let prior = 0;
      const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
      observer.observe({ type: 'longtask', buffered: false });
      const scroll = document.querySelector('#fileTree');
      for (let i = 0; i < 120; i++) {
        const now = await new Promise(requestAnimationFrame);
        if (prior) durations.push(now - prior); prior = now;
        scroll.scrollTop = i < 60 ? i * 14 : (120 - i) * 14;
      }
      observer.disconnect(); durations.sort((a, b) => a - b);
      return { frameP50: durations[Math.floor(durations.length * .5)], frameP95: durations[Math.floor(durations.length * .95)], framesOver50ms: durations.filter(ms => ms > 50).length, longTasksOver50ms: longTasks.length };
    });
    const started = Date.now();
    await page.locator('#treeFilter').fill('task-' + String(count - 9).padStart(3, '0'));
    await page.waitForFunction(() => document.querySelectorAll('#fileTree .tree-file').length === 1);
    const filterMs = Date.now() - started; await page.locator('#treeFilter').fill('');
    assert.ok(frames.frameP95 < 100, `${method}: sustained frame stalls`);
    results.scenarios.push({ method, ...frames, filterMs });
  }
  // A high-frequency pointer burst must produce one layout and one saved value,
  // rather than writing storage and resizing the editor for every mouse event.
  const handle = page.locator('#fileSidebar .panel-resizer');
  const bounds = await handle.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100); await page.mouse.down();
  const resizing = await page.evaluate(async () => {
    let layouts = 0, saves = 0;
    const storage = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.includes('onboarder.panel.')) saves++; return storage.call(this, key, value); };
    const onResize = () => layouts++; window.addEventListener('resize', onResize);
    const handle = document.querySelector('#fileSidebar .panel-resizer'), rect = handle.getBoundingClientRect();
    for (let i = 0; i < 128; i++) handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: rect.x + i / 2, bubbles: true }));
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    await new Promise(requestAnimationFrame);
    window.removeEventListener('resize', onResize); Storage.prototype.setItem = storage;
    return { pointerEvents: 128, layouts, saves };
  });
  await page.mouse.up();
  if (results.version !== '0.1.1') { assert.equal(resizing.layouts, 1); assert.equal(resizing.saves, 1); }
  results.resizing = resizing;
  let broadcasts = 0;
  await page.exposeFunction('recordAppearance', () => broadcasts++);
  await page.evaluate(async () => { const off = window.onboarderDesktop.subscribe(event => { if (event.type === 'appearance') window.recordAppearance(); }); for (let i = 0; i < 8; i++) await window.onboarderDesktop.preferences(); off(); });
  results.preferenceReadBroadcasts = broadcasts;
  if (results.version !== '0.1.1') assert.equal(broadcasts, 0);
  assert.deepEqual(results.pageErrors, []);
  await fs.mkdir(path.join(root, 'dist/qa'), { recursive: true });
  await fs.writeFile(path.join(root, `dist/qa/performance-${results.version}-${count}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  if (!app.packaged) await app.evaluate(({ BrowserWindow, app }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); app.exit(0); }).catch(() => {});
  await app.close().catch(() => {}); await fs.rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
