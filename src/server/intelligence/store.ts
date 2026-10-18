import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Snapshot, WorkspaceState } from '../../shared/intelligence/contracts.js';
import { hash, evidenceText } from './workspace.js';
import { safeRelative } from '../../cli/agent/files.js';

export const emptyWorkspaceState = (): WorkspaceState => ({ schemaVersion: 1, notes: {}, completed: [], bookmarks: [], questions: [], findings: {} });
const home = () => process.env.ONBOARDER_INTELLIGENCE_HOME || path.join(os.homedir(), '.config', 'onboarder', 'intelligence');
const safeKey = (key: string) => key.length > 0 && key.length <= 500 && !['__proto__', 'constructor', 'prototype'].includes(key) && !/[\x00-\x1f]/.test(key);
export function validateWorkspaceState(value: unknown): WorkspaceState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a workspace state object.');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || Object.keys(v).some(k => !['schemaVersion', 'notes', 'completed', 'bookmarks', 'questions', 'findings', 'view', 'activeTopic'].includes(k))) throw new Error('Unsupported workspace state.');
  if (v.activeTopic !== undefined && (typeof v.activeTopic !== 'string' || !safeKey(v.activeTopic) || v.activeTopic.length > 100)) throw new Error('Invalid conversation topic.');
  const strings = (raw: unknown, max: number) => {
    if (!Array.isArray(raw) || raw.length > max || raw.some(s => typeof s !== 'string' || !safeKey(s))) throw new Error('Invalid workspace list.');
    return [...new Set(raw as string[])];
  };
  const object = (raw: unknown): Record<string, unknown> => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 500 || Object.keys(raw).some(k => !safeKey(k))) throw new Error('Invalid workspace dictionary.');
    return raw as Record<string, unknown>;
  };
  const notes = Object.fromEntries(Object.entries(object(v.notes)).map(([key, raw]) => {
    if (typeof raw !== 'string' || raw.length > 8000) throw new Error('Notes must be text under 8,000 characters.');
    return [key, evidenceText(raw)];
  }));
  if (!Array.isArray(v.questions) || v.questions.length > 20) throw new Error('Keep at most twenty saved questions.');
  const questions = v.questions.map(raw => {
    const q = object(raw);
    if (typeof q.question !== 'string' || q.question.length > 4000 || typeof q.answer !== 'string' || q.answer.length > 24000 || typeof q.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(q.fingerprint) || typeof q.createdAt !== 'string' || !Number.isFinite(Date.parse(q.createdAt))) throw new Error('Invalid saved question.');
    let evidence: import('../../shared/intelligence/contracts.js').Evidence[] | undefined;
    if (q.evidence !== undefined) {
      if (!Array.isArray(q.evidence) || q.evidence.length > 12) throw new Error('Invalid saved evidence.');
      evidence = q.evidence.map(raw => {
        const e = object(raw);
        if (typeof e.path !== 'string' || typeof e.id !== 'string' || !/^E[0-9]{1,2}$/.test(e.id) || typeof e.hash !== 'string' || !/^[a-f0-9]{64}$/.test(e.hash) || typeof e.text !== 'string' || e.text.length > 5000 || typeof e.reason !== 'string' || e.reason.length > 500 || typeof e.startLine !== 'number' || !Number.isSafeInteger(e.startLine) || e.startLine < 1 || typeof e.endLine !== 'number' || !Number.isSafeInteger(e.endLine) || e.endLine < e.startLine) throw new Error('Invalid saved source citation.');
        safeRelative(e.path);
        return { id: e.id, path: e.path, hash: e.hash, text: evidenceText(e.text), reason: e.reason, startLine: e.startLine, endLine: e.endLine };
      });
    }
    if (q.topic !== undefined && (typeof q.topic !== 'string' || !safeKey(q.topic) || q.topic.length > 100)) throw new Error('Invalid saved conversation topic.');
    return { question: evidenceText(q.question), answer: evidenceText(q.answer), fingerprint: q.fingerprint, createdAt: q.createdAt, ...(q.topic ? { topic: String(q.topic) } : {}),
      ...(typeof q.revision === 'string' && /^[a-f0-9]{40}$/.test(q.revision) ? { revision: q.revision } : {}), ...(evidence ? { evidence } : {}) };
  });
  const findings = Object.fromEntries(Object.entries(object(v.findings)).map(([key, raw]) => {
    const f = object(raw);
    if (!['confirmed', 'dismissed', 'fixed'].includes(String(f.status)) || typeof f.reason !== 'string' || !f.reason.trim() || f.reason.length > 2000 || (f.expiresAt !== undefined && (typeof f.expiresAt !== 'string' || !Number.isFinite(Date.parse(f.expiresAt))))) throw new Error('Finding states require a valid status, reason and optional expiry.');
    return [key, { status: f.status as 'confirmed' | 'dismissed' | 'fixed', reason: evidenceText(f.reason), ...(f.expiresAt ? { expiresAt: String(f.expiresAt) } : {}) }];
  }));
  let view: WorkspaceState['view'];
  if (v.view !== undefined) {
    const raw = object(v.view);
    if (typeof raw.name !== 'string' || raw.name.length > 50 || typeof raw.path !== 'string' || raw.path.length > 500 || typeof raw.filter !== 'string' || raw.filter.length > 500) throw new Error('Invalid saved viewpoint.');
    view = { name: raw.name, path: raw.path, filter: raw.filter };
  }
  return { schemaVersion: 1, notes, completed: strings(v.completed, 500), bookmarks: strings(v.bookmarks, 100), questions, findings, ...(view ? { view } : {}), ...(v.activeTopic ? { activeTopic: String(v.activeTopic) } : {}) };
}
interface Stored { schemaVersion: 1; snapshots: Snapshot[]; state: WorkspaceState }
const queues = new Map<string, Promise<unknown>>();
export class IntelligenceStore {
  constructor(readonly directory = home()) {}
  private async file(root: string) {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Intelligence storage must be a private directory.');
    return path.join(this.directory, hash(await fs.realpath(root)) + '.json');
  }
  private async load(root: string): Promise<Stored> {
    const file = await this.file(root);
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error('Invalid intelligence storage file.');
      const data = JSON.parse(await fs.readFile(file, 'utf8')) as Stored;
      if (data.schemaVersion !== 1 || !Array.isArray(data.snapshots) || data.snapshots.length > 20) throw new Error('Unsupported intelligence storage version.');
      data.state = validateWorkspaceState(data.state);
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, snapshots: [], state: emptyWorkspaceState() };
      throw error;
    }
  }
  async read(root: string) { return this.load(root); }
  private async update(root: string, change: (data: Stored) => void) {
    const key = await this.file(root);
    const previous = queues.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const data = await this.load(root); change(data);
      const text = JSON.stringify(data);
      if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('Snapshot retention budget exceeded. Remove older snapshots first.');
      const temporary = key + '.' + randomUUID();
      try { await fs.writeFile(temporary, text, { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, key); }
      finally { await fs.unlink(temporary).catch(() => {}); }
      return data;
    });
    queues.set(key, task);
    try { return await task; } finally { if (queues.get(key) === task) queues.delete(key); }
  }
  saveState(root: string, state: unknown) {
    const validated = validateWorkspaceState(state);
    return this.update(root, data => { data.state = validated; });
  }
  saveSnapshot(root: string, snapshot: Snapshot) {
    return this.update(root, data => {
      data.snapshots = [snapshot, ...data.snapshots.filter(s => s.fingerprint !== snapshot.fingerprint)].slice(0, 20);
    });
  }
  clear(root: string) { return this.update(root, data => { data.snapshots = []; data.state = emptyWorkspaceState(); }); }
}
