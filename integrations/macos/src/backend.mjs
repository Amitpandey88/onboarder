import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { validToken, terminalInput } from './policy.mjs';
import { cloneRepository } from './clones.mjs';

const terminals = new Map(), jobs = new Set(), cloneOperations = new Map();
let server, mcp, stopping = false, sweep = () => {}, resources, projectRoot;
const emit = event => { if (process.connected) process.send(event); };
function killGroup(child, signal = 'SIGTERM') { try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} } }
async function shutdown() {
  if (stopping) return; stopping = true;
  const owned = [...terminals.values()].filter(entry => !entry.ended).map(entry => entry.pty).concat([...jobs]);
  for (const child of owned) killGroup(child);
  await Promise.race([Promise.all([mcp?.stop().catch(() => {}), new Promise(resolve => setTimeout(resolve, 600))]), new Promise(resolve => setTimeout(resolve, 1200))]);
  for (const child of owned) killGroup(child, 'SIGKILL');
  sweep(); server?.close(); process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown); process.on('disconnect', shutdown);

process.on('message', async message => {
  try {
    if (message.type === 'init' && !server) {
      resources = message.resources; projectRoot = message.root;
      const core = path.join(resources, 'core');
      const load = file => import(pathToFileURL(path.join(core, file)).href);
      const [{ createRouter }, { createMcpRunner }, { sweepClonesSync }, { DEFAULT_SETTINGS }] = await Promise.all([load('server/router.js'), load('server/mcp/runner.js'), load('server/sessions.js'), load('server/config.js')]);
      sweep = sweepClonesSync;
      mcp = createMcpRunner();
      const router = createRouter({ projectRoot: core, publicDir: path.join(core, 'public'), sharedDir: path.join(core, 'shared'), mcp, getSettings: async () => DEFAULT_SETTINGS });
      let activeRequests = 0;
      server = http.createServer((req, res) => {
        if (!validToken(req.headers['x-onboarder-desktop-token'], message.token)) { res.writeHead(403); res.end('Desktop session required.'); return; }
        if (req.method !== 'GET') { activeRequests++; emit({ type: 'activity', active: true }); let done = false; const finish = () => { if (!done) { done = true; activeRequests--; emit({ type: 'activity', active: activeRequests > 0 || jobs.size > 0 }); } }; res.once('close', finish); res.once('finish', finish); }
        // This private instance never changes daemon/network settings or receives webhooks.
        if (/^\/api\/(?:settings|github\/webhook|auth\/login)/.test(req.url) && req.method !== 'GET') { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Manage the standalone web server from the CLI or browser, separately from this app.' })); return; }
        router(req, res);
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      emit({ type: 'ready', port: server.address().port }); return;
    }
    if (message.type !== 'request' || !resources) return;
    let result;
    if (message.action === 'terminal') result = await terminal(message.input.action, message.input.input);
    else if (message.action === 'clone') result = await cloneRepository(message.input, { emit, jobs, operations: cloneOperations });
    else if (message.action === 'clone-cancel') { cloneOperations.get(message.input.operationId)?.(); result = {}; }
    else throw new Error('Unknown operation.');
    emit({ requestId: message.requestId, result });
  } catch (error) { emit(message.requestId ? { requestId: message.requestId, error: error.message } : { type: 'fatal', error: 'The project service could not initialize.' }); }
});

async function terminal(action, input) {
  terminalInput(action, input);
  if (action === 'create') {
    if (!projectRoot) throw new Error('Open a repository before starting a terminal.');
    if (terminals.size >= 8) throw new Error('Close a terminal before opening another (eight per project).');
    const pty = createRequire(import.meta.url)('node-pty');
    const node = path.join(resources, 'node/bin/node');
    const shell = process.env.SHELL && path.isAbsolute(process.env.SHELL) ? process.env.SHELL : '/bin/zsh';
    const command = input.kind === 'chat' ? node : shell;
    const args = input.kind === 'chat' ? [path.join(resources, 'core/bin/onboarder.js'), 'chat', projectRoot] : ['-l'];
    const id = randomUUID();
    const child = pty.spawn(command, args, { name: 'xterm-256color', cols: input.cols, rows: input.rows, cwd: projectRoot, env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } });
    const entry = { pty: child, queued: '', scheduled: false, ready: false }; terminals.set(id, entry);
    // Batch output and cap each queue so a noisy child cannot exhaust the app.
    child.onData(data => {
      entry.queued = (entry.queued + data).slice(-262144);
      if (entry.ready && !entry.scheduled) { entry.scheduled = true; setTimeout(() => { entry.scheduled = false; emit({ type: 'terminal-data', id, data: entry.queued }); entry.queued = ''; }, 16); }
    });
    child.onExit(({ exitCode }) => { entry.ended = true; entry.exitCode = exitCode; if (entry.ready) { if (entry.queued) { emit({ type: 'terminal-data', id, data: entry.queued }); entry.queued = ''; } terminals.delete(id); emit({ type: 'terminal-exit', id, exitCode }); } });
    return { id };
  }
  const entry = terminals.get(input.id);
  if (!entry) { if (action === 'close') return {}; throw new Error('This terminal has ended. Open a new tab to continue.'); }
  if (action === 'write') { if (entry.ended) throw new Error('This terminal has ended. Open a new tab to continue.'); entry.pty.write(input.data); }
  if (action === 'resize') { if (!entry.ended) entry.pty.resize(input.cols, input.rows); if (!entry.ready) { entry.ready = true; if (entry.queued) { emit({ type: 'terminal-data', id: input.id, data: entry.queued }); entry.queued = ''; } if (entry.ended) { terminals.delete(input.id); emit({ type: 'terminal-exit', id: input.id, exitCode: entry.exitCode }); } } }
  if (action === 'close') { if (!entry.ended) killGroup(entry.pty, 'SIGKILL'); terminals.delete(input.id); }
  return {};
}

