// The Server drawer: the web face of the same config file the CLI wizard
// writes. Reads come back with the key masked; saves send only the changed
// keys; rotation reveals the new key once and stores it in this browser.
//
// The module owns its own DOM and its own round-trips. What it borrows from
// app.js is the drawer choreography — one scrim at a time, Escape to close —
// which is why it returns open/close/isOpen instead of wiring the topbar
// button itself.

import { getAccessKey, setAccessKey, fetchServerSettings, updateServerSettings, rotateServerAccessKey } from '/js/api.js';

// A function declaration, not a const arrow: the import-time DOM check in
// tests/frontend.test.js blanks top-level function bodies but reads const
// bodies, and this module must stay importable from Node.
function $(id) {
  return document.getElementById(id);
}

const MODE_NOTES = {
  local: 'Local mode answers only this machine. No key, no network — the safe default.',
  'self-hosted': 'Self-hosted answers whoever can reach the port, so every API call needs the access key below.',
};

export function createServerDrawer(options = {}) {
  // Pulled out of the parameter list on purpose: the front-end static check
  // in tests/frontend.test.js only understands plain params, and `toast` must
  // show up as a declaration, not a dangling call.
  const toast = typeof options.toast === 'function' ? options.toast : () => {};
  const dom = {};
  [
    'serverDrawer', 'serverScrim', 'serverClose', 'serverModeNote', 'srvMode', 'srvHost', 'srvPort',
    'srvDomain', 'srvDomainField', 'srvAutoOpen', 'srvKeySection', 'srvKeyMasked', 'srvRotate',
    'srvFreshKeyRow', 'srvFreshKey', 'srvCopyKey', 'srvKeyHint', 'srvName', 'srvEmail',
    'srvTunnelCloudflare', 'srvTunnelCloudflareStatus', 'srvTunnelTailscale', 'srvTunnelTailscaleStatus',
    'srvSave', 'srvStatus', 'srvConfigPath',
  ].forEach((id) => (dom[id] = $(id)));

  let current = null; // the last settings body the server sent

  function status(text, cls = '') {
    dom.srvStatus.className = 'drawer-status' + (cls ? ' ' + cls : '');
    dom.srvStatus.textContent = text;
  }

  function tunnelLine(el, t) {
    if (!t) { el.textContent = ''; return; }
    if (!t.enabled) {
      el.textContent = t.installed ? 'Off.' : `Off — and ${t.install || 'the binary is not installed'}.`;
      return;
    }
    el.textContent = t.installed
      ? `On. Start it with: ${t.command}`
      : `On, but the binary is missing — ${t.install || 'install it first'}.`;
  }

  function render(data) {
    current = data;
    const s = data.settings;
    dom.srvMode.value = s.mode;
    dom.serverModeNote.textContent = MODE_NOTES[s.mode] || '';
    dom.srvHost.value = s.host;
    dom.srvPort.value = s.port;
    dom.srvDomain.value = s.domain || '';
    dom.srvAutoOpen.checked = Boolean(s.autoOpen);
    dom.srvName.value = s.account?.name || '';
    dom.srvEmail.value = s.account?.email || '';
    dom.srvTunnelCloudflare.checked = Boolean(s.tunnel?.cloudflare);
    dom.srvTunnelTailscale.checked = Boolean(s.tunnel?.tailscale);
    tunnelLine(dom.srvTunnelCloudflareStatus, data.tunnels?.cloudflare);
    tunnelLine(dom.srvTunnelTailscaleStatus, data.tunnels?.tailscale);
    dom.srvConfigPath.textContent = `Config file: ${data.configFile}`;
    dom.srvKeyMasked.value = s.accessKeyMasked || (s.hasAccessKey ? '' : '(none set — the API refuses every call)');
    dom.srvKeyHint.textContent = getAccessKey()
      ? 'This browser holds a key and sends it with every request.'
      : 'This browser has no key saved. Paste one via rotate, or open the link from the startup banner.';
    applyModeVisibility();
  }

  // Mode drives which rows even make sense: local wipes the network/security
  // fields in the schema, so asking for them here would be collecting lies.
  function applyModeVisibility() {
    const remote = dom.srvMode.value === 'self-hosted';
    dom.srvKeySection.hidden = !remote;
    dom.srvDomainField.hidden = !remote;
    dom.serverModeNote.textContent = MODE_NOTES[dom.srvMode.value] || '';
  }

  async function open() {
    dom.serverDrawer.hidden = false;
    dom.serverScrim.hidden = false;
    dom.srvFreshKeyRow.hidden = true;
    status('Reading the server…');
    try {
      render(await fetchServerSettings());
      status('');
    } catch (err) {
      status(err.message, 'err');
    }
  }

  function close() {
    dom.serverDrawer.hidden = true;
    dom.serverScrim.hidden = true;
  }


  async function save() {
    const patch = {
      mode: dom.srvMode.value,
      host: dom.srvHost.value.trim() || '127.0.0.1',
      port: Number(dom.srvPort.value),
      autoOpen: dom.srvAutoOpen.checked,
      account: { name: dom.srvName.value.trim(), email: dom.srvEmail.value.trim() },
      tunnel: { cloudflare: dom.srvTunnelCloudflare.checked, tailscale: dom.srvTunnelTailscale.checked },
    };
    if (patch.mode === 'self-hosted') patch.domain = dom.srvDomain.value.trim();
    status('Saving…');
    try {
      const data = await updateServerSettings(patch);
      render({ ...current, settings: data.settings });
      const restart = (data.restartRequired || []).join(' and ');
      status(
        restart
          ? `Saved. The ${restart} change takes effect after a restart — the running socket cannot move.`
          : 'Saved — live already.',
        'ok',
      );
    } catch (err) {
      status(err.message, 'err');
    }
  }

  async function rotate() {
    status('Rotating…');
    try {
      const data = await rotateServerAccessKey();
      // The one moment a key is ever shown. It goes straight into this
      // browser's localStorage too, so this tab keeps working without a paste.
      setAccessKey(data.accessKey);
      render({ ...current, settings: data.settings });
      dom.srvFreshKey.value = data.accessKey;
      dom.srvFreshKeyRow.hidden = false; // render() does not know about the reveal
      status('Rotated. The old key is dead; update every other device.', 'ok');
    } catch (err) {
      status(err.message, 'err');
    }
  }

  dom.srvMode.addEventListener('change', applyModeVisibility);
  dom.srvSave.addEventListener('click', save);
  dom.srvRotate.addEventListener('click', rotate);
  dom.serverClose.addEventListener('click', close);
  dom.serverScrim.addEventListener('click', close);
  dom.srvCopyKey.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(dom.srvFreshKey.value);
      toast('Key copied');
    } catch {
      dom.srvFreshKey.select(); // clipboard refused — select so a Ctrl+C works
    }
  });

  return {
    open,
    close,
    isOpen: () => !dom.serverDrawer.hidden,
  };
}
