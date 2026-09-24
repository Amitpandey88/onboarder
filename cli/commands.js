// The verbs of the `onboarder` command. `main.js` parses argv into flags and a
// command name; each function here is one command, taking `{ flags, out, err,
// io }` so the tests can drive them with strings instead of a terminal.
//
// Every command returns an exit code instead of calling process.exit — the
// bin wrapper is the only place that touches the process.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';

import {
  DEFAULT_SETTINGS, configPath, configExists, readSettings, writeSettings,
  publicSettings, serverUrls, maskAccessKey,
} from '../server/config.js';
import { startServer } from '../server/index.js';
import { pidIsAlive, readPidFile, removePidFile } from '../server/pidfile.js';
import { tunnelStatus, cloudflareCommand, tailscaleCommand, installHint, findOnPath } from '../server/tunnel.js';
import { caddyRun, caddyValidate, httpsReadiness, httpsStatus, writeCaddyfile } from '../server/https.js';
import { bold, cyan, dim, ok, warn, bad, kv, tick, cross, dash, welcomeBanner } from './ui.js';
import { buildSteps, unansweredSteps, defaultOf, applyFlags, answersToSettings, summaryLines } from './wizard.js';
import { runSteps, WizardCancelled } from './prompt.js';

// ---------------------------------------------------------------- setup ---

export async function runSetup({ flags = {}, out = console.log, err = console.error, version = '' } = {}) {
  const file = flags.config || configPath();
  const existed = await configExists(file);
  const current = existed ? await readSettings(file) : { ...DEFAULT_SETTINGS };

  // Non-interactive (or a piped stdout): flags are the answers, defaults fill
  // the rest, and the summary is printed instead of asked about.
  if (flags.nonInteractive || !process.stdout.isTTY) {
    const { settings } = applyFlags(current, flags);
    await writeSettings(settings, file);
    if (flags.json) {
      out(JSON.stringify({ configFile: file, created: !existed, settings: publicSettings(settings) }, null, 2));
    } else {
      out(tick + `Wrote ${file}`);
      printSummary(out, settings, { revealKey: Boolean(patchHasNewKey(flags)) });
    }
    await printTunnelFollowup(out, settings);
    if (flags.start) return runStart({ flags, out, err });
    return 0;
  }

  out(welcomeBanner(version, file));
  if (existed) out(dim('  A config already exists — answers start from what it says.\n'));

  // Flag answers go in first; the wizard only asks what is left.
  const seed = {};
  for (const id of ['name', 'email', 'mode', 'host', 'port', 'domain', 'https', 'autoOpen']) {
    if (flags[id] !== undefined) seed[id] = flags[id];
  }
  if (flags.provider !== undefined) seed.provider = flags.provider;
  if (flags.baseUrl !== undefined) seed.baseUrl = flags.baseUrl;
  if (flags.model !== undefined) seed.model = flags.model;

  let answers;
  try {
    answers = await runSteps(unansweredSteps(buildSteps(current), seed), seed);
  } catch (e) {
    if (e instanceof WizardCancelled) {
      err('\n  Setup cancelled — nothing was written.');
      return 130;
    }
    throw e;
  }

  let settings;
  try {
    settings = answersToSettings(current, answers);
  } catch (e) {
    err(bad('  Those answers do not make a valid config: ' + e.message));
    return 1;
  }

  out('');
  printSummary(out, settings, { revealKey: false });
  out('');
  const confirmed = await confirm(out, 'Write this config?');
  if (!confirmed) {
    err('  Not written.');
    return 1;
  }
  await writeSettings(settings, file);
  out(tick + 'Wrote ' + file);

  // The generated key exists exactly once in a readable form: right now.
  if (answers.keyChoice === 'generate' && settings.accessKey) {
    out('');
    out(warn('  Your access key — shown this once, store it somewhere safe:'));
    out('    ' + bold(settings.accessKey));
  }
  await printTunnelFollowup(out, settings);

  if (flags.start || await confirm(out, 'Start Onboarder now?', true)) {
    out('');
    return runStart({ flags, out, err });
  }
  out(dim(settings.https
    ? '  Later: `onboarder start` (starts Caddy automatically), or `onboarder https status`'
    : '  Later: `onboarder start`'));
  return 0;
}

function patchHasNewKey(flags) {
  return flags.accessKey === 'generate' || (flags.accessKey === undefined && flags.mode === 'self-hosted');
}

