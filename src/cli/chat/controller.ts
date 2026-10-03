import { promises as fs } from 'node:fs';
import { AGENT_MODES, type AgentMode, type AgentRequest, type AgentEvent, type AgentResult } from '../agent/contracts.js';
import { runAgent, savedRun, type RunnerOptions } from '../agent/runner.js';
import { agentHome } from '../agent/config.js';
import { redact, terminalText } from '../agent/process.js';
import { ChatStore, newChat, historySummary, type ChatRecord, type ChatSettings } from './store.js';
import { slashInput, chatHelp, BROWSE_COMMANDS } from './commands.js';
import { ChatSources, isRemoteSource } from './source.js';

export type ChatOutput =
  | { type: 'message'; text: string }
  | { type: 'start'; prompt: string; mode: AgentMode }
  | { type: 'event'; event: AgentEvent }
  | { type: 'end'; result: AgentResult; elapsed: number }
  | { type: 'clear' | 'exit' };
export interface ChatPorts {
  output: (event: ChatOutput) => void;
  run?: typeof runAgent;
  browse?: (name: string, args: string[], root: string, signal: AbortSignal) => Promise<string>;
  utility?: (name: ChatUtility, signal: AbortSignal) => Promise<string>;
  chooseModel?: (configure: boolean, signal: AbortSignal) => Promise<boolean>;
  store?: ChatStore; runner?: Omit<RunnerOptions, 'onEvent' | 'signal'>;
  sources?: ChatSources;
}
export type ChatUtility = 'doctor' | 'setup' | 'model' | 'tools' | 'runs';
export class ChatController {
  record: ChatRecord;
  lastResult: AgentResult | null = null;
  busy = false;
  closed = false;
  private abort: AbortController | null = null;
  private paste: string[] | null = null;
  private store: ChatStore;
  private sources: ChatSources;
  constructor(settings: ChatSettings, private ports: ChatPorts) {
    this.record = newChat(settings);
    this.store = ports.store || new ChatStore(ports.runner?.home || agentHome(ports.runner?.env), ports.runner?.env);
    this.sources = ports.sources || new ChatSources(this.store.home, { env: ports.runner?.env });
  }
  get settings() { return this.record.settings; }
  get pasting() { return this.paste !== null; }
  get workspace() { return this.lastResult?.workspace || this.settings.root; }
  private say(text: string) { this.ports.output({ type: 'message', text: terminalText(redact(text, this.ports.runner?.env)) }); }
  cancel() { this.abort?.abort(); }
  close() { this.closed = true; this.cancel(); this.paste = null; this.ports.output({ type: 'exit' }); }
  private async persist() {
    this.record.updatedAt = new Date().toISOString();
    try { await this.store.save(this.record); return true; }
    catch (e) { this.say(`Could not save this conversation: ${e instanceof Error ? e.message : e}. The agent run remains in agent runs.`); return false; }
  }
  async save() { return this.persist(); }
  private resetContext() { this.record.lastRun = null; this.lastResult = null; }
  status(): string {
    const s = this.settings;
    return [...(s.sourceUrl ? [`GitHub: ${s.sourceUrl}`] : []), `Repository: ${s.root}`, `Workflow: ${s.mode}${s.pr ? ' · PR #' + s.pr : ''}${s.issue ? ' · issue #' + s.issue : ''}`,
      `Model: ${s.model || 'Hermes profile default'}${s.provider ? ' (' + s.provider + ')' : ''}`,
      `Permissions: files ${['implement', 'pr'].includes(s.mode) ? 'isolated workspace' : 'read only'} · checks ${s.checks ? 'on' : 'off'} · GitHub writes ${s.github ? 'on' : 'off'}`,
      `Limits: ${s.timeout}s · ${s.maxTurns} agent turns`, `Conversation: ${this.record.id}`, `Session run: ${this.record.lastRun || 'new'}`,
      `Workspace: ${this.workspace}`, ...(this.lastResult?.branch ? [`Branch: ${this.lastResult.branch}`] : [])].join('\n');
  }
  async accept(input: string): Promise<void> {
    if (this.closed) return;
    const trimmed = input.trim(), command = slashInput(trimmed);
    if (command?.name === 'exit' || command?.name === 'quit') { this.close(); return; }
    if (command?.name === 'cancel') { if (this.busy) { this.cancel(); this.say('Cancelling…'); } else this.say('No active task.'); return; }
    if (this.busy) { this.say('A task is running. Use /cancel or Ctrl-C before starting another.'); return; }
    if (this.paste !== null) {
      if (trimmed === '/discard') { this.paste = null; this.say('Multiline message discarded.'); return; }
      if (trimmed === '/send') { const body = this.paste.join('\n'); this.paste = null; if (body.trim()) await this.submit(body); return; }
      if (this.paste.join('\n').length + input.length + 1 > 16000) { this.say('Message limit is 16000 characters. /send or /discard this message.'); return; }
      this.paste.push(input); return;
    }
    if (!trimmed) return;
    this.busy = true; this.abort = new AbortController();
    try {
      if (!command) {
        if (trimmed.startsWith('/')) throw new Error('Invalid slash command. Use /help.');
        const first = trimmed.split(/\s+/)[0]!;
        if (isRemoteSource(first)) {
          await this.openSource(first);
          const question = trimmed.slice(first.length).trim(); if (question) await this.run(question);
          return;
        }
        await this.run(trimmed); return;
      }
      const { name, args, body } = command;
      if (!name || name === 'help') { this.say(chatHelp(args[0])); return; }
      if (name === 'status') { this.say(this.status()); return; }
      if (name === 'skills') { this.say('Built-in workflow skills\n' + ['ask — repository Q&A', 'review — local and PR review', 'triage — investigate issues', 'implement — isolated code changes', 'pr — prepare or publish a draft PR', 'github — issues, discussions, labels, and CI'].map(s => '  /' + s).join('\n')); return; }
      if (name === 'tools' || name === 'runs') { this.say(await this.utility(name)); return; }
      if (name === 'run') {
        const saved = await savedRun(args[0] || '', this.store.home);
        if (saved.manifest.sourceRoot !== this.settings.root) throw new Error('This run belongs to another repository. Switch with /repo first.');
        this.say(`Run: ${saved.manifest.id} · ${saved.result?.status || 'unfinished'}\nWorkspace: ${saved.manifest.root}\n\n${saved.result?.answer || 'No saved final answer.'}`); return;
      }
      if (name === 'export') { this.say('Conversation exported: ' + await this.store.export(this.record)); return; }
      if (name === 'send' || name === 'discard') { this.say('Use /paste first to compose a multiline message.'); return; }
      if (name === 'clear') { this.ports.output({ type: 'clear' }); return; }
      if (name === 'paste') { this.paste = []; this.say('Multiline input. /send submits; /discard cancels.'); return; }
      if (name === 'new') { this.record = newChat({ ...this.settings, pr: undefined, issue: undefined }); this.lastResult = null; this.say('New conversation. ' + this.record.id); await this.persist(); return; }
      if (name === 'history') { this.say(historySummary(await this.store.list(this.settings.root))); return; }
      if (name === 'resume') { await this.resume(args[0] || ''); return; }
      if (name === 'repo' || name === 'clone') {
        if (!body) { this.say(name === 'clone' ? 'Usage: /clone <GitHub URL>' : (this.settings.sourceUrl || this.settings.root)); return; }
        if (name === 'clone' && (args.length !== 1 || !isRemoteSource(args[0]!))) throw new Error('Usage: /clone <GitHub URL>');
        await this.openSource(args.join(' ')); return;
      }
      if (name === 'pull') {
        if (body) throw new Error('Usage: /pull');
        if (this.lastResult?.branch) throw new Error('Use /new before pulling the source checkout. Your implementation workspace remains saved in agent runs.');
        this.say(await this.sources.pull(this.settings.root, this.abort.signal, text => this.say(text)));
        this.resetContext(); await this.persist(); this.say('Source refreshed. The next question starts a new agent session.'); return;
      }
      if (name === 'mode') {
        if (!body) { this.say(`Workflow: ${this.settings.mode}. Choose ${AGENT_MODES.join(', ')}.`); return; }
        if (!AGENT_MODES.includes(body as AgentMode)) throw new Error('Usage: /mode ' + AGENT_MODES.join('|'));
        if (body !== this.settings.mode) { this.settings.mode = body as AgentMode; this.settings.pr = undefined; this.settings.issue = undefined; this.resetContext(); }
        this.say('Workflow: ' + body + '. Following messages use this workflow.'); await this.persist(); return;
      }
      if (name === 'permissions') {
        if (!body) { this.say(`Checks: ${this.settings.checks ? 'on' : 'off'} · GitHub writes: ${this.settings.github ? 'on' : 'off'}\n/permissions checks on|off · /permissions github on|off`); return; }
        if (args.length !== 2 || !['checks', 'github'].includes(args[0]!) || !['on', 'off'].includes(args[1]!)) throw new Error('Usage: /permissions checks|github on|off');
        const key = args[0] as 'checks' | 'github', value = args[1] === 'on';
        if (this.settings[key] !== value) { this.settings[key] = value; this.resetContext(); }
        this.say(`${key === 'checks' ? 'Repository test execution' : 'GitHub writes'} ${value ? 'enabled' : 'disabled'}.`); await this.persist(); return;
      }
      if (name === 'model') {
        if (args.length > 2 || args.some(arg => arg.length > 512)) throw new Error('Usage: /model <name> [provider] (maximum 512 characters each)');
        if (!body || body === 'configure') {
          const changed = this.ports.chooseModel ? await this.ports.chooseModel(body === 'configure', this.abort.signal) : (this.say(await this.utility('model')), true);
          if (!changed) { this.say('Model selection closed. Current settings kept.'); return; }
          this.settings.model = undefined; this.settings.provider = undefined;
        }
        else { this.settings.model = args[0] === 'default' ? undefined : args[0]; this.settings.provider = args[0] === 'default' ? undefined : args[1]; }
        this.resetContext(); this.say('Model: ' + (this.settings.model || 'Hermes profile default')); await this.persist(); return;
      }
      if (name === 'limits') {
        if (!body) { this.say(`${this.settings.timeout}s · ${this.settings.maxTurns} agent turns`); return; }
        const seconds = Number(args[0]), turns = args[1] === undefined ? this.settings.maxTurns : Number(args[1]);
        if (args.length > 2 || !Number.isInteger(seconds) || seconds < 15 || seconds > 3600 || !Number.isInteger(turns) || turns < 1 || turns > 100) throw new Error('Usage: /limits <15–3600 seconds> [1–100 turns]');
        this.settings.timeout = seconds; this.settings.maxTurns = turns; await this.persist(); this.say(`${seconds}s · ${turns} agent turns`); return;
      }
      if (name === 'setup' || name === 'doctor') { this.say(await this.utility(name)); return; }
      if (BROWSE_COMMANDS.includes(name as typeof BROWSE_COMMANDS[number])) {
        if (name === 'deep' && !this.settings.checks) throw new Error('Enable /permissions checks on before running an external analyzer.');
        if (!this.ports.browse) throw new Error('Repository browsing is unavailable.');
        this.say(await this.ports.browse(name, args, this.workspace, this.abort.signal)); return;
      }
      if (AGENT_MODES.includes(name as AgentMode)) {
        const mode = name as AgentMode;
        let task = body, pr: number | undefined, issue: number | undefined;
        if (['review', 'triage'].includes(mode) && /^\d+(?:\s|$)/.test(body)) {
          const match = /^(\d+)(?:\s+([\s\S]*))?$/.exec(body)!;
          const id = Number(match[1]); if (!Number.isSafeInteger(id) || id < 1) throw new Error('Use a positive PR or issue number.');
          if (mode === 'review') pr = id; else issue = id;
          task = match[2] || '';
        }
        task ||= mode === 'review' ? `Review ${pr ? 'PR #' + pr : 'local changes'} for actionable correctness and security issues.` : mode === 'triage' ? `Investigate ${issue ? 'issue #' + issue : 'open issues'} and propose a prioritized plan.` : '';
        if (!task) throw new Error(`Usage: /${mode} <task>`);
        if (mode !== this.settings.mode || pr !== this.settings.pr || issue !== this.settings.issue) this.resetContext();
        Object.assign(this.settings, { mode, pr, issue }); await this.run(task); return;
      }
      throw new Error(`Unknown command /${name}. Use /help; Tab completes commands.`);
    } catch (e) { this.say(e instanceof Error ? e.message : String(e)); }
    finally { this.busy = false; this.abort = null; }
  }
  private async submit(task: string) {
    this.busy = true; this.abort = new AbortController();
    try { await this.run(task); } catch (e) { this.say(e instanceof Error ? e.message : String(e)); }
    finally { this.busy = false; this.abort = null; }
  }
  private async utility(name: ChatUtility) {
    if (!this.ports.utility) throw new Error(`Use onboarder agent ${name} in a terminal.`);
    return this.ports.utility(name, this.abort!.signal);
  }
  private async openSource(target: string) {
    const source = await this.sources.open(target, this.settings.root, this.abort!.signal, text => this.say(text));
    this.abort!.signal.throwIfAborted();
    await this.persist();
    this.abort!.signal.throwIfAborted();
    this.record = newChat({ ...this.settings, root: source.root, sourceUrl: source.sourceUrl, pr: undefined, issue: undefined });
    this.lastResult = null;
    this.say(`Repository: ${source.sourceUrl || source.root}\nNew conversation. Type your question.`);
    await this.persist();
  }
  async resume(id: string) {
    const record = await this.store.load(id);
    if (record.settings.root !== this.settings.root) throw new Error('This conversation belongs to another repository. Switch with /repo first.');
    let result: AgentResult | null = null;
    if (record.lastRun) {
      const saved = await savedRun(record.lastRun, this.store.home);
      if (saved.manifest.sourceRoot !== this.settings.root || saved.manifest.mode !== record.settings.mode || !saved.result?.sessionId) throw new Error('This conversation has no resumable Hermes session. Use /new.');
      await fs.access(saved.manifest.root);
      if (this.settings.checks && !saved.manifest.permissions.checks || this.settings.github && !saved.manifest.permissions.github) throw new Error('Resume cannot expand permissions. Turn them off first or use /new.');
      result = saved.result;
    }
    // Restore the model and task target, while retaining the permissions chosen in this application.
    const changed = record.settings.checks !== this.settings.checks || record.settings.github !== this.settings.github;
    record.settings.checks = this.settings.checks; record.settings.github = this.settings.github;
    if (changed) record.lastRun = null;
    this.record = record; this.lastResult = changed ? null : result;
    this.say(`Resumed conversation ${id}.\n${this.status()}${changed ? '\nPermissions changed; the next task starts a new Hermes session.' : ''}`);
    const last = record.turns.at(-1); if (last) this.say('Last answer\n' + last.answer);
  }
  private async run(task: string) {
    if (!task.trim() || task.length > 16000) throw new Error('Messages must contain 1–16000 characters.');
    const s = this.settings, start = Date.now();
    const request: AgentRequest = { root: s.root, mode: s.mode, task, model: s.model, provider: s.provider, pr: s.pr, issue: s.issue,
      base: s.base, allowChecks: s.checks, allowGithubWrites: s.github, timeoutSeconds: s.timeout, maxTurns: s.maxTurns,
      ...(this.record.lastRun ? { resume: this.record.lastRun } : {}) };
    this.ports.output({ type: 'start', prompt: terminalText(redact(task, this.ports.runner?.env)), mode: s.mode });
    let result: Awaited<ReturnType<typeof runAgent>>, sessionStarted = false;
    try {
      result = await (this.ports.run || runAgent)(request, { ...this.ports.runner, signal: this.abort!.signal,
        onEvent: event => {
          if (['text', 'tool_use', 'tool_result'].includes(event.type)) sessionStarted = true;
          this.ports.output({ type: 'event', event });
        } });
    } catch (e) {
      // Validation can reject before a run exists. Finish the UI without inventing a saved run.
      this.say('Task could not start: ' + (e instanceof Error ? e.message : String(e))); return;
    }
    if ('dryRun' in result) throw new Error('Chat requires a live agent result.');
    this.lastResult = result;
    // Failed startup can emit an ID without creating a usable Hermes session.
    // Keep the previous working session on failure; new failures start fresh.
    if (result.sessionId && (result.status === 'completed' || result.status === 'cancelled' && sessionStarted)) this.record.lastRun = result.id;
    this.record.turns.push({ at: new Date().toISOString(), prompt: task, answer: result.answer, run: result.id, status: result.status });
    this.record.turns = this.record.turns.slice(-100);
    this.ports.output({ type: 'end', result, elapsed: Date.now() - start });
    await this.persist();
  }
}
