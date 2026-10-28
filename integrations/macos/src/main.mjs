import { app, BrowserWindow, Menu, dialog, ipcMain, session, protocol, shell, safeStorage, net, nativeTheme, systemPreferences } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { resolveAppearance, appearancePatch } from './appearance.mjs';
import { TemporaryProjects } from './clones.mjs';
import { APP_ORIGIN, trustedSender, text, externalURL, assetPath, terminalInput, projectPath } from './policy.mjs';
import { DesktopStore } from './store.mjs';
import { BackendClient } from './backendClient.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const resources = app.isPackaged ? path.join(process.resourcesPath, 'workspace') : path.resolve(here, '../dist/stage');
const windows = new Map(), pendingOpen = []; let store, temporaryProjects, quitting = false, quitPending = false;
if (process.env.ONBOARDER_DESKTOP_TEST_HOME) app.setPath('userData', path.resolve(process.env.ONBOARDER_DESKTOP_TEST_HOME));
protocol.registerSchemesAsPrivileged([{ scheme: 'onboarder', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

function environment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(?:ELECTRON_|NODE_OPTIONS$|NODE_PATH$|DYLD_|ONBOARDER_GITHUB_(?:CONFIG_FILE|WEBHOOK_SECRET)$|ONBOARDER_TEAM_FILE$)/.test(key)) delete env[key];
  env.PATH = [path.join(resources, 'desktop-bin'), path.join(resources, 'node/bin'), path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'].join(':');
  env.ONBOARDER_CONFIG = path.join(app.getPath('userData'), 'desktop-server.json'); env.NO_OPEN = '1';
  return env;
}
const send = (record, event) => { if (!record.window.isDestroyed()) record.window.webContents.send('desktop:event', event); };
async function backend(record) {
  if (record.backend?.port) return record.backend;
  if (record.starting) return record.starting;
  const service = new BackendClient(resources, record.root, environment(), event => { if (event.type === 'terminal-exit') record.terminals?.delete(event.id); if (event.type === 'backend-down') record.terminals?.clear(); if (event.type === 'clone-progress' && !record.window.isDestroyed()) record.window.setProgressBar(event.percent === null ? 2 : event.percent / 100); send(record, event); }); record.backend = service;
  record.starting = service.start().then(() => service).finally(() => { record.starting = null; });
  return record.starting;
}

async function createWindow(root = null, options = {}) {
  if (root) {
    root = await fs.realpath(projectPath(root, os.homedir()));
    if (!(await fs.stat(root)).isDirectory()) throw new Error('Choose a repository folder.');
  }
  for (const record of windows.values()) if (record.root === root && !record.window.isDestroyed()) { record.window.show(); record.window.focus(); return record.window; }
  const partition = 'persist:onboarder-' + createHash('sha256').update(root || 'welcome').digest('hex').slice(0, 24);
  const ses = session.fromPartition(partition);
  const saved = (await store.read('windows'))[root || 'welcome'];
  const window = new BrowserWindow({ width: saved?.width >= 800 && saved.width <= 3000 ? saved.width : 1440, height: saved?.height >= 600 && saved.height <= 2000 ? saved.height : 920, minWidth: 800, minHeight: 600,
    title: root ? `${path.basename(root)} — Onboarder` : 'Onboarder', titleBarStyle: 'hiddenInset', backgroundColor: '#f7f4ed', show: false,
    webPreferences: { session: ses, preload: path.join(here, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, webviewTag: false, safeDialogs: true },
  });
  const contentsId = window.webContents.id;
  window.on('page-title-updated', event => event.preventDefault());
  const record = { window, root, demo: Boolean(options.demo), backend: null, starting: null, allowClose: false, terminals: new Set(), session: ses, temporaryRoot: options.temporaryRoot || null, pendingTemps: new Set(), cloneOperation: null }; windows.set(window.webContents.id, record);
  window.webContents.on('before-input-event', (event, input) => {
    if (input.control && !input.alt && !input.meta && (input.code === 'Backquote' || input.key === '`')) {
      event.preventDefault(); // Suppress the menu accelerator and renderer path; dispatch once.
      if (input.type === 'keyDown' && !input.isAutoRepeat) send(record, { type: 'menu', action: 'terminal' });
    }
  });
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false)); ses.setPermissionCheckHandler(() => false);
  if (ses.protocol.isProtocolHandled) { if (await ses.protocol.isProtocolHandled('onboarder')) ses.protocol.unhandle('onboarder'); }
  ses.protocol.handle('onboarder', async request => {
    try {
      const url = new URL(request.url);
      if (url.origin !== 'null' && url.origin !== APP_ORIGIN || url.hostname !== 'workspace') return new Response('Unknown application origin.', { status: 403 });
      if (url.pathname.startsWith('/desktop/')) {
        const file = assetPath(path.join(resources, 'desktop'), '/' + url.pathname.slice('/desktop/'.length));
        if (!file || !/\.(?:js|css|woff2)$/.test(file)) return new Response('Not found.', { status: 404 });
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers); headers.set('cache-control', 'no-store'); headers.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'");
        return new Response(response.body, { status: response.status, headers });
      }
      const service = await backend(record);
      const target = `http://127.0.0.1:${service.port}`;
      const headers = new Headers(request.headers); headers.delete('host'); headers.set('origin', target); headers.set('sec-fetch-site', 'same-origin'); headers.set('x-onboarder-desktop-token', service.token);
      const controller = new AbortController(); request.signal.addEventListener('abort', () => controller.abort(), { once: true });
      const response = await fetch(target + url.pathname + url.search, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, duplex: 'half', signal: controller.signal, redirect: 'manual' });
      return new Response(response.body, { status: response.status, headers: response.headers });
    } catch { return new Response('The project service is unavailable. Reload the workspace to reconnect.', { status: 503 }); }
  });
  window.webContents.setWindowOpenHandler(({ url }) => { try { void shell.openExternal(externalURL(url)); } catch {} return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(APP_ORIGIN + '/')) { event.preventDefault(); try { void shell.openExternal(externalURL(url)); } catch {} } });
  window.webContents.on('render-process-gone', () => { record.backend?.stop(); record.backend = null; record.terminals.clear(); });
  ses.removeAllListeners('will-download');
  ses.on('will-download', (_event, item) => { item.setSaveDialogOptions({ title: 'Export from Onboarder', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())), properties: ['showOverwriteConfirmation'] }); });
  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    if (!record.allowClose && (record.backend?.active || record.cloneOperation || record.pendingTemps.size || record.terminals.size || record.temporaryRoot)) {
      event.preventDefault();
      void dialog.showMessageBox(window, { type: 'question', message: 'Close this project?', detail: record.temporaryRoot ? 'This temporary checkout and its local changes will be removed. Keep a copy before closing if you need it.' : 'Its terminals and active operations will stop. Saved conversations and repository files remain on disk.', buttons: ['Keep open', 'Close project'], cancelId: 0, defaultId: 0 }).then(({ response }) => { if (response === 1) { record.allowClose = true; window.close(); } }); return;
    }
    const { width, height } = window.getNormalBounds(); void store.update('windows', value => ({ ...value, [root || 'welcome']: { width, height } })).catch(() => {});
    void disposeRecord(record);
  });
  window.on('closed', () => { void disposeRecord(record); windows.delete(contentsId); ses.protocol.unhandle('onboarder'); });
  if (root && !record.temporaryRoot && !record.demo) { await store.remember(root); if (!process.env.ONBOARDER_DESKTOP_TEST_HOME) app.addRecentDocument(root); }
  await applyAppearance(record);
  await window.loadURL(APP_ORIGIN + '/');
  updateMenu(); return window;
}