function printSummary(out, settings, { revealKey = false } = {}) {
  out(bold('  About to write:'));
  for (const [label, value] of summaryLines(settings, { revealKey })) out(kv(label, String(value)));
}

async function confirm(out, question, fallback = false) {
  const { default: readline } = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await rl.question(`  ${bold(question)} ${dim(fallback ? '(Y/n)' : '(y/N)')} `);
    const v = typed.trim().toLowerCase();
    return v ? v === 'y' || v === 'yes' : fallback;
  } finally {
    rl.close();
  }
}

async function printTunnelFollowup(out, settings) {
  const status = tunnelStatus(settings);
  for (const name of ['cloudflare', 'tailscale']) {
    const t = status[name];
    if (!t.enabled) continue;
    out('');
    if (t.installed) {
      out(`  ${name} — start the tunnel with:`);
      out('    ' + cyan(t.command));
      out(dim(`    or just: onboarder tunnel ${name}`));
    } else {
      out(warn(`  ${name} is enabled but its CLI is not installed.`));
      out(dim('    Install: ' + t.install));
    }
  }
}

// ---------------------------------------------------------------- start ---

export async function runStart({ flags = {}, out = console.log, err = console.error } = {}) {
  const file = flags.config || configPath();
  if (!await configExists(file)) {
    // No config yet: on a terminal the kind thing is to run setup first; in a
    // script the predictable thing is to boot the defaults (which are the
    // pre-settings behavior) and say so.
    if (process.stdout.isTTY && !flags.nonInteractive) {
      out(dim('  No settings yet — running setup first.'));
      return runSetup({ flags: { ...flags, start: true }, out, err });
    }
    out(dim(`  No config at ${file} — starting with defaults (local mode).`));
  }
  const recorded = readPidFile(file);
  if (recorded && pidIsAlive(recorded)) {
    err(`  Onboarder is already running (PID ${recorded}).`);
    err(dim('    Use `onboarder status`, `onboarder stop`, or `onboarder restart`.'));
    return 1;
  }
  if (recorded) removePidFile(file, recorded);

  const started = await startServer({ configFile: file, log: out });
  if (started.settings.https) {
    out('');
    const httpsCode = await runHttps('setup', { flags, out: flags.json ? () => {} : out, err });
    if (httpsCode !== 0) {
      await new Promise((resolve) => started.server.close(resolve));
      return httpsCode;
    }
  }
  if (flags.json) out(JSON.stringify({ host: started.host, port: started.port, url: serverUrls(started.settings).local }));
  // The listening server holds the event loop; resolve so callers/tests know
  // we are up, but leave the process running.
  return { ...started, code: 0 };
}

// ------------------------------------------------------------- lifecycle ---

export async function runStatus({ flags = {}, out = console.log } = {}) {
  const file = flags.config || configPath();
  const pid = readPidFile(file);
  let running = pid && pidIsAlive(pid);
  let settings = null;
  try { settings = await readSettings(file); } catch { /* defaults are still meaningful */ }
  const portBusy = settings ? !(await portIsFree(settings.host, settings.port)) : false;
  if (pid && !running) removePidFile(file, pid);
  const result = {
    running: Boolean(running || portBusy),
    pid: running ? pid : null,
    port: settings ? `${settings.host}:${settings.port}` : null,
    portBusy,
    managed: Boolean(running),
    configFile: file,
  };
  if (flags.json) {
    out(JSON.stringify(result, null, 2));
  } else {
    out('');
    out(bold('  Onboarder status'));
    if (running) out(`${tick}Running    PID ${pid}`);
    else if (portBusy) out(`${warn('!')}Port busy  ${result.port} (no Onboarder PID record)`);
    else out(`${dash}Stopped`);
    out(kv('Config', file));
    if (result.portBusy && !running) out(dim('    Inspect it with `ss -ltnp` or `lsof -i :' + settings.port + '` before stopping another process.'));
  }
  return 0;
}

function waitForExit(pid, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (!pidIsAlive(pid)) return resolve(true);
      if (Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(poll, 100);
    };
    poll();
  });
}

