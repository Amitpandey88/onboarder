import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { text } from './policy.mjs';

const phases = [
  ['Enumerating objects', 'Finding objects', 0, 8], ['Counting objects', 'Counting objects', 8, 15],
  ['Compressing objects', 'Preparing download', 15, 25], ['Receiving objects', 'Downloading repository', 25, 80],
  ['Resolving deltas', 'Resolving changes', 80, 94], ['Updating files', 'Checking out files', 94, 99],
];
export function parseCloneProgress(line) {
  for (const [match, phase, start, end] of phases) {
    if (!line.includes(match)) continue;
    const percent = line.match(/(\d{1,3})%/);
    return { phase, percent: percent ? Math.round(start + Math.min(100, Number(percent[1])) / 100 * (end - start)) : null, detail: line.replace(/^remote:\s*/, '').trim().slice(0, 220) };
  }
  return null;
}

/** Fixed argv, private staging and progress from Git itself; no repository code runs. */
export async function cloneRepository({ url, destination, operationId = randomUUID() }, { emit = () => {}, jobs = new Set(), operations = new Map(), env = process.env, timeout = 180000 } = {}) {
  text(url); text(destination);
  if (!/^(https?:\/\/[^\s]+|git@[^\s:]+:[^\s]+|ssh:\/\/[^\s]+)$/.test(url)) throw new Error('Use a GitHub or Git repository URL.');
  if (/^https?:/.test(url)) { const parsed = new URL(url); if (parsed.username || parsed.password) throw new Error('Use a URL without credentials; Git uses your existing credential helper.'); }
  if (!path.isAbsolute(destination)) throw new Error('Choose an absolute destination.');
  if (await fs.lstat(destination).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('That destination already exists. Choose a new folder.');
  const staging = await fs.mkdtemp(path.join(path.dirname(destination), '.onboarder-clone-'));
  const checkout = path.join(staging, 'checkout');
  let cancelled = false, child;
  const stop = () => { cancelled = true; try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
  try {
    emit({ type: 'clone-progress', operationId, phase: 'Connecting to repository', percent: null, detail: 'Contacting Git and checking access…' });
    await new Promise((resolve, reject) => {
      child = spawn('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--progress', '--filter=blob:none', '--single-branch', '--', url, checkout], { detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', SSH_ASKPASS: '/usr/bin/false' } });
      jobs.add(child); operations.set(operationId, stop); emit({ type: 'activity', active: true });
      let remaining = '', highest = 0, timedOut = false;
      child.stderr.on('data', chunk => {
        remaining = (remaining + chunk.toString()).slice(-16384);
        const lines = remaining.split(/[\r\n]/); remaining = lines.pop() || '';
        for (const line of lines) { const progress = parseCloneProgress(line); if (progress) { if (progress.percent !== null) { highest = Math.max(highest, progress.percent); progress.percent = highest; } emit({ type: 'clone-progress', operationId, ...progress }); } }
      });
      const timer = setTimeout(() => { timedOut = true; cancel(); }, timeout);
      let forceTimer;
      const cancel = () => { stop(); forceTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1200); };
      operations.set(operationId, cancel);
      const done = () => { clearTimeout(timer); clearTimeout(forceTimer); jobs.delete(child); operations.delete(operationId); emit({ type: 'activity', active: jobs.size > 0 }); };
      child.once('error', () => { done(); reject(new Error('Git is unavailable. Install Git or Apple Command Line Tools, then retry.')); });
      child.once('close', code => { done(); code === 0 && !cancelled ? resolve() : reject(new Error(timedOut ? 'Cloning timed out. Check the connection and retry.' : cancelled ? 'Clone cancelled.' : 'Git could not clone this repository. Check the URL, connection and your Git access.')); });
    });
    emit({ type: 'clone-progress', operationId, phase: 'Saving checkout', percent: 99, detail: 'Finishing the local repository…' });
    // mkdir reserves the name without overwriting an existing checkout.
    await fs.mkdir(destination);
    for (const entry of await fs.readdir(checkout)) await fs.rename(path.join(checkout, entry), path.join(destination, entry));
    emit({ type: 'clone-progress', operationId, phase: 'Clone complete', percent: 100, detail: 'Opening your project…' });
    return { path: await fs.realpath(destination) };
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

/** Only app-created, receipt-bearing temporary project containers may be removed. */
export class TemporaryProjects {
  constructor(directory) { this.directory = path.resolve(directory); }
  async create(name = 'checkout') {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const checkoutName = String(name).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100).replace(/^\.+$/, '') || 'checkout';
    const id = randomUUID(), container = path.join(this.directory, 'project-' + id);
    await fs.mkdir(container, { mode: 0o700 });
    await fs.writeFile(path.join(container, '.owner.json'), JSON.stringify({ version: 1, id, checkoutName }), { mode: 0o600, flag: 'wx' });
    return path.join(container, checkoutName);
  }
  async remove(root) {
    const container = path.dirname(root), name = path.basename(container);
    if (path.dirname(container) !== path.resolve(this.directory) || !/^project-[a-f0-9-]{36}$/.test(name)) return false;
    try {
      if (!(await fs.lstat(container)).isDirectory() || (await fs.lstat(container)).isSymbolicLink()) return false;
      const marker = path.join(container, '.owner.json'); if ((await fs.lstat(marker)).isSymbolicLink()) return false;
      const receipt = JSON.parse(await fs.readFile(marker, 'utf8'));
      if (receipt.version !== 1 || 'project-' + receipt.id !== name || path.basename(root) !== (receipt.checkoutName || 'checkout')) return false;
      await fs.rm(container, { recursive: true, force: true }); return true;
    } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return false; throw error; }
  }
  async sweep() {
    for (const name of await fs.readdir(this.directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
      if (!/^project-[a-f0-9-]{36}$/.test(name)) continue;
      try {
        const container = path.join(this.directory, name); if ((await fs.lstat(container)).isSymbolicLink()) continue;
        const receipt = JSON.parse(await fs.readFile(path.join(container, '.owner.json'), 'utf8'));
        const checkoutName = receipt.checkoutName || 'checkout'; if (!/^[a-zA-Z0-9._-]{1,100}$/.test(checkoutName) || /^\.+$/.test(checkoutName)) continue;
        await this.remove(path.join(container, checkoutName));
      } catch (error) { if (error instanceof SyntaxError || error.code === 'ENOENT') continue; throw error; }
    }
  }
}