async function chooseProject(record, supplied, options = {}) {
  let selected = supplied;
  if (!selected) { const result = await dialog.showOpenDialog(record?.window, { title: 'Open a project', properties: ['openDirectory'] }); if (result.canceled) return; selected = result.filePaths[0]; }
  const window = await createWindow(text(selected), options);
  if (record && !record.root && record.window !== window) { record.allowClose = true; record.window.close(); }
}
function register(name, handler) {
  ipcMain.handle('desktop:' + name, async (event, ...args) => {
    if (!trustedSender(event)) throw new Error('This action is available only in the Onboarder workspace.');
    const record = windows.get(event.sender.id); if (!record) throw new Error('This workspace is closed.');
    return handler(record, ...args);
  });
}
register('initial', async record => ({ root: record.root, temporary: Boolean(record.temporaryRoot), recents: await store.recents(), version: app.getVersion(), appearance: await applyAppearance(record), cloneStorage: (await store.read('preferences')).cloneStorage || 'permanent' }));
register('home', () => createWindow().then(() => {}));
register('preferences', async (_record, patch) => {
  const preferences = patch === undefined ? await store.read('preferences') : await store.update('preferences', value => ({ ...value, ...appearancePatch(patch) }));
  const appearance = await appearanceState(preferences);
  if (patch !== undefined) for (const record of windows.values()) await applyAppearance(record, appearance);
  return { appearance, cloneStorage: preferences.cloneStorage || 'permanent' };
});
register('cancel-clone', async record => { record.cloneCancelled = true; if (record.cloneRequested && record.cloneOperation) await record.backend?.request('clone-cancel', { operationId: record.cloneOperation }); });
register('open', chooseProject);
register('demo', record => chooseProject(record, path.join(resources, 'core'), { demo: true }));
register('drop', async (record, paths) => { if (!Array.isArray(paths) || paths.length > 8) throw new Error('Drop a project folder.'); for (const selected of paths) await chooseProject(record, text(selected)); });
register('clear-recents', async () => { await store.clearRecents(); app.clearRecentDocuments(); updateMenu(); });
register('reveal', async record => { if (record.root) shell.showItemInFolder(record.root); });
register('credential', (_record, action, endpoint, secret) => store.credential(action, endpoint, secret));
register('terminal', async (record, action, input) => { terminalInput(action, input); const service = await backend(record); const result = await service.request('terminal', { action, input }); if (action === 'create') record.terminals.add(result.id); if (action === 'close') record.terminals.delete(input.id); return result; });
register('clone', async (record, url, options = {}) => {
  text(url);
  if (record.cloneOperation) throw new Error('A clone is already running in this window.');
  record.cloneCancelled = false;
  const storage = options.storage || (await store.read('preferences')).cloneStorage || 'permanent';
  appearancePatch({ cloneStorage: storage });
  await store.update('preferences', value => ({ ...value, cloneStorage: storage }));
  let destination, temporaryRoot;
  const parsedName = url.replace(/\.git\/?$/, '').split(/[/:]/).pop() || 'repository';
  if (storage === 'temporary') {
    destination = temporaryRoot = await temporaryProjects.create(parsedName); record.pendingTemps.add(temporaryRoot);
  } else {
    const result = await dialog.showSaveDialog(record.window, { title: 'Keep this repository on your Mac', defaultPath: path.join(app.getPath('documents'), parsedName.replace(/[^a-zA-Z0-9._-]/g, '-')) });
    if (result.canceled || !result.filePath) return;
    destination = result.filePath;
  }
  const operationId = record.cloneOperation = randomUUID();
  send(record, { type: 'clone-started', operationId });
  try {
    const service = await backend(record);
    if (record.cloneCancelled) throw new Error('Clone cancelled.');
    record.cloneRequested = true;
    const cloned = await service.request('clone', { url, destination, operationId });
    if (record.window.isDestroyed()) return;
    const projectWindow = await createWindow(cloned.path, { temporaryRoot });
    record.pendingTemps.delete(temporaryRoot); temporaryRoot = null;
    record.cloneOperation = null;
    if (!record.root && record.window !== projectWindow) { record.allowClose = true; record.window.close(); }
  } finally {
    record.cloneOperation = null; record.cloneRequested = false; if (!record.window.isDestroyed()) record.window.setProgressBar(-1);
    if (temporaryRoot) { record.pendingTemps.delete(temporaryRoot); await temporaryProjects.remove(temporaryRoot); }
  }
});

