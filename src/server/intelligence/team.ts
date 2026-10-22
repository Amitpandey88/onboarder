import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { evidenceText } from './workspace.js';

export interface TeamMember { id: string; name: string; role: 'viewer' | 'reviewer'; roots: string[]; tokenHash: string; enabled: boolean }
interface TeamFile { schemaVersion: 1; members: TeamMember[] }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const queues = new Map<string, Promise<unknown>>();
export class TeamDirectory {
  constructor(readonly file: string) {}
  async read(): Promise<TeamFile> {
    try {
      const stat = await fs.lstat(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256000) throw new Error('Invalid team directory.');
      const value = JSON.parse(await fs.readFile(this.file, 'utf8')) as TeamFile;
      if (value.schemaVersion !== 1 || !Array.isArray(value.members) || value.members.length > 100 ||
        value.members.some(m => !/^[a-f0-9-]{36}$/.test(m.id) || typeof m.name !== 'string' || m.name.length > 100 || !['viewer', 'reviewer'].includes(m.role) || !Array.isArray(m.roots) || m.roots.some(r => typeof r !== 'string' || !path.isAbsolute(r)) || !/^[a-f0-9]{64}$/.test(m.tokenHash) || typeof m.enabled !== 'boolean')) throw new Error('Invalid team schema.');
      return value;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, members: [] }; throw error; }
  }
  private async change(fn: (data: TeamFile) => void) {
    const previous = queues.get(this.file) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const data = await this.read(); fn(data);
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      if ((await fs.lstat(path.dirname(this.file))).isSymbolicLink()) throw new Error('Team directory cannot be a symbolic link.');
      const temporary = this.file + '.' + randomUUID();
      try { await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, this.file); }
      finally { await fs.unlink(temporary).catch(() => {}); }
    });
    queues.set(this.file, task);
    try { await task; } finally { if (queues.get(this.file) === task) queues.delete(this.file); }
  }
  async add(name: string, role: string, roots: string[]) {
    if (!name.trim() || name.length > 100 || !['viewer', 'reviewer'].includes(role) || !roots.length || roots.length > 20) throw new Error('Supply a name, viewer/reviewer role and one to twenty repository roots.');
    const canonical = await Promise.all(roots.map(r => fs.realpath(r)));
    const token = 'ob_member_' + randomBytes(32).toString('base64url');
    const member: TeamMember = { id: randomUUID(), name: evidenceText(name), role: role as TeamMember['role'], roots: canonical, tokenHash: digest(token), enabled: true };
    await this.change(data => { if (data.members.length >= 100) throw new Error('Member limit reached.'); data.members.push(member); });
    return { id: member.id, token, name: member.name, role: member.role, roots: member.roots };
  }
  async revoke(id: string) { await this.change(data => { const m = data.members.find(m => m.id === id); if (!m) throw new Error('Member not found.'); m.enabled = false; }); }
  async authenticate(token: string) {
    if (!/^ob_member_[\w-]{43}$/.test(token)) return null;
    const value = digest(token);
    return (await this.read()).members.find(m => m.enabled && equal(m.tokenHash, value)) || null;
  }
  async fromRequest(req: IncomingMessage, signingKey: string) {
    const bearer = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''))?.[1] || '';
    if (bearer.startsWith('ob_member_')) return this.authenticate(bearer);
    const cookie = /(?:^|;\s*)onboarder_member=([^;]+)/.exec(String(req.headers.cookie || ''))?.[1];
    if (!cookie || !signingKey) return null;
    const [id, expires, signature] = cookie.split('.');
    if (!id || !expires || !signature || !/^\d+$/.test(expires) || +expires <= Date.now() / 1000) return null;
    const member = (await this.read()).members.find(m => m.id === id && m.enabled);
    if (!member) return null;
    const expected = createHmac('sha256', signingKey).update(id + '.' + expires + '.' + member.tokenHash).digest('base64url');
    return equal(signature, expected) ? member : null;
  }
}
export function memberCookie(member: TeamMember, key: string, secure: boolean) {
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const signature = createHmac('sha256', key).update(member.id + '.' + expires + '.' + member.tokenHash).digest('base64url');
  return 'onboarder_member=' + member.id + '.' + expires + '.' + signature + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400' + (secure ? '; Secure' : '');
}
export async function authorizeMember(member: TeamMember, pathname: string, body: Record<string, unknown>, query: URLSearchParams, sessionRoot: (id: string) => string | undefined) {
  if (pathname.startsWith('/api/auth/')) return;
  const allowed = ['/api/health', '/api/scan', '/api/file', '/api/search', '/api/blame', '/api/diff/refs', '/api/review', '/api/intelligence', '/api/team/comments', '/api/team/me'];
  if (!allowed.includes(pathname)) throw new Error('This member cannot access server settings, AI credentials, execution, or installation controls.');
  if (pathname === '/api/review' && body.ai === true) throw new Error('Contextual AI review requires the repository owner; member access does not grant provider credentials or source transmission.');
  if (pathname === '/api/team/me' || pathname === '/api/health') return;
  let root: string | undefined;
  if (pathname === '/api/scan') {
    if (typeof body.path !== 'string' || body.gitUrl || body.demo) throw new Error('Team members can scan only explicitly granted local repositories.');
    root = await fs.realpath(body.path);
    body.path = root;
  } else {
    const id = body.scanId || query.get('scan');
    if (typeof id !== 'string') throw new Error('A repository scan is required.');
    root = sessionRoot(id);
    if (root) root = await fs.realpath(root);
  }
  if (!root || !member.roots.includes(root)) throw new Error('This repository is outside this member’s grants.');
  if (pathname === '/api/intelligence' && body.action === 'portfolio') {
    if (!Array.isArray(body.scanIds) || body.scanIds.length > 4) throw new Error('Invalid repository comparison.');
    for (const id of body.scanIds) {
      const target = typeof id === 'string' ? sessionRoot(id) : undefined;
      if (!target || !member.roots.includes(await fs.realpath(target))) throw new Error('A compared repository is outside this member’s grants.');
    }
  }
  if (pathname === '/api/team/comments' && body.text !== undefined && member.role !== 'reviewer') throw new Error('Posting comments requires the reviewer role.');
}
