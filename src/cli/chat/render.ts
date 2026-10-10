import { terminalText, redact } from '../agent/process.js';
import type { ChatOutput } from './controller.js';
import type { ChatSettings } from './store.js';
import { cells, clip } from './text.js';
import { ONBOARDER_MARK, ONBOARDER_COMPACT_MARK } from './logo.js';
import { screenDivider, type TranscriptDivider } from './screen.js';

export interface ChatTheme {
  accent: (text: string) => string; muted: (text: string) => string;
  strong: (text: string) => string; success: (text: string) => string; error: (text: string) => string;
  status?: (text: string) => string;
  selection?: (text: string) => string;
}
export const plainTheme: ChatTheme = { accent: s => s, muted: s => s, strong: s => s, success: s => s, error: s => s };
export interface BannerInfo { model?: string; provider?: string; tools?: number; session?: string; rows?: number; fullscreen?: boolean; indexedFiles?: number; catalog?: { name: string; description: string }[] }
export interface StatusInfo { model: string; repo: string; busy: boolean; elapsed: number; activity?: string; calls: number; tokens?: number; turns: number; tools: number }
export function chatStatus(settings: ChatSettings, columns: number, info: StatusInfo): string {
  const room = Math.max(1, columns - 1), milliseconds = Math.max(0, info.elapsed), elapsed = Math.floor(milliseconds / 1000);
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][Math.floor(milliseconds / 250) % 10];
  const activity = info.busy ? `${spinner} ${clip(info.activity || 'Working', room >= 100 ? 24 : 16)} ${elapsed}s` : '● Ready';
  const permissions = `checks ${settings.checks ? 'on' : 'off'} · GitHub ${settings.github ? 'on' : 'off'}`;
  const model = clip(info.model === 'model not configured' ? 'Offline · /model for AI' : info.model, room < 110 ? 18 : 24);
  const details = room < 36 ? [activity, settings.mode]
    : room < 72 ? [activity, permissions]
    : room < 110 ? [model, activity, permissions]
    : [model, activity, permissions, clip(info.repo, 16), settings.mode, info.busy ? `${info.calls} calls` : `${info.turns} turns`,
      info.tokens === undefined ? `${info.tools} tools` : `${Intl.NumberFormat('en', { notation: 'compact' }).format(info.tokens)} tokens`];
  return clip(details.join(' │ '), room);
}
const SIGIL = ONBOARDER_MARK;
const LETTERS: Record<string, string[]> = {
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  B: ['████ ', '█   █', '████ ', '█   █', '████ '],
  A: [' ███ ', '█   █', '█████', '█   █', '█   █'],
  R: ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
  D: ['████ ', '█   █', '█   █', '█   █', '████ '],
  E: ['█████', '█    ', '████ ', '█    ', '█████'],
};
export function chatBanner(settings: ChatSettings, columns = 80, theme = plainTheme, version = '', info: BannerInfo = {}): string {
  if (info.fullscreen) return screenBanner(settings, columns, theme, version, info);
  const room = Math.max(1, columns - 1), indent = room > 8 ? '  ' : '', width = Math.max(1, Math.min(room - indent.length, 144));
  const line = (text: string) => indent + clip(text, width);
  const output = [''];
  if (width >= 55 && (!info.rows || info.rows >= 18)) for (let row = 0; row < 5; row++) output.push(indent + theme.accent([... 'ONBOARDER'].map(c => LETTERS[c]![row]).join(' ')));
  else output.push(indent + theme.strong(clip('ONBOARDER', width)));
  output.push(line(`v${version || 'dev'} · repository agent powered by Hermes`), '');
  const details = [
    'YOUR SESSION', settings.sourceUrl || settings.root,
    'Model: ' + (settings.model || info.model || 'Choose with /model'),
    'Provider: ' + (settings.provider || info.provider || 'Hermes profile'),
    'Workflow: ' + settings.mode,
    `Checks ${settings.checks ? 'on' : 'off'} · GitHub writes ${settings.github ? 'on' : 'off'}`,
    'Session: ' + (info.session?.slice(0, 8) || 'new'),
  ];
  const features = [
    'AVAILABLE FEATURES',
    'Repository: maps, source, search, dependencies',
    'GitHub: PR reviews, issues, labels, CI, draft PRs',
    'Code: isolated edits, diffs, optional checks',
    'Explorer: diagrams, security, history, licenses',
    'Chat: follow-ups, resume, export, multiline',
    `${info.tools ?? 'Scoped'} tools · 6 workflow skills · /tools · /skills`,
  ];
  const compact = !!info.rows && info.rows < 30;
  const title = clip(` Onboarder v${version || 'dev'} · Hermes Agent `, Math.max(0, width - 6));
  if (width >= 18) output.push(indent + theme.accent('╭─' + title + '─'.repeat(width - 3 - cells(title)) + '╮'));
  if (compact) {
    const rows = [
      settings.sourceUrl || settings.root,
      'Model: ' + (settings.model || info.model || '/model — choose a provider'),
      `${settings.mode} · checks ${settings.checks ? 'on' : 'off'} · GitHub writes ${settings.github ? 'on' : 'off'}`,
      'Maps · code · GitHub · diagrams · history · security',
      `${info.tools ?? 'Scoped'} tools · 6 workflows · session ${info.session?.slice(0, 8) || 'new'}`,
    ];
    for (const text of rows) {
      const content = clip(text, width >= 18 ? width - 4 : width);
      output.push(indent + (width >= 18 ? theme.accent('│ ') : '') + content + (width >= 18 ? ' '.repeat(width - 4 - cells(content)) + theme.accent(' │') : ''));
    }
  } else if (width >= 76) {
    const left = Math.floor((width - 6) * 0.39), right = width - left - 6;
    const tools = info.catalog || [];
    const categories = [
      ['repository', tools.filter(t => t.name.startsWith('onboarder_agent_'))],
      ['analysis', tools.filter(t => !t.name.startsWith('onboarder_agent_') && !t.name.startsWith('github_'))],
      ['github', tools.filter(t => t.name.startsWith('github_'))],
    ] as const;
    const available = categories.flatMap(([label, list]) => list.length ? [label + ': ' + list.slice(0, 2).map(t => t.name.replace(/^onboarder_(?:agent_)?|^github_/, '')).join(', '), `  ${list.length} tools · /tools for details`] : []);
    const rightRows = ['Available Tools', ...(available.length ? available : features.slice(1, 4)), '', 'Available Skills',
      'repository: /ask — understand your code', 'review: /review — local changes and PRs', 'issues: /triage — investigate and prioritize',
      'code: /implement — isolated workspaces', 'pull requests: /pr — prepare draft PRs', 'github: /github — issues, reviews, CI', '',
      `${info.tools ?? 'Scoped'} tools · 6 skills · /help for commands`];
    const leftRows = [...SIGIL, '', settings.model || info.model || '/model to choose a model', settings.provider || info.provider || 'Provider not configured',
      settings.sourceUrl || settings.root, 'Session: ' + (info.session?.slice(0, 8) || 'new'),
      `Checks ${settings.checks ? 'on' : 'off'} · GitHub ${settings.github ? 'on' : 'off'}`];
    for (let i = 0; i < Math.max(leftRows.length, rightRows.length); i++) {
      const a = clip(leftRows[i] || '', left), b = clip(rightRows[i] || '', right);
      const heading = rightRows[i] === 'Available Tools' || rightRows[i] === 'Available Skills';
      output.push(indent + theme.accent('│ ') + (i < SIGIL.length || i === SIGIL.length + 1 ? theme.accent(a) : theme.muted(a)) + ' '.repeat(left - cells(a)) + '  ' + (heading ? theme.accent(b) : b) + ' '.repeat(right - cells(b)) + theme.accent(' │'));
    }
  } else {
    for (const text of [...details, '', ...features]) {
      const content = clip(text, width >= 18 ? width - 4 : width);
      output.push(indent + (width >= 18 ? theme.accent('│ ') : '') + (text.endsWith('SESSION') || text.endsWith('FEATURES') ? theme.strong(content) : content) + (width >= 18 ? ' '.repeat(width - 4 - cells(content)) + theme.accent(' │') : ''));
    }
  }
  if (width >= 18) output.push(indent + theme.accent('╰' + '─'.repeat(width - 2) + '╯'));
  output.push('', line('Welcome. Ask a question or paste a GitHub URL to get started.'), line('Type / for live commands · ↑/↓ choose · Tab/Enter insert · Esc close'), '');
  return output.join('\n');
}