async function appearanceState(preferences) {
  return resolveAppearance(preferences || await store.read('preferences'), { reducedMotion: systemPreferences.getAnimationSettings().prefersReducedMotion });
}
async function applyAppearance(record, state = null) {
  state ||= await appearanceState();
  if (record.window.isDestroyed()) return state;
  // Never replace the native contentView or make the Chromium window transparent.
  // A preference read/focus event must not rebuild the window's compositor tree.
  const key = JSON.stringify(state);
  if (record.appearanceKey !== key) { record.appearanceKey = key; send(record, { type: 'appearance', appearance: state }); }
  return state;
}
async function refreshAppearance() { const state = await appearanceState(); for (const record of windows.values()) await applyAppearance(record, state); }
async function disposeRecord(record) {
  if (record.disposing) return record.disposing;
  record.disposing = (async () => {
    const service = record.backend, child = service?.child; service?.stop();
    if (child?.pid && child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2500))]);
    if (child?.pid && child.exitCode === null) return; // Leave a receipt for safe cleanup at the next launch.
    for (const root of [record.temporaryRoot, ...record.pendingTemps].filter(Boolean)) await temporaryProjects.remove(root).catch(() => {});
    if (record.temporaryRoot) { await record.session.clearStorageData().catch(() => {}); }
  })();
  return record.disposing;
}

