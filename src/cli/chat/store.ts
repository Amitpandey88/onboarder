import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AGENT_MODES, type AgentMode, type AgentResult } from '../agent/contracts.js';
import { agentHome } from '../agent/config.js';
import { runId } from '../agent/runner.js';
import { redact, terminalText } from '../agent/process.js';
import { repositoryFromRemote } from '../agent/github.js';

export interface ChatSettings {
  root: string; sourceUrl?: string; mode: AgentMode; model?: string; provider?: string;
  checks: boolean; github: boolean; timeout: number; maxTurns: number; pr?: number; issue?: number; base?: string;
}
export interface ChatTurn { at: string; prompt: string; answer: string; run: string; status: AgentResult['status'] }
export interface ChatRecord {
  schemaVersion: 1; id: string; createdAt: string; updatedAt: string;
  settings: ChatSettings; lastRun: string | null; turns: ChatTurn[];
}
export function newChat(settings: ChatSettings): ChatRecord {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: randomUUID(), createdAt: now, updatedAt: now, settings: { ...settings }, lastRun: null, turns: [] };
}
function validSettings(s: ChatSettings): boolean {
  return !!s && typeof s.root === 'string' && path.isAbsolute(s.root) && AGENT_MODES.includes(s.mode) &&
    typeof s.checks === 'boolean' && typeof s.github === 'boolean' && Number.isInteger(s.timeout) && s.timeout >= 15 && s.timeout <= 3600 &&
    Number.isInteger(s.maxTurns) && s.maxTurns >= 1 && s.maxTurns <= 100 &&
    [s.model, s.provider, s.base].every(v => v === undefined || typeof v === 'string' && v.length <= 512) &&
    [s.pr, s.issue].every(v => v === undefined || Number.isSafeInteger(v) && v > 0) &&
    (s.sourceUrl === undefined || typeof s.sourceUrl === 'string' && repositoryFromRemote(s.sourceUrl) !== null);
}
export class ChatStore {
  constructor(readonly home = agentHome(), private env: NodeJS.ProcessEnv = process.env) {}
  get directory() { return path.join(this.home, 'chats'); }
  async save(record: ChatRecord) {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = path.join(this.directory, runId(record.id) + '.json'), temp = target + '.' + randomUUID() + '.tmp';
    const safe = { ...record, turns: record.turns.slice(-100).map(t => ({ ...t, prompt: redact(t.prompt, this.env), answer: redact(t.answer, this.env).slice(0, 32000) })) };
    let encoded = JSON.stringify(safe, null, 2) + '\n';
    // UTF-8 transcripts can use several bytes per character. Bound the stored
    // bytes, rather than producing a conversation our own loader cannot read.
    while (Buffer.byteLength(encoded) > 5 * 1024 * 1024 && safe.turns.length > 1) {
      safe.turns.shift(); encoded = JSON.stringify(safe, null, 2) + '\n';
    }
    try { await fs.writeFile(temp, encoded, { mode: 0o600, flag: 'wx' }); await fs.rename(temp, target); }
    finally { await fs.rm(temp, { force: true }); }
  }
  async load(id: string): Promise<ChatRecord> {
    const file = path.join(this.directory, runId(id) + '.json');
    if ((await fs.stat(file)).size > 6 * 1024 * 1024) throw new Error('The saved conversation exceeds the size limit.');
    const record = JSON.parse(await fs.readFile(file, 'utf8')) as ChatRecord;
    if (record.schemaVersion !== 1 || record.id !== id || !validSettings(record.settings) ||
      typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string' || !Array.isArray(record.turns) || record.turns.length > 100 ||
      !(record.lastRun === null || typeof record.lastRun === 'string') || record.turns.some(t => !t || typeof t.at !== 'string' ||
        typeof t.prompt !== 'string' || t.prompt.length > 16000 || typeof t.answer !== 'string' || t.answer.length > 32000 ||
        typeof t.run !== 'string' || !['completed', 'failed', 'cancelled'].includes(t.status))) throw new Error('The saved conversation is invalid.');
    if (record.lastRun) runId(record.lastRun);
    for (const turn of record.turns) runId(turn.run);
    return record;
  }
  async list(root: string): Promise<ChatRecord[]> {
    const entries = await fs.readdir(this.directory, { withFileTypes: true }).catch(e => { if (e.code !== 'ENOENT') throw e; return []; });
    const records: ChatRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f\d-]{36}\.json$/i.test(entry.name)) continue;
      try { const record = await this.load(entry.name.slice(0, -5)); if (record.settings.root === root) records.push(record); } catch { /* A damaged entry must not hide the others. */ }
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
  }
  async export(record: ChatRecord): Promise<string> {
    const directory = path.join(this.home, 'exports'); await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, record.id + '-' + randomUUID().slice(0, 8) + '.md');
    const text = ['# Onboarder conversation', '', `Repository: ${record.settings.sourceUrl || record.settings.root}`, `Conversation: ${record.id}`, '',
      ...record.turns.flatMap(turn => ['## You', '', turn.prompt, '', `## Hermes (${turn.status})`, '', turn.answer, '', `Run: ${turn.run}`, ''])].join('\n');
    await fs.writeFile(file, redact(text, this.env), { flag: 'wx', mode: 0o600 }); return file;
  }
}
export function historySummary(records: ChatRecord[]): string {
  return records.length ? records.map(r => `${r.id}  ${r.settings.mode}  ${r.turns.length} turns\n  ${r.updatedAt}  ${terminalText(r.turns[0]?.prompt || 'Empty conversation').replace(/\s+/g, ' ').slice(0, 100)}`).join('\n\n') : 'No saved conversations for this repository yet.';
}
