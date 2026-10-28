import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { endpointId, text } from './policy.mjs';

export class DesktopStore {
  constructor(directory, encryption) { this.directory = directory; this.encryption = encryption; this.queue = Promise.resolve(); }
  async read(name) { try { return JSON.parse(await fs.readFile(path.join(this.directory, name + '.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; } }
  update(name, transform) {
    const operation = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const next = await transform(await this.read(name));
      const target = path.join(this.directory, name + '.json'), temporary = target + '-' + randomUUID();
      try { await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, target); }
      finally { await fs.rm(temporary, { force: true }); }
      return next;
    });
    this.queue = operation; return operation;
  }
  async recents() { const saved = (await this.read('projects')).recents; return Array.isArray(saved) ? saved.filter(r => typeof r.path === 'string' && typeof r.name === 'string' && Number.isFinite(r.openedAt)).slice(0, 12) : []; }
  async remember(root) { await this.update('projects', value => ({ ...value, recents: [{ path: root, name: path.basename(root), openedAt: Date.now() }, ...(value.recents || []).filter(r => r.path !== root)].slice(0, 12) })); }
  async clearRecents() { await this.update('projects', value => ({ ...value, recents: [] })); }
  async credential(action, endpoint, secret) {
    if (!endpoint && ['get', 'delete'].includes(action)) return null;
    const id = createHash('sha256').update(endpointId(endpoint)).digest('hex');
    if (action === 'get') {
      const stored = (await this.read('credentials'))[id];
      if (!stored) return null;
      if (!await this.encryption.isAsyncEncryptionAvailable()) throw new Error('Unlock your Mac Keychain to use the saved key.');
      return this.encryption.decryptStringAsync(Buffer.from(stored, 'base64'));
    }
    if (action === 'delete') { await this.update('credentials', value => { delete value[id]; return value; }); return null; }
    if (action !== 'set') throw new Error('Unknown credential action.');
    text(secret, 16384);
    if (!secret) throw new Error('Enter a key before remembering it.');
    if (!await this.encryption.isAsyncEncryptionAvailable()) throw new Error('Keychain storage is unavailable. Leave Remember unchecked to use a key for this session.');
    const encrypted = await this.encryption.encryptStringAsync(secret);
    await this.update('credentials', value => ({ ...value, [id]: encrypted.toString('base64') })); return null;
  }
}