function focused() { return windows.get(BrowserWindow.getFocusedWindow()?.webContents.id) || windows.values().next().value; }
function action(name) { const record = focused(); if (record) send(record, { type: 'menu', action: name }); }
async function reloadWorkspace() {
  const record = focused(); if (!record) return;
  if (record.backend?.active || record.terminals.size) {
    const { response } = await dialog.showMessageBox(record.window, { type: 'question', message: 'Reload this workspace?', detail: 'Its terminals and active operations will stop. Commands will not restart automatically.', buttons: ['Keep working', 'Stop and reload'], defaultId: 0, cancelId: 0 });
    if (response !== 1) return;
  }
  record.backend?.stop(); record.backend = null; record.terminals.clear(); record.window.webContents.reload();
}
function updateMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Onboarder', submenu: [{ label: 'About Onboarder', click: () => action('about-onboarder') }, { label: 'System…', accelerator: 'Cmd+,', click: () => action('settings') }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [{ label: 'Open Project…', accelerator: 'Cmd+O', click: () => chooseProject(focused()).catch(showError) }, { label: 'Project Home', accelerator: 'Cmd+Shift+N', click: () => createWindow().catch(showError) }, { role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] }, { label: 'Reveal Project in Finder', click: () => { const r = focused(); if (r?.root) shell.showItemInFolder(r.root); } }, { type: 'separator' }, { role: 'close' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ label: 'Search', accelerator: 'Cmd+K', click: () => action('search') }, { label: 'Toggle Terminal', accelerator: 'Ctrl+`', click: () => action('terminal') }, { type: 'separator' }, { id: 'reload-workspace', label: 'Reload Workspace', accelerator: 'Cmd+R', click: () => reloadWorkspace().catch(showError) }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : [])] },
    { role: 'windowMenu' }, { role: 'help', submenu: [{ label: 'Check for Updates…', click: () => shell.openExternal('https://github.com/Amitpandey88/onboarder/releases') }, { label: 'Documentation', click: () => shell.openExternal('https://github.com/Amitpandey88/onboarder#readme') }] },
  ]));
}
function showError(error) { dialog.showErrorBox('Onboarder', error.message || 'The project could not be opened.'); }
app.on('second-instance', (_event, argv) => { const requested = argv.find(arg => arg.startsWith('--project='))?.slice(10); if (requested) void createWindow(requested).catch(showError); else { const r = focused(); r?.window.show(); r?.window.focus(); } });
app.on('open-file', (event, selected) => { event.preventDefault(); if (!store) pendingOpen.push(selected); else void createWindow(selected).catch(showError); });
app.on('activate', () => { if (!windows.size && store) void createWindow().catch(showError); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); if (quitPending) return; quitPending = true;
  void (async () => {
    const active = [...windows.values()].some(record => record.backend?.active || record.cloneOperation || record.pendingTemps.size || record.terminals.size || record.temporaryRoot);
    if (active) {
      const { response } = await dialog.showMessageBox({ type: 'question', message: 'Quit Onboarder?', detail: 'All terminals and operations will stop. Temporary checkouts and their local changes will be removed.', buttons: ['Keep working', 'Quit'], cancelId: 0, defaultId: 0 });
      if (response !== 1) { quitPending = false; return; }
    }
    for (const record of windows.values()) record.allowClose = true;
    await Promise.all([...windows.values()].map(disposeRecord)); quitting = true; app.quit();
  })().catch(error => { quitPending = false; showError(error); });
});
app.whenReady().then(async () => {
if (!hasInstanceLock) return;
store = new DesktopStore(app.getPath('userData'), safeStorage);
if ('liquidGlass' in await store.read('preferences')) await store.update('preferences', value => { delete value.liquidGlass; return value; });
temporaryProjects = new TemporaryProjects(path.join(app.getPath('userData'), 'temporary-projects'));
await temporaryProjects.sweep();
nativeTheme.on('updated', () => { void refreshAppearance(); });
systemPreferences.subscribeWorkspaceNotification('NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification', () => { void refreshAppearance(); });
app.setAboutPanelOptions({ applicationName: 'Onboarder', applicationVersion: app.getVersion(), version: 'Desktop preview · core 1.2.0', copyright: 'MIT licensed · Amit Pandey', website: 'https://onboarder.intellimatrix.in/' });
updateMenu();
const requestedRoot = process.argv.find(arg => arg.startsWith('--project='))?.slice(10);
if (pendingOpen.length) for (const selected of pendingOpen.splice(0)) await createWindow(selected).catch(showError);
else await createWindow(requestedRoot || null).catch(showError);
}).catch(showError);
