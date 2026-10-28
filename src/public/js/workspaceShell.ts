import { initWorkspaceTooltips } from './tooltips.js';
import type { AppearanceState } from './desktopHost.js';
import { desktopHost } from './desktopHost.js';
import { escapeHtml } from './html.js';

interface Recent { path: string; name: string; openedAt: number }
const RECENTS = 'onboarder.projects.v1';
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Optional preference. */ } };

export function initWorkspaceShell(openProject: (path: string) => void) {
  const el = (id: string) => document.getElementById(id)!;
  const host = desktopHost();
  initWorkspaceTooltips();
  let cloning = false;
  let cloneStorage: 'permanent' | 'temporary' = 'permanent';
  const small = window.matchMedia('(max-width: 900px)');
  let root = '';
  let terminalReady: Promise<{ toggle(): Promise<void>; hide(): void }> | undefined;
  let terminalAttempt = 0;
  let desktopVersion = '';
  let recents: Recent[] = [];
  try { const saved = JSON.parse(read(RECENTS) || '[]'); if (Array.isArray(saved)) recents = saved.filter(v => v && typeof v.path === 'string' && typeof v.name === 'string' && Number.isFinite(v.openedAt)).slice(0, 12); } catch {}
  const error = (e: unknown) => { const message = e instanceof Error ? e.message : String(e); el('landingError').textContent = message; el('landingError').hidden = false; if (root) { el('workspaceNoticeText').textContent = message; el('workspaceNotice').hidden = false; } };
  el('dismissWorkspaceNotice').addEventListener('click', () => { el('workspaceNotice').hidden = true; });
  let aboutTrigger: HTMLElement | null = null;
  function openAboutOnboarder(trigger: HTMLElement) {
    aboutTrigger = trigger; closeNav(); document.dispatchEvent(new CustomEvent('workspace-close-drawers'));
    (el('uiSettingsDialog') as HTMLDialogElement).close();
    el('aboutOnboarderBuild').textContent = host ? 'Mac app preview' + (desktopVersion ? ' ' + desktopVersion : '') : 'Web workspace';
    const dialog = el('aboutOnboarderDialog') as HTMLDialogElement; if (!dialog.open) dialog.showModal();
  }
  for (const id of ['aboutOnboarderBtn', 'landingAboutBtn']) el(id).addEventListener('click', () => openAboutOnboarder(el(id)));
  el('aboutOnboarderClose').addEventListener('click', () => (el('aboutOnboarderDialog') as HTMLDialogElement).close());
  el('aboutOnboarderDialog').addEventListener('close', () => { if (aboutTrigger?.getClientRects().length) aboutTrigger.focus({ preventScroll: true }); else el('appearanceHeaderBtn').focus(); });
  const openPath = (path: string) => host ? void host.openProject(path).catch(error) : openProject(path);
  function busy(message: string, detail = 'Reading files and preparing your workspace…') {
    el('projectLoading').hidden = false; el('openingTitle').textContent = message; el('openingDetail').textContent = detail;
    (el('openingProgress') as HTMLProgressElement).removeAttribute('value');
    (el('openingCancel') as HTMLButtonElement).disabled = false; el('openingCancel').textContent = 'Cancel';
  }
  function idle() { el('projectLoading').hidden = true; }
  function progress(label: string, percent: number | null, detail = '') {
    el('openingTitle').textContent = label; el('openingDetail').textContent = detail;
    const bar = el('openingProgress') as HTMLProgressElement;
    if (percent === null) bar.removeAttribute('value'); else { bar.max = 100; bar.value = percent; }
  }
  el('openingCancel').addEventListener('click', () => {
    if (cloning && host) { (el('openingCancel') as HTMLButtonElement).disabled = true; el('openingCancel').textContent = 'Stopping…'; void host.cancelClone().catch(error); }
    else el('cancelScanBtn').click();
  });
  function applyAppearance(state: AppearanceState) {
    document.body.dataset.motion = state.reducedMotion ? 'reduced' : 'system';
    (el('motionSetting') as HTMLSelectElement).value = state.motion;
  }
  function setCloneStorage(value: 'permanent' | 'temporary') {
    cloneStorage = value;
    if (host) el('gitInput').closest('section')!.querySelector('.load-card-note')!.textContent = value === 'temporary' ? 'An app-managed checkout, removed when its project window closes.' : 'Choose where to keep your checkout. It stays on your Mac.';
    (el('defaultCloneSetting') as HTMLSelectElement).value = value;
    for (const radio of el('cloneStorage').querySelectorAll<HTMLInputElement>('input')) radio.checked = radio.value === value;
  }
  async function openUISettings() {
    (el('aboutOnboarderDialog') as HTMLDialogElement).close();
    closeNav(); document.dispatchEvent(new CustomEvent('workspace-close-drawers'));
    if (host) { try { const prefs = await host.preferences(); applyAppearance(prefs.appearance); setCloneStorage(prefs.cloneStorage); } catch (e) { error(e); } }
    else { el('defaultCloneSettingRow').hidden = true; }
    const dialog = el('uiSettingsDialog') as HTMLDialogElement; if (!dialog.open) dialog.showModal();
  }
  for (const id of ['appearanceSettingsBtn', 'appearanceHeaderBtn']) el(id).addEventListener('click', () => { void openUISettings(); });
  el('uiSettingsClose').addEventListener('click', () => (el('uiSettingsDialog') as HTMLDialogElement).close());
  el('uiSettingsDialog').addEventListener('close', () => { if (el('settingsDrawer').hidden) el('appearanceHeaderBtn').focus(); });
  el('motionSetting').addEventListener('change', () => {
    const motion = (el('motionSetting') as HTMLSelectElement).value as 'system' | 'reduced';
    if (host) void host.preferences({ motion }).then(value => applyAppearance(value.appearance)).catch(error);
    else { write('onboarder.motion', motion); document.body.dataset.motion = motion; }
  });
  const rememberStorage = (value: 'permanent' | 'temporary') => { setCloneStorage(value); if (host) void host.preferences({ cloneStorage: value }).catch(error); };
  el('defaultCloneSetting').addEventListener('change', () => rememberStorage((el('defaultCloneSetting') as HTMLSelectElement).value as 'permanent' | 'temporary'));
  el('cloneStorage').addEventListener('change', event => rememberStorage((event.target as HTMLInputElement).value as 'permanent' | 'temporary'));
  el('navHomeBtn').addEventListener('click', () => { closeNav(); el('projectHomeBtn').click(); });
  el('projectHomeBtn').addEventListener('click', () => { if (host) void host.home().catch(error); else if (root) el('newRepoBtn').click(); });
  el('repoChip').addEventListener('click', () => { if (host) void host.reveal().catch(error); else if (root) void navigator.clipboard.writeText(root).catch(error); });
  document.body.dataset.motion = read('onboarder.motion') || 'system';
  function renderRecents() {
    el('recentProjects').hidden = !recents.length;
    el('recentProjectList').innerHTML = recents.map((r, i) => `<button class="recent-project" data-recent="${i}"><strong>${escapeHtml(r.name)}</strong><span>${escapeHtml(r.path)}</span><time>${new Date(r.openedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></button>`).join('');
  }
  el('recentProjectList').addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-recent]'); if (button) openPath(recents[Number(button.dataset.recent)].path); });
  el('clearRecents').addEventListener('click', () => { recents = []; write(RECENTS, '[]'); renderRecents(); void host?.clearRecents().catch(error); });
  renderRecents();
  function closeNav() { document.body.dataset.navOpen = 'false'; el('navScrim').hidden = true; el('navToggle').setAttribute('aria-expanded', String(!small.matches && document.body.dataset.navCollapsed !== 'true')); }
  el('navToggle').addEventListener('click', () => {
    if (small.matches) { const show = document.body.dataset.navOpen !== 'true'; document.body.dataset.navOpen = String(show); el('navScrim').hidden = !show; el('navToggle').setAttribute('aria-expanded', String(show)); el('navToggle').dataset.tooltip = show ? 'Hide navigation' : 'Show navigation'; }
    else { const hide = document.body.dataset.navCollapsed !== 'true'; document.body.dataset.navCollapsed = String(hide); el('navToggle').setAttribute('aria-expanded', String(!hide)); el('navToggle').dataset.tooltip = hide ? 'Show sidebar' : 'Hide sidebar'; window.dispatchEvent(new window.Event('resize')); }
  });
  el('navScrim').addEventListener('click', closeNav);
  el('viewTabs').addEventListener('click', event => { if ((event.target as Element).closest('.view-tab')) closeNav(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.dataset.navOpen === 'true') { closeNav(); el('navToggle').focus(); } });
  small.addEventListener('change', closeNav);
  el('serverNav').addEventListener('click', () => { closeNav(); el('serverBtn').click(); });
  for (const [id, attr] of [['toggleFiles', 'hideFiles'], ['toggleInspector', 'hideDetails']]) {
    const panelId = id === 'toggleFiles' ? 'fileSidebar' : 'inspector';
    el(id).setAttribute('aria-controls', panelId);
    el(id).addEventListener('click', () => {
      if (small.matches) { el(id === 'toggleFiles' ? 'mobileFilesBtn' : 'mobileDetailsBtn').click(); return; }
      const hide = el('explorer').dataset[attr] !== 'true'; el('explorer').dataset[attr] = String(hide);
      el(id).setAttribute('aria-pressed', String(!hide)); el(id).setAttribute('aria-expanded', String(!hide));
      if (root) write('onboarder.panel.' + root + '.' + attr, String(hide));
      window.dispatchEvent(new window.Event('resize'));
    });
  }
  for (const [panelId, variable, min, max, sign] of [['fileSidebar', '--files-width', 170, 380, 1], ['inspector', '--details-width', 230, 480, -1]] as const) {
    const handle = document.createElement('button'); handle.className = 'panel-resizer'; handle.setAttribute('aria-label', `Resize ${panelId === 'inspector' ? 'details' : 'files'} panel`);
    let frame = 0, pendingSize: number | null = null, dirty = false;
    const applySize = () => { frame = 0; if (pendingSize === null) return; document.documentElement.style.setProperty(variable, pendingSize + 'px'); pendingSize = null; window.dispatchEvent(new window.Event('resize')); };
    const resize = (value: number) => { pendingSize = Math.max(min, Math.min(max, value)); dirty = true; if (!frame) frame = requestAnimationFrame(applySize); };
    const commit = () => { if (!dirty) return; if (frame) { cancelAnimationFrame(frame); applySize(); } if (root) write('onboarder.panel.' + root + variable, document.documentElement.style.getPropertyValue(variable).replace('px', '')); dirty = false; };
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const x = event.clientX, initial = el(panelId).getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => resize(initial + (e.clientX - x) * sign);
      const done = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', done); handle.removeEventListener('pointercancel', done); handle.removeEventListener('lostpointercapture', done); commit(); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', done); handle.addEventListener('pointercancel', done); handle.addEventListener('lostpointercapture', done);
    });
    handle.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize((pendingSize ?? el(panelId).getBoundingClientRect().width) + (event.key === 'ArrowRight' ? 16 : -16) * sign); } });
    handle.addEventListener('keyup', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') commit(); });
    handle.addEventListener('blur', () => { if (dirty) commit(); });
    el(panelId).append(handle);
  }
  if (host) {
    el('terminalToggle').addEventListener('click', () => {
      if (!root) return;
      const button = el('terminalToggle') as HTMLButtonElement;
      button.disabled = true; button.setAttribute('aria-busy', 'true');
      const terminalModule = '/desktop/terminal.js?v=' + encodeURIComponent(desktopVersion) + '&attempt=' + terminalAttempt++;
      terminalReady ||= import(terminalModule).then(module => module.mountTerminal(host, () => root)).catch(e => { terminalReady = undefined; throw e; });
      void terminalReady.then(controller => controller.toggle()).catch(e => {
        el('terminalPanel').hidden = false; document.body.dataset.terminal = 'true'; button.setAttribute('aria-expanded', 'true');
        el('terminalStatus').textContent = 'Could not open the terminal. ' + (e instanceof Error ? e.message : String(e));
        el('terminalRetry').hidden = false; el('terminalRetry').onclick = () => { el('terminalPanel').hidden = true; button.click(); };
        el('terminalClose').onclick = () => { el('terminalPanel').hidden = true; document.body.dataset.terminal = 'false'; button.setAttribute('aria-expanded', 'false'); button.focus(); };
      }).finally(() => { button.disabled = false; button.removeAttribute('aria-busy'); });
    });
    document.body.dataset.desktop = 'true'; el('nativeOpenBtn').hidden = false; el('pathInput').closest('section')!.querySelector('.load-card-note')!.textContent = 'Work directly in a folder on your Mac. Nothing is copied.';
    el('cloneStorage').hidden = false;
    el('nativeOpenBtn').addEventListener('click', () => { busy('Opening a project…', 'Choose a folder in the dialog.'); void host.openProject().catch(error).finally(idle); });
    document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); el('homeDropzone').classList.add('is-dragging'); } });
    document.addEventListener('dragleave', event => { if (!event.relatedTarget) el('homeDropzone').classList.remove('is-dragging'); });
    document.addEventListener('drop', event => { el('homeDropzone').classList.remove('is-dragging'); if (event.dataTransfer?.files.length) { event.preventDefault(); busy('Opening dropped project…'); void host.dropped(Array.from(event.dataTransfer.files)).catch(error).finally(idle); } });
    host.subscribe(event => {
      if (event.type === 'menu') {
        if (event.action === 'about-onboarder') el('aboutOnboarderBtn').click();
        if (event.action === 'settings') void openUISettings();
        if (event.action === 'search') el('searchTriggerBtn').click();
        if (event.action === 'terminal') el('terminalToggle').click();
      }
      if (event.type === 'appearance') applyAppearance(event.appearance);
      if (event.type === 'clone-progress') { if (cloning) progress(event.phase, event.percent, event.detail); }
      if (event.type === 'backend-down') {
        document.querySelector('.desktop-recovery')?.remove();
        const banner = document.createElement('div'); banner.className = 'desktop-recovery'; banner.setAttribute('role', 'alert'); banner.textContent = 'The project service stopped. Reload to reconnect. Commands will not restart automatically. ';
        const button = document.createElement('button'); button.className = 'btn btn-ghost'; button.textContent = 'Reload workspace'; button.onclick = () => location.reload(); banner.append(button); document.body.prepend(banner);
      }
    });
    void host.initial().then(initial => { desktopVersion = initial.version; recents = initial.recents; renderRecents(); applyAppearance(initial.appearance); setCloneStorage(initial.cloneStorage); document.body.dataset.temporary = String(initial.temporary); if (initial.root) openProject(initial.root); }).catch(error);
  }
  if (!host) {
    document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); el('homeDropzone').classList.add('is-dragging'); } });
    document.addEventListener('dragleave', event => { if (!event.relatedTarget) el('homeDropzone').classList.remove('is-dragging'); });
    document.addEventListener('drop', event => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault(); el('homeDropzone').classList.remove('is-dragging');
      const item = event.dataTransfer.items[0] as unknown as { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
      if (!item?.getAsFileSystemHandle) { error(new Error('This browser cannot open dropped folders. Use Choose a folder instead.')); return; }
      void item.getAsFileSystemHandle().then(handle => {
        if (handle?.kind !== 'directory') throw new Error('Drop a project folder rather than an individual file.');
        document.dispatchEvent(new CustomEvent('workspace-browser-folder', { detail: handle }));
      }).catch(error);
    });
  }
  return {
    busy, idle, progress,
    async clone(url: string) {
      if (!host || cloning) return;
      cloning = true; busy('Cloning repository…', cloneStorage === 'permanent' ? 'Choose where to keep it in the dialog.' : 'Preparing a temporary project…');
      try { await host.cloneProject(url, { storage: cloneStorage }); } catch (e) { error(e); } finally { cloning = false; idle(); }
    },
    loaded(path: string, name: string, temporary: boolean) {
      root = path; document.body.dataset.workspace = 'true';
      for (const id of ['workspaceNav', 'navToggle', 'toggleFiles', 'toggleInspector']) el(id).hidden = false;
      el('terminalToggle').hidden = !host; el('navToggle').setAttribute('aria-expanded', 'true');
      for (const [attr, button] of [['hideFiles', 'toggleFiles'], ['hideDetails', 'toggleInspector']]) {
        const hide = read('onboarder.panel.' + root + '.' + attr) === 'true'; el('explorer').dataset[attr] = String(hide);
        el(button).setAttribute('aria-pressed', String(!hide)); el(button).setAttribute('aria-expanded', String(!hide));
      }
      for (const variable of ['--files-width', '--details-width']) { const n = Number(read('onboarder.panel.' + root + variable)); if (n >= 170 && n <= 480) document.documentElement.style.setProperty(variable, n + 'px'); else document.documentElement.style.removeProperty(variable); }
      if (!host && !temporary && document.body.dataset.temporary !== 'true' && path) { recents = [{ path, name, openedAt: Date.now() }, ...recents.filter(r => r.path !== path)].slice(0, 12); write(RECENTS, JSON.stringify(recents)); renderRecents(); }
    },
    unloaded() { root = ''; delete document.body.dataset.workspace; for (const id of ['workspaceNav', 'navToggle', 'toggleFiles', 'toggleInspector']) el(id).hidden = true; closeNav(); },
  };
}
