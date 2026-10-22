import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { agentHome } from '../cli/agent/config.js';

export function fixId(id: string) { if (typeof id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(id)) throw new Error('Use a complete proposal or run ID.'); return id; }
export class FixStore {
  directory: string;
  constructor(public home = agentHome()) { this.home = path.resolve(home); this.directory = path.join(this.home, 'fixes'); }
  private async directoryReady() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const folder of [this.home, this.directory]) { const stat = await fs.lstat(folder); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Fix storage cannot use symbolic links.'); }
    for (const name of ['runs', 'workspaces']) { const stat = await fs.lstat(path.join(this.home, name)).catch(() => null); if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error('Fix runtime storage cannot use symbolic links.'); }
    // Resolve platform aliases such as macOS /var -> /private/var before binding worktree identities.
    this.home = await fs.realpath(this.home); this.directory = path.join(this.home, 'fixes');
  }
  private async key() {
    await this.directoryReady(); const file = path.join(this.directory, 'signing-key');
    try { await fs.writeFile(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try { const st = await handle.stat(); if (!st.isFile() || st.size !== 32) throw new Error('Invalid fix storage key.'); return await handle.readFile(); } finally { await handle.close(); }
  }
  async write(kind: 'proposal' | 'run', id: string, value: unknown) {
    const mac = createHmac('sha256', await this.key()).update(JSON.stringify(value)).digest('hex');
    const target = path.join(this.directory, kind + '-' + fixId(id) + '.json'), temp = target + '.' + randomUUID();
    const body = JSON.stringify({ value, mac }); if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('Fix artifact exceeds 8 MB.');
    try { await fs.writeFile(temp, body, { flag: 'wx', mode: 0o600 }); await fs.rename(temp, target); } finally { await fs.unlink(temp).catch(() => {}); }
  }
  async read<T>(kind: 'proposal' | 'run', id: string): Promise<T> {
    const key = await this.key(), file = path.join(this.directory, kind + '-' + fixId(id) + '.json');
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const st = await handle.stat(); if (!st.isFile() || st.size > 8 * 1024 * 1024) throw new Error('Invalid fix artifact.');
      const data = JSON.parse(await handle.readFile('utf8'));
      const mac = createHmac('sha256', key).update(JSON.stringify(data.value)).digest();
      if (typeof data.mac !== 'string' || !/^[a-f0-9]{64}$/.test(data.mac) || !timingSafeEqual(mac, Buffer.from(data.mac, 'hex'))) throw new Error('Fix artifact was altered; authorization is invalid.');
      return data.value as T;
    } finally { await handle.close(); }
  }
  async lock<T>(id: string, action: () => Promise<T>): Promise<T> {
    await this.directoryReady(); const file = path.join(this.directory, fixId(id) + '.lock');
    let handle;
    try { handle = await fs.open(file, 'wx', 0o600); }
    catch { throw new Error('This fix has another operation in progress. After a process crash, inspect its saved run before removing the private .lock file.'); }
    try { await handle.writeFile(String(process.pid)); return await action(); }
    finally { await handle.close(); await fs.unlink(file).catch(() => {}); }
  }
}