export async function runStop({ flags = {}, out = console.log, err = console.error } = {}) {
  const file = flags.config || configPath();
  const pid = readPidFile(file);
  if (!pid) {
    const settings = await readSettings(file);
    const portBusy = !(await portIsFree(settings.host, settings.port));
    if (flags.json) out(JSON.stringify({ stopped: false, reason: portBusy ? 'unmanaged busy port' : 'not running', port: `${settings.host}:${settings.port}` }, null, 2));
    else if (portBusy) {
      out(`${warn('!')}Port busy  ${settings.host}:${settings.port} — no Onboarder process record.`);
      out(dim('    Inspect it with `ss -ltnp` or `lsof -i :' + settings.port + '`; `onboarder stop` will not kill an unmanaged process.'));
    } else {
      out(`${dash}Not running.`);
    }
    return portBusy ? 1 : 0;
  }
  if (!pidIsAlive(pid)) {
    removePidFile(file, pid);
    if (flags.json) out(JSON.stringify({ stopped: true, pid, stale: true }, null, 2));
    else out(tick + `Removed stale process record for PID ${pid}.`);
    return 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  const stopped = await waitForExit(pid);
  if (!stopped && pidIsAlive(pid)) {
    err(`  PID ${pid} did not stop after SIGTERM.`);
    err(dim('    Check it with `ps -p ' + pid + ' -f`, then stop it only if it really is Onboarder.'));
    return 1;
  }
  removePidFile(file, pid);
  if (flags.json) out(JSON.stringify({ stopped: true, pid }, null, 2));
  else out(tick + `Stopped Onboarder (PID ${pid}).`);
  return 0;
}

export async function runRestart(options = {}) {
  const file = options.flags?.config || configPath();
  const pid = readPidFile(file);
  if (pid && pidIsAlive(pid)) {
    const stopped = await runStop(options);
    if (stopped !== 0) return stopped;
  } else if (pid) {
    removePidFile(file, pid);
  }
  return runStart(options);
}

// --------------------------------------------------------------- config ---

// Keys `config set` may touch — the same allow-list the HTTP API enforces, so
// neither surface can smuggle in a key the schema does not know.
const SETTABLE = {
  mode: (v) => { if (!['local', 'self-hosted'].includes(v)) throw new Error('mode must be "local" or "self-hosted".'); return v; },
  host: (v) => v,
  port: (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('port must be 1-65535.'); return n; },
  domain: (v) => v,
  https: (v) => ['true', 'yes', '1', 'on'].includes(String(v).toLowerCase()),
  autoOpen: (v) => ['true', 'yes', '1', 'on'].includes(String(v).toLowerCase()),
  'account.name': (v) => v,
  'account.email': (v) => v,
  'account.provider': (v) => v,
  'account.baseUrl': (v) => v,
  'account.model': (v) => v,
  'tunnel.cloudflare': (v) => ['true', 'yes', '1', 'on'].includes(String(v).toLowerCase()),
  'tunnel.tailscale': (v) => ['true', 'yes', '1', 'on'].includes(String(v).toLowerCase()),
};

function dig(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function bury(obj, dotted, value) {
  const keys = dotted.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {};
  o[keys.at(-1)] = value;
}


export async function runConfig(sub, args, { flags = {}, out = console.log } = {}) {
  const file = flags.config || configPath();
  switch (sub) {
    case 'path':
      out(file);
      return 0;
    case 'show': {
      const settings = await readSettings(file);
      if (flags.json) {
        const pub = publicSettings(settings);
        if (flags.reveal) pub.accessKey = settings.accessKey || null;
        out(JSON.stringify({ configFile: file, ...pub }, null, 2));
        return 0;
      }
      const urls = serverUrls(settings);
      out(bold('  ' + file));
      out(kv('Mode', settings.mode));
      out(kv('Bind', `${settings.host}:${settings.port}`));
      if (settings.domain) out(kv('Domain', settings.domain));
      out(kv('HTTPS', settings.https ? `enabled — ${urls.domain}` : settings.domain ? 'disabled (plain HTTP)' : 'no domain configured'));
      out(kv('Local', urls.local));
      if (urls.network) out(kv('Network', urls.network));
      if (urls.domain) out(kv('Public', urls.domain));
      if (settings.mode === 'self-hosted') {
        out(kv('Access key', flags.reveal ? (settings.accessKey || '(none)') : maskAccessKey(settings.accessKey)));
        if (!flags.reveal) out(dim('    `onboarder config show --reveal` prints it — you are on this machine, after all.'));
      }
      const who = [settings.account.name, settings.account.email].filter(Boolean).join(' · ');
      if (who) out(kv('Profile', who));
      if (settings.account.baseUrl) {
        out(kv('AI', `${settings.account.provider} — ${settings.account.baseUrl}${settings.account.model ? ' — ' + settings.account.model : ''}`));
      }
      const status = tunnelStatus(settings);
      for (const name of ['cloudflare', 'tailscale']) {
        if (status[name].enabled) {
          out(kv(name, status[name].installed ? status[name].command : 'enabled, CLI missing — ' + status[name].install));
        }
      }
      out(kv('Auto-open', settings.autoOpen ? 'yes' : 'no'));
      return 0;
    }
    case 'get': {
      const [key] = args;
      if (!key || (!(key in SETTABLE) && key !== 'accessKey')) throw new Error('Unknown key. Known: ' + [...Object.keys(SETTABLE), 'accessKey'].join(', '));
      const settings = await readSettings(file);
      const value = key === 'accessKey' ? maskAccessKey(settings.accessKey) : dig(settings, key);
      out(String(value ?? ''));
      return 0;
    }
    case 'set': {
      const [key, ...rest] = args;
      const raw = rest.join(' ');
      if (!key || !(key in SETTABLE)) throw new Error('Unknown or unsettable key "' + key + '". Known: ' + Object.keys(SETTABLE).join(', ') + '\nThe access key is managed by `onboarder config key …`.');
      if (!raw) throw new Error('Missing value: onboarder config set ' + key + ' <value>');
      const value = SETTABLE[key](raw);
      const current = await readSettings(file);
      const next = { ...current, account: { ...current.account }, tunnel: { ...current.tunnel } };
      bury(next, key, value);
      await writeSettings(next, file); // normalizeSettings validates the result
      out(tick + key + ' = ' + (typeof value === 'boolean' ? String(value) : value));
      if (['host', 'port'].includes(key)) out(dim('    Restart the server for this to take effect.'));
      return 0;
    }
    default:
      throw new Error('Usage: onboarder config <show|get|set|path|reset|key>');
  }
}


// Config surgery that did not fit in `set`: full reset, and the access key,
// which gets its own verb because it is the one value that is shown once and
// never round-trips through an API.
export async function runConfigKey(action, args, { flags = {}, out = console.log, err = console.error } = {}) {
  const file = flags.config || configPath();
  const current = await readSettings(file);
  if (action === 'rotate') {
    const { generateAccessKey } = await import('../server/config.js');
    const key = generateAccessKey();
    await writeSettings({ ...current, accessKey: key }, file);
    out(tick + 'Rotated. The old key is dead this second — settings are re-read per request.');
    out('    ' + bold(key));
    out(dim('    Shown once. Distribute it to your devices.'));
    return 0;
  }
  if (action === 'show') {
    out(current.accessKey || '(no key set)');
    return 0;
  }
  if (action === 'set') {
    const value = args.join(' ').trim();
    if (value.length < 16) throw new Error('Access keys are at least 16 characters.');
    await writeSettings({ ...current, accessKey: value }, file);
    out(tick + 'Access key updated.');
    return 0;
  }
  throw new Error('Usage: onboarder config key <rotate|show|set <value>>');
}

export async function runConfigReset({ flags = {}, out = console.log, err = console.error } = {}) {
  const file = flags.config || configPath();
  if (!flags.yes) {
    err('  This rewrites ' + file + ' with factory defaults (local mode, port 4310, no key).');
    err('  Re-run with --yes to confirm.');
    return 1;
  }
  await writeSettings({ ...DEFAULT_SETTINGS }, file);
  out(tick + 'Reset to defaults: ' + file);
  return 0;
}


// --------------------------------------------------------------- doctor ---

// Diagnose without mutating. Every check reports { id, ok, required, detail }
// and the command exits non-zero if any *required* check failed — the same
// shape `doctor --json` hands to scripts.
export async function runDoctor({ flags = {}, out = console.log } = {}) {
  const file = flags.config || configPath();
  const checks = [];

  checks.push({
    id: 'node', ok: Number(process.versions.node.split('.')[0]) >= 20, required: true,
    detail: `v${process.versions.node} (needs ≥ 20)`,
  });

  let settings = null;
  try {
    settings = await readSettings(file);
    checks.push({ id: 'config', ok: true, required: true, detail: file });
  } catch (e) {
    checks.push({ id: 'config', ok: false, required: true, detail: `${file} — ${e.message}` });
  }

  const dir = file.slice(0, file.lastIndexOf('/'));
  let dirOk = true;
  try { await fsp.access(dir, fs.constants.W_OK); } catch { dirOk = false; }
  checks.push({ id: 'config-dir', ok: dirOk, required: true, detail: dirOk ? dir + ' is writable' : dir + ' is NOT writable' });

  if (settings) {
    const free = await portIsFree(settings.host, settings.port);
    checks.push({
      id: 'port', ok: free, required: false,
      detail: free ? `${settings.host}:${settings.port} is free` : `${settings.host}:${settings.port} is already in use (running already?)`,
    });
    if (settings.mode === 'self-hosted') {
      checks.push({
        id: 'access-key', ok: Boolean(settings.accessKey), required: true,
        detail: settings.accessKey ? 'set — ' + maskAccessKey(settings.accessKey) : 'MISSING — the API refuses every call until one is set',
      });
      const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(settings.host);
      checks.push({
        id: 'domain', ok: true, required: false,
        detail: settings.domain || (loopback ? '(none — a tunnel or local reverse proxy provides the name)' : '(none — visitors can connect by server IP)'),
      });
      if (settings.https) {
        const readiness = await httpsReadiness(settings, { configFile: file });
        for (const check of readiness.checks.slice(1).filter((item) => item.id !== 'caddy')) {
          checks.push({ ...check, required: check.id !== 'dns-target' });
        }
      }
    }
  }

  for (const name of ['git', 'cloudflared', 'tailscale', 'caddy']) {
    const wanted = name === 'git'
      || (name === 'caddy' && settings?.https)
      || (settings && settings.tunnel?.[name === 'cloudflared' ? 'cloudflare' : 'tailscale']);
    const found = Boolean(findOnPath(name));
    checks.push({
      id: name,
      ok: found || !wanted,
      required: name === 'git' || (name === 'caddy' && settings?.https),
      detail: found ? 'installed' : wanted ? 'not installed — ' + installHint(name) : 'not installed (not needed for your settings)',
    });
  }

  if (flags.json) {
    out(JSON.stringify({ ok: checks.every((c) => c.ok || !c.required), checks }, null, 2));
  } else {
    out('');
    out(bold('  Onboarder doctor'));
    for (const c of checks) {
      const mark = c.ok ? tick : c.required ? cross : dash;
      out(`${mark}${c.id} — ${c.detail}`);
    }
    out('');
  }
  return checks.every((c) => c.ok || !c.required) ? 0 : 1;
}

function portIsFree(host, port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

// ------------------------------------------------------------------ https ---

export async function runHttps(action = 'status', { flags = {}, out = console.log, err = console.error } = {}) {
  const file = flags.config || configPath();
  const settings = await readSettings(file);
  const status = httpsStatus(settings, file);
  if (action === 'status') {
    if (flags.json) out(JSON.stringify(status, null, 2));
    else {
      out('');
      out(bold('  Onboarder HTTPS'));
      out(kv('Enabled', status.enabled ? 'yes' : 'no'));
      out(kv('Domain', status.domain || '(not configured)'));
      out(kv('URL', status.url || '(none)'));
      out(kv('Caddy', status.caddyInstalled ? status.caddyVersion : 'not installed'));
      out(kv('Caddyfile', status.caddyfile));
      if (status.enabled) out(dim('    `onboarder https check` verifies DNS and ports before issuance.'));
      out('');
    }
    return status.enabled ? 0 : 1;
  }
  if (action === 'check') {
    const readiness = await httpsReadiness(settings, { configFile: file });
    if (flags.json) out(JSON.stringify(readiness, null, 2));
    else {
      out('');
      out(bold('  HTTPS readiness'));
      for (const check of readiness.checks) out(`${check.ok ? tick : check.required ? cross : dash}${check.id} — ${check.detail}`);
      if (!readiness.ok) {
        out('');
        out(warn('  Fix the required items, then run `onboarder https setup` again.'));
        out(dim('    DNS: point an A/AAAA record to this VPS. Firewall: allow inbound 80 and 443.'));
      }
      out('');
    }
    return readiness.ok ? 0 : 1;
  }
  if (action === 'setup' || action === 'start') {
    const readiness = await httpsReadiness(settings, { configFile: file });
    if (!readiness.ok) {
      err(bad('  HTTPS setup is not ready:'));
      for (const check of readiness.checks.filter((item) => item.required && !item.ok)) err(cross + check.id + ' — ' + check.detail);
      err('    Point DNS at this VPS, allow inbound TCP 80/443, install Caddy, then retry.');
      return 1;
    }
    const caddyfile = await writeCaddyfile(settings, file);
    out(dim('  Caddyfile: ' + caddyfile));
    await caddyValidate(settings, file);

    // Ubuntu's package usually leaves Caddy running as a service. Reload first
    // so repeat setup is idempotent and does not mistake Caddy for a foreign
    // listener. Reload talks only to Caddy's local admin endpoint and never
    // stops an unknown process.
    let result;
    let reloaded = false;
    try {
      result = caddyRun(settings, file, 'reload');
      reloaded = true;
    } catch {
      try {
        result = caddyRun(settings, file, 'start');
      } catch (error) {
        err(bad('  Caddy could not start: ' + (error.message || error)));
        if (process.platform !== 'win32') {
          err('    On Ubuntu, start the packaged service once:');
          err('      sudo systemctl enable --now caddy');
          err('    Then run `onboarder https setup` again.');
        }
        return 1;
      }
    }
    out(tick + (reloaded ? 'Caddy reloaded. It is using' : 'Caddy started. It is using') + ' https://' + settings.domain + '.');
    out('    Public URL  https://' + settings.domain);
    out(dim('    Upstream     http://127.0.0.1:' + settings.port));
    if (result.output) out(dim('    ' + result.output.split('\n').slice(-3).join('\n    ')));
    return 0;
  }
  if (action === 'stop') {
    if (!status.caddyInstalled) { err('  Caddy is not installed.'); return 1; }
    caddyRun(settings, file, 'stop');
    out(tick + 'Caddy stopped. The Onboarder HTTP server is unchanged.');
    return 0;
  }
  throw new Error('Usage: onboarder https <check|setup|start|stop|status>');
}

// --------------------------------------------------------------- tunnel ---

export async function runTunnel(kind, { flags = {}, out = console.log, err = console.error } = {}) {
  const settings = await readSettings(flags.config || configPath());
  const target = `http://127.0.0.1:${settings.port}`;
  if (kind === 'tailscale') {
    if (!findOnPath('tailscale')) {
      err('  tailscale is not installed — ' + installHint('tailscale'));
      return 1;
    }
    const cmd = tailscaleCommand(settings);
    out('  ' + cmd);
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(cmd, { shell: true, stdio: 'inherit' });
    if (r.status === 0) {
      out(tick + 'Tailscale is serving ' + target + ' over your tailnet (https://<machine>.<tailnet>.ts.net).');
      out(dim('    `tailscale serve status` to verify, `onboarder doctor` to re-check.'));
    }
    return r.status ?? 1;
  }
  if (kind === 'cloudflare') {
    if (!findOnPath('cloudflared')) {
      err('  cloudflared is not installed — ' + installHint('cloudflared'));
      return 1;
    }
    const cmd = cloudflareCommand(settings);
    out(dim('  $ ' + cmd));
    out(dim('  Ctrl-C stops the tunnel; the server keeps running.\n'));
    // Quick tunnels print their random name on stderr; surface just that line
    // plus everything when --verbose, so the default output is one useful URL.
    const child = spawn('cloudflared', ['tunnel', '--url', target], { stdio: ['ignore', 'pipe', 'pipe'] });
    let announced = false;
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !announced) {
        announced = true;
        out(tick + 'Public URL: ' + bold(m[0]));
        out(dim('    Anyone with the URL still needs the access key: ' + m[0]));
      }
      if (flags.verbose) process.stderr.write(text);
    });
    child.stdout.on('data', (d) => { if (flags.verbose) process.stdout.write(d); });
    const stop = () => child.kill('SIGINT');
    process.once('SIGINT', stop);
    return new Promise((resolve) => {
      child.on('close', (code) => {
        process.removeListener('SIGINT', stop);
        if (!announced && code !== 0) err('  cloudflared exited without printing a URL — re-run with --verbose to see why.');
        resolve(code ?? 0);
      });
    });
  }
  throw new Error('Usage: onboarder tunnel <cloudflare|tailscale>');
}