/** A welcome screen fitted to the remaining viewport, rather than a fixed poster. */
function screenBanner(settings: ChatSettings, columns: number, theme: ChatTheme, version: string, info: BannerInfo): string {
  const room = Math.max(1, columns - 1), height = Math.max(1, info.rows || 24);
  const indent = room > 40 ? ' ' : '', width = Math.max(1, room - indent.length * 2);
  const model = settings.model || info.model || '/model — choose a provider';
  const details = [settings.sourceUrl || settings.root, 'Model: ' + model,
    `${settings.mode} · checks ${settings.checks ? 'on' : 'off'} · GitHub writes ${settings.github ? 'on' : 'off'}`,
    info.indexedFiles ? `${info.indexedFiles} code files indexed · /open to browse` : 'Repository browsing works offline',
    `${info.tools ?? 'Scoped'} tools · 6 skills · session ${info.session?.slice(0, 8) || 'new'}`];
  if (height < 10 || width < 28) return ['◈ ONBOARDER', ...details.slice(0, 3), '/map overview · /tour reading order', 'Ctrl-P commands · Ctrl-O files'].slice(0, height).map(t => theme.accent(clip(t, room))).join('\n');
  const output: string[] = [];
  output.push(indent + theme.accent('◈ ONBOARDER · code compass'));
  if (height >= 14) output.push(indent + theme.muted(clip('Understand the code. Find your direction.', width)), '');
  const title = clip(` Onboarder v${version || 'dev'} · Hermes harness `, width - 6);
  output.push(indent + theme.accent('╭─' + title + '─'.repeat(width - cells(title) - 3) + '╮'));
  const pair = (a: string, b: string, left: number, right: number, accent = false) => {
    const aa = clip(a, left), bb = clip(b, right);
    return indent + theme.accent('│ ') + theme.accent(aa) + ' '.repeat(left - cells(aa)) + '  ' + (accent ? theme.accent(bb) : bb) + ' '.repeat(right - cells(bb)) + theme.accent(' │');
  };
  const expanded = height >= 27 && width >= 76;
  if (expanded) {
    const left = Math.floor((width - 6) * 0.39), right = width - left - 6, tools = info.catalog || [];
    const groups = [['repository', tools.filter(t => t.name.startsWith('onboarder_agent_'))],
      ['analysis', tools.filter(t => !t.name.startsWith('onboarder_agent_') && !t.name.startsWith('github_'))],
      ['github', tools.filter(t => t.name.startsWith('github_'))]] as const;
    const available = groups.flatMap(([label, list]) => list.length ? [label + ': ' + list.slice(0, 2).map(t => t.name.replace(/^onboarder_(?:agent_)?|^github_/, '')).join(', '), `  ${list.length} tools · /tools for details`] : []);
    const b = ['Start here', '/map — understand the repository', '/tour — find a reading order',
      '/open — pick a file and explore it', '/find <query> — search the code', '/review — review changes with AI', '/model — set up optional AI', '',
      'Available Tools', ...(available.length ? available : ['repository · analysis · github']), '', 'Available Skills',
      'ask · review · triage · implement · pr · github'];
    const a = [...ONBOARDER_MARK, '', model, settings.provider || info.provider || 'Choose provider with /model',
      settings.sourceUrl || settings.root, 'Session: ' + (info.session?.slice(0, 8) || 'new'),
      `Checks ${settings.checks ? 'on' : 'off'} · GitHub ${settings.github ? 'on' : 'off'}`];
    for (let i = 0; i < Math.max(a.length, b.length); i++) output.push(pair(a[i] || '', b[i] || '', left, right, b[i]?.startsWith('Available') || b[i] === 'Start here'));
  } else if (width >= 62) {
    const left = 13, right = width - left - 6;
    for (let i = 0; i < details.length; i++) output.push(pair(ONBOARDER_COMPACT_MARK[i]!, details[i]!, left, right));
  } else {
    for (const detail of details) {
      const text = clip(detail, width - 4);
      output.push(indent + theme.accent('│ ') + text + ' '.repeat(width - 4 - cells(text)) + theme.accent(' │'));
    }
  }
  output.push(indent + theme.accent('╰' + '─'.repeat(width - 2) + '╯'));
  if (!expanded && height - output.length >= 5) output.push('', indent + theme.strong('Start here'), indent + clip('/map overview · /tour reading order · /open code files', width));
  output.push(indent + theme.muted(clip('Ctrl-P commands · Ctrl-O files · Ctrl-R resume · /help', width)));
  if (height - output.length > 0) output.push(indent + theme.muted(clip('Ask a question or paste a GitHub URL. PgUp/PgDn scroll.', width)));
  return output.slice(0, height).join('\n');
}

