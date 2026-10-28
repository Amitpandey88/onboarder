import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { DesktopHost } from '../../../src/public/js/desktopHost.js';
import '@xterm/xterm/css/xterm.css';

type Kind = 'chat' | 'shell';
interface Session { term: Terminal; fit: FitAddon; container: HTMLDivElement; button: HTMLButtonElement; wrapper: HTMLDivElement; ended: boolean; dimensions: string }

export function mountTerminal(host: DesktopHost, getRoot: () => string) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const panel = el('terminalPanel'), surface = el('terminalSurface'), tabs = el('terminalTabs');
  const sessions = new Map<string, Session>(), counts = { chat: 0, shell: 0 };
  let active: string | null = null, frame = 0, creating: Promise<void> | null = null, retryKind: Kind = 'shell';
  const key = () => 'onboarder.terminal.height.' + getRoot();
  function setHeight(height: number) {
    const toolbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-height')) || 60;
    const size = Math.max(150, Math.min(Math.max(150, innerHeight - toolbar - 140), height));
    document.documentElement.style.setProperty('--terminal-height', size + 'px');
    el('terminalResizer').setAttribute('aria-valuenow', String(Math.round(size)));
  }
  function status(message = '') { el('terminalStatus').textContent = message; }
  function fail(error: unknown) { status(error instanceof Error ? error.message : String(error)); el('terminalRetry').hidden = false; }
  function layout() {
    frame = 0; const session = active ? sessions.get(active) : null;
    if (panel.hidden || !session || surface.clientWidth < 20 || surface.clientHeight < 20) return;
    session.fit.fit();
    const cols = Math.min(500, Math.max(2, session.term.cols)), rows = Math.min(200, Math.max(2, session.term.rows));
    const dimensions = cols + ':' + rows;
    if (!session.ended && dimensions !== session.dimensions) {
      session.dimensions = dimensions;
      void host.terminal('resize', { id: active!, cols, rows }).catch(error => { session.dimensions = ''; if (!session.ended) fail(error); });
    }
  }
  function resize() { if (!frame) frame = requestAnimationFrame(layout); }
  function show() {
    if (!getRoot()) return;
    if (panel.hidden) { let saved = 280; try { saved = Number(localStorage.getItem(key())) || 280; } catch {} setHeight(saved); }
    panel.hidden = false; document.body.dataset.terminal = 'true';
    el('terminalToggle').setAttribute('aria-expanded', 'true');
    el('terminalProject').textContent = getRoot().split('/').pop() || 'Terminal'; el('terminalProject').dataset.tooltip = getRoot();
    resize(); window.dispatchEvent(new Event('resize'));
  }
  function hide() {
    panel.hidden = true; document.body.dataset.terminal = 'false'; el('terminalToggle').setAttribute('aria-expanded', 'false');
    window.dispatchEvent(new Event('resize')); el('terminalToggle').focus();
  }
  function select(id: string) {
    active = id;
    for (const [key, session] of sessions) { session.container.hidden = key !== id; session.button.setAttribute('aria-selected', String(key === id)); session.button.tabIndex = key === id ? 0 : -1; }
    resize(); sessions.get(id)?.term.focus();
  }
  async function create(kind: Kind) {
    if (creating) return creating;
    if (!getRoot()) return;
    show(); retryKind = kind; status('Starting ' + (kind === 'shell' ? 'shell' : 'Onboarder Chat') + '…'); el('terminalRetry').hidden = true;
    for (const id of ['newChatTerminal', 'newShellTerminal']) el<HTMLButtonElement>(id).disabled = true;
    creating = (async () => {
      let id: string | undefined;
      try {
        const result = await host.terminal('create', { kind, cols: 100, rows: 24 }); id = result.id;
        if (!id) throw new Error('The terminal could not be started.');
        const container = document.createElement('div'); container.id = 'terminal-' + id; container.setAttribute('role', 'tabpanel'); surface.append(container);
        const term = new Terminal({ fontFamily: 'Menlo, monospace', fontSize: 12, scrollback: 4000, allowProposedApi: false, theme: { background: '#211e19', foreground: '#ece7db', cursor: '#8fbd9f' } });
        const fit = new FitAddon(); term.loadAddon(fit); term.open(container); term.parser.registerOscHandler(52, () => true);
        const wrapper = document.createElement('div'); wrapper.className = 'terminal-tab';
        const button = document.createElement('button'); button.className = 'btn btn-ghost btn-sm'; button.id = 'terminal-tab-' + id;
        button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', container.id); container.setAttribute('aria-labelledby', button.id);
        const number = ++counts[kind]; button.textContent = (kind === 'chat' ? 'Onboarder Chat' : 'Shell') + (number > 1 ? ' ' + number : '');
        const sessionId = id; button.onclick = () => select(sessionId);
        const close = document.createElement('button'); close.className = 'btn btn-ghost btn-sm'; close.textContent = '×'; close.setAttribute('aria-label', 'Close ' + button.textContent);
        close.onclick = async () => {
          const session = sessions.get(sessionId); if (!session) return;
          if (!session.ended && !confirm('Close this terminal and stop its running command?')) return;
          try { await host.terminal('close', { id: sessionId }); } catch (error) { fail(error); return; }
          session.term.dispose(); session.container.remove(); session.wrapper.remove(); sessions.delete(sessionId);
          if (active === sessionId) { active = null; const next = [...sessions.keys()].at(-1); if (next) select(next); else { status('No terminals open. Start a shell or Onboarder Chat.'); el('newShellTerminal').focus(); } }
        };
        wrapper.append(button, close); tabs.append(wrapper);
        const session: Session = { term, fit, container, button, wrapper, ended: false, dimensions: '' }; sessions.set(id, session);
        term.onData(data => { if (!session.ended) void host.terminal('write', { id: sessionId, data }).catch(fail); });
        status(); select(id);
      } catch (error) { if (id) await host.terminal('close', { id }).catch(() => {}); fail(error); }
      finally { creating = null; for (const id of ['newChatTerminal', 'newShellTerminal']) el<HTMLButtonElement>(id).disabled = false; }
    })();
    return creating;
  }
  host.subscribe(event => {
    const session = sessions.get(event.id);
    if (event.type === 'terminal-data') session?.term.write(event.data);
    if (event.type === 'terminal-exit' && session) { session.ended = true; session.button.dataset.ended = 'true'; session.term.write(`\r\n[Process exited: ${event.exitCode}. Open a new terminal to continue.]\r\n`); }
    if (event.type === 'backend-down') for (const session of sessions.values()) { session.ended = true; session.button.dataset.ended = 'true'; session.term.write('\r\n[Service stopped. Commands will not restart automatically.]\r\n'); }
  });
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Terminal sessions');
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !(event.target as Element).matches('[role=tab]')) return;
    event.preventDefault(); const ids = [...sessions.keys()], index = active ? ids.indexOf(active) : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    if (ids[next]) { select(ids[next]); sessions.get(ids[next])!.button.focus(); }
  });
  el('terminalClose').onclick = hide; el('newChatTerminal').onclick = () => { void create('chat'); }; el('newShellTerminal').onclick = () => { void create('shell'); }; el('terminalRetry').onclick = () => { void create(retryKind); };
  // Ctrl+` belongs to the native menu; a second renderer listener toggles twice.
  const resizer = el('terminalResizer');
  resizer.onpointerdown = event => {
    if (event.button !== 0) return; event.preventDefault(); resizer.setPointerCapture(event.pointerId);
    const initial = panel.getBoundingClientRect().height, y = event.clientY;
    const move = (e: PointerEvent) => { setHeight(initial + y - e.clientY); resize(); };
    const done = () => { resizer.removeEventListener('pointermove', move); resizer.removeEventListener('pointerup', done); resizer.removeEventListener('pointercancel', done); resizer.removeEventListener('lostpointercapture', done); try { localStorage.setItem(key(), String(panel.getBoundingClientRect().height)); } catch {} window.dispatchEvent(new Event('resize')); };
    resizer.addEventListener('pointermove', move); resizer.addEventListener('pointerup', done); resizer.addEventListener('pointercancel', done); resizer.addEventListener('lostpointercapture', done);
  };
  resizer.onkeydown = event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setHeight(panel.getBoundingClientRect().height + (event.key === 'ArrowUp' ? 20 : -20)); resize(); try { localStorage.setItem(key(), String(panel.getBoundingClientRect().height)); } catch {} window.dispatchEvent(new Event('resize')); } };
  new ResizeObserver(resize).observe(surface);
  window.addEventListener('resize', () => { if (!panel.hidden) setHeight(panel.getBoundingClientRect().height); resize(); });
  return { hide, async toggle() { if (!panel.hidden) hide(); else { show(); if (!sessions.size) await create('shell'); else if (active) select(active); } } };
}