/** Writes only new output, leaving terminal scrollback and pasted code intact. */
export class ChatRenderer {
  private pending = '';
  private segment = '';
  private code = false;
  private streamed = 0;
  private replyOpen = false;
  constructor(private write: (text: string) => void, private theme = plainTheme, private env: NodeJS.ProcessEnv = process.env,
    private layout: { columns?: () => number; divider?: (divider: TranscriptDivider) => void } = {}) {}
  private safe(text: string) { return terminalText(redact(text, this.env)); }
  private divider(label: string, edge: TranscriptDivider['edge'], style = this.theme.accent) {
    const divider = { label: this.safe(label), edge, style };
    if (this.layout.divider) this.layout.divider(divider);
    else this.write(screenDivider(divider, Math.max(1, (this.layout.columns?.() || 80) - 1)));
  }
  private line(text: string) {
    const safe = this.safe(text);
    if (/^\s*```/.test(safe)) { this.code = !this.code; this.write(this.theme.muted(safe)); }
    else if (this.code) this.write(safe);
    else if (/^#{1,4}\s/.test(safe)) this.write(this.theme.strong(safe.replace(/^#{1,4}\s*/, '')));
    else this.write(safe);
  }
  private flush() { if (this.pending) { this.line(this.pending); this.pending = ''; } }
  finish() { this.flush(); }
  handle(output: ChatOutput) {
    if (output.type === 'start') {
      this.pending = ''; this.segment = ''; this.code = false; this.streamed = 0; this.replyOpen = true;
      this.divider('◈ Onboarder · ' + output.mode, 'top');
      if (['implement', 'pr'].includes(output.mode)) this.write(this.theme.muted('Edits use an isolated workspace at committed HEAD. Source checkout edits are excluded.'));
    } else if (output.type === 'message') {
      this.flush();
      if (!this.replyOpen) this.divider('◈ Onboarder · Result', 'top');
      this.write(this.safe(output.text));
      if (!this.replyOpen) { this.divider('', 'bottom'); this.write(''); }
    }
    else if (output.type === 'event') {
      const event = output.event;
      if (event.type === 'text' && event.text) {
        // Complete logical lines keep split credentials and escape sequences together.
        // A bounded buffer also prevents an unbroken model response exhausting memory.
        if (this.streamed >= 256000) return;
        const text = event.text.slice(0, 256000 - this.streamed); this.streamed += text.length;
        this.segment += text; this.pending += text;
        let end: number;
        while ((end = this.pending.indexOf('\n')) >= 0) { this.line(this.pending.slice(0, end)); this.pending = this.pending.slice(end + 1); }
      } else if (event.type === 'tool_use') {
        this.flush(); this.segment = ''; this.code = false;
        const name = this.safe(event.name || 'repository tool').replace(/^mcp__onboarder__(?:onboarder_)?/, '').replace(/_/g, ' ');
        this.write(this.theme.muted('  → ' + name));
      } else if (event.type === 'tool_result' && event.is_error) {
        this.flush(); this.write(this.theme.error('  Tool reported an error; Hermes may retry or explain it.'));
      }
    } else if (output.type === 'end') {
      const answer = this.safe(output.result.answer), segment = this.safe(this.segment);
      // Hermes emits intermediate narration as well as the final response. Only
      // suppress a final response already emitted by this last assistant segment.
      if (output.result.status === 'completed' && segment.trim() === answer.trim()) this.flush();
      else if (output.result.status === 'completed' && answer.startsWith(segment) && segment) {
        this.pending += answer.slice(segment.length); this.flush();
      } else { this.flush(); if (answer) this.write(answer.slice(0, 256000)); }
      if (this.streamed >= 256000 || answer.length > 256000) this.write(this.theme.muted('Display limited to 256000 characters. The full result is in agent show.'));
      const style = output.result.status === 'completed' ? this.theme.success : this.theme.error;
      const mark = output.result.status === 'completed' ? '✓' : output.result.status === 'cancelled' ? '■' : '!';
      this.divider(`${mark} ${output.result.status} · ${(output.elapsed / 1000).toFixed(1)}s · /runs for details`, 'bottom', style);
      if (output.result.branch) this.write(this.theme.muted('Workspace: ' + this.safe(output.result.workspace) + '\nBranch: ' + this.safe(output.result.branch)));
      if (output.result.status === 'failed') this.write(this.theme.muted('Use /doctor to check the runtime or /model configure to select a model.'));
      this.write(''); this.pending = ''; this.segment = ''; this.code = false; this.replyOpen = false;
    }
  }
}
