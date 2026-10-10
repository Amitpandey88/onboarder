import readline from 'node:readline';
import { terminalText, redact } from '../agent/process.js';
import { completeChat, suggestCommands } from './commands.js';
import { cells, clusterCells, clip, graphemes } from './text.js';
import { plainTheme, type ChatTheme } from './render.js';
import { TerminalScreen, wrapScreenLine, screenDivider, type TranscriptDivider } from './screen.js';
import { commandChoices, searchChoices, type SearchChoice } from './navigation.js';

export interface ComposerOptions {
  input: NodeJS.ReadStream; output: NodeJS.WriteStream; theme?: ChatTheme;
  state: () => { mode: string; status: string; busy: boolean; pasting: boolean; files: string[] };
  submit: (message: string) => void; cancel: () => void; exit: () => void;
  fullscreen?: boolean;
  welcome?: (columns: number, rows: number) => string;
  header?: () => string;
}
export interface PickerChoice extends SearchChoice {}
export interface PickerOptions { title: string; hint?: string; choices: PickerChoice[]; selected?: string; signal?: AbortSignal; query?: string; fuzzy?: boolean }
/** Raw-input composer with a full-screen viewport or an inline terminal footer. */
export class TerminalComposer {
  value = '';
  private cursor = 0;
  private selected = 0;
  private dismissed = false;
  private history: string[] = [];
  private historyIndex = -1;
  private draft = '';
  private actionDraft: { value: string; cursor: number } | null = null;
  private paste = false;
  private pasteCR = false;
  private suspended = true;
  private attached = false;
  private drawnRows = 0;
  private cursorRow = 0;
  private timer: NodeJS.Timeout | null = null;
  private rawBefore = false;
  private theme: ChatTheme;
  private screen: TerminalScreen | null;
  private viewHeight = 1;
  private picker: (PickerOptions & { query: string; index: number; filteredQuery: string | null; filtered: PickerChoice[]; finish: (value: string | null) => void }) | null = null;
  private onKey = (text: string, key: readline.Key = {}) => this.key(text, key);
  private onResize = () => this.refresh();
  constructor(private options: ComposerOptions) { this.theme = options.theme || plainTheme; this.screen = options.fullscreen ? new TerminalScreen(options.output) : null; }
  get choosing() { return this.picker !== null; }
  start() {
    if (this.attached) return;
    this.attached = true; this.suspended = false; this.rawBefore = !!this.options.input.isRaw;
    readline.emitKeypressEvents(this.options.input);
    this.options.input.setRawMode?.(true); this.options.input.resume();
    this.options.input.on('keypress', this.onKey); this.options.input.on('end', this.options.exit);
    this.options.output.on('resize', this.onResize);
    this.screen?.enter(); this.options.output.write('\x1b[?2004h'); this.render();
  }
  suspend() {
    this.picker?.finish(null);
    this.erase(); this.suspended = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.attached) return;
    this.options.input.off('keypress', this.onKey); this.options.input.off('end', this.options.exit);
    this.options.output.off('resize', this.onResize);
    this.options.output.write('\x1b[?2004l'); this.screen?.leave(); this.options.input.setRawMode?.(this.rawBefore);
    // The keypress decoder remains attached to this stream. Pause the parent's
    // reads so the inherited wizard TTY receives every keystroke exclusively.
    this.options.input.pause();
    this.attached = false;
  }
  close() { if (this.screen && !this.suspended) this.render(); this.suspend(); this.options.input.pause(); }
  refresh() {
    if (this.suspended || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.render(); }, 24); this.timer.unref();
  }
  print(text: string) {
    if (this.screen) { this.screen.append(text); this.refresh(); return; }
    if (this.suspended) { this.options.output.write(text + '\n'); return; }
    this.erase(); this.options.output.write(text + '\n'); this.refresh();
  }
  divider(divider: TranscriptDivider) {
    if (this.screen) { this.screen.appendDivider(divider); this.refresh(); }
    else this.print(screenDivider(divider, Math.max(1, (this.options.output.columns || 80) - 1)));
  }
  private question(text: string) {
    this.print('');
    this.divider({ label: 'You', edge: 'top', style: this.theme.accent });
    this.print(this.theme.accent('● ') + terminalText(redact(text)));
    this.divider({ label: '', edge: 'bottom', style: this.theme.accent });
    this.print('');
  }
  clear() { if (this.screen) { this.screen.clear(); this.refresh(); } else { this.erase(); this.options.output.write('\x1b[2J\x1b[H'); } }
  choose(options: PickerOptions): Promise<string | null> {
    this.picker?.finish(null);
    if (this.suspended || options.signal?.aborted) return Promise.resolve(null);
    return new Promise(resolve => {
      const abort = () => finish(null);
      const finish = (value: string | null) => {
        options.signal?.removeEventListener('abort', abort);
        if (this.picker?.finish !== finish) return;
        this.picker = null; this.paste = false; this.refresh(); resolve(value);
      };
      this.picker = { ...options, query: terminalText(options.query || '').replace(/[\r\n\t]/g, ' ').slice(0, 512), index: 0, filteredQuery: null, filtered: [], finish };
      this.picker.index = Math.max(0, this.pickerChoices().findIndex(c => c.value === options.selected));
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) finish(null); else this.refresh();
    });
  }
  private pickerChoices() {
    const picker = this.picker;
    if (!picker) return [];
    const query = picker.query.toLowerCase();
    if (query !== picker.filteredQuery) {
      picker.filtered = picker.fuzzy ? searchChoices(picker.choices, query)
        : picker.choices.filter(c => !query || (c.label + ' ' + (c.detail || '')).toLowerCase().includes(query));
      picker.filteredQuery = query;
    }
    return picker.filtered;
  }
  private async commandPalette() {
    const selected = await this.choose({ title: 'Command palette', hint: 'Search a command or topic · choosing inserts it without running', choices: commandChoices(), fuzzy: true });
    if (!selected || this.suspended) return;
    if (this.value && !this.actionDraft) this.actionDraft = { value: this.value, cursor: this.cursor };
    this.replace('/' + selected + (selected === 'model' ? '' : ' '));
    this.dismissed = true; this.refresh();
  }
  private shortcut(command: string) {
    const state = this.options.state();
    if (state.busy || state.pasting) return;
    this.screen?.latest();
    this.question(command);
    this.options.submit(command); this.refresh();
  }
  private pickerKey(text: string, key: readline.Key) {
    const picker = this.picker!;
    if (key.name === 'paste-start') { this.paste = true; return; }
    if (key.name === 'paste-end') { this.paste = false; this.refresh(); return; }
    if (this.paste) {
      if (text && !key.ctrl && !key.meta) picker.query = (picker.query + terminalText(text).replace(/[\r\n\t]/g, ' ')).slice(0, 512);
      picker.index = 0; this.refresh(); return;
    }
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) { picker.finish(null); return; }
    if (key.ctrl && key.name === 'd') { picker.finish(null); this.options.exit(); return; }
    const choices = this.pickerChoices();
    if (key.name === 'return' || key.name === 'enter') { if (choices.length) picker.finish(choices[picker.index % choices.length]!.value); }
    else if (['up', 'down', 'tab', 'pageup', 'pagedown'].includes(key.name || '')) {
      const step = key.name === 'pageup' ? -6 : key.name === 'pagedown' ? 6 : key.name === 'up' || key.shift ? -1 : 1;
      picker.index = choices.length ? (picker.index + step + choices.length * 6) % choices.length : 0;
    } else if (key.ctrl && key.name === 'u') { picker.query = ''; picker.index = 0; }
    else if (key.name === 'backspace') { picker.query = graphemes(picker.query).slice(0, -1).join(''); picker.index = 0; }
    else if (text && !key.ctrl && !key.meta && !/^[\x00-\x1f\x7f]/.test(text)) { picker.query = (picker.query + terminalText(text)).slice(0, 512); picker.index = 0; }
    this.refresh();
  }
  private erase() {
    if (this.screen) return;
    if (!this.drawnRows) return;
    if (this.cursorRow) readline.moveCursor(this.options.output, 0, -this.cursorRow);
    readline.cursorTo(this.options.output, 0); readline.clearScreenDown(this.options.output);
    this.drawnRows = 0; this.cursorRow = 0;
  }
  private replace(text: string) { this.value = text; this.cursor = text.length; this.selected = 0; this.dismissed = false; }
  private insert(text: string) {
    const clean = terminalText(text).replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
    if (this.value.length + clean.length > 16000) return;
    this.value = this.value.slice(0, this.cursor) + clean + this.value.slice(this.cursor); this.cursor += clean.length;
    this.selected = 0; this.dismissed = false; this.historyIndex = -1;
  }
  private suggestions() { return this.options.state().pasting || this.dismissed || this.cursor !== this.value.length ? [] : suggestCommands(this.value); }
  key(text: string, key: readline.Key = {}) {
    if (this.suspended) return;
    if (this.picker) { this.pickerKey(text, key); return; }
    if (this.screen && (key.name === 'pageup' || key.name === 'pagedown')) {
      this.screen.scroll(key.name === 'pageup' ? 1 : -1, Math.max(1, (this.options.output.columns || 80) - 1), this.viewHeight);
      this.refresh(); return;
    }
    if (key.name === 'paste-start') { this.paste = true; this.pasteCR = false; this.dismissed = true; return; }
    if (key.name === 'paste-end') { this.paste = false; this.refresh(); return; }
    if (this.paste) {
      if (key.name === 'return') { this.insert('\n'); this.pasteCR = true; }
      else if (key.name === 'enter') { if (!this.pasteCR) this.insert('\n'); this.pasteCR = false; }
      else { this.pasteCR = false; if (text && !key.ctrl && !key.meta) this.insert(text); }
      this.refresh(); return;
    }
    const suggestions = this.suggestions();
    if (key.ctrl) {
      if (key.name === 'p') { const state = this.options.state(); if (!state.busy && !state.pasting) void this.commandPalette(); }
      else if (key.name === 'o') this.shortcut('/open');
      else if (key.name === 'r') this.shortcut('/resume');
      else if (key.name === 'end' && this.screen) this.screen.latest();
      else if (key.name === 'c') { this.actionDraft = null; this.replace(''); this.options.cancel(); }
      else if (key.name === 'd') { if (!this.value) this.options.exit(); else this.deleteNext(); }
      else if (key.name === 'a') this.cursor = 0;
      else if (key.name === 'e') this.cursor = this.value.length;
      else if (key.name === 'u') { this.value = this.value.slice(this.cursor); this.cursor = 0; }
      else if (key.name === 'k') this.value = this.value.slice(0, this.cursor);
      else if (key.name === 'w') { const left = this.value.slice(0, this.cursor).replace(/\s*\S+\s*$/, ''); this.value = left + this.value.slice(this.cursor); this.cursor = left.length; }
      this.refresh(); return;
    }
    if (key.name === 'escape') {
      if (this.actionDraft) { const draft = this.actionDraft; this.actionDraft = null; this.replace(draft.value); this.cursor = draft.cursor; }
      this.dismissed = true; this.refresh(); return;
    }
    if ((key.name === 'up' || key.name === 'down') && suggestions.length) {
      this.selected = (this.selected + (key.name === 'up' ? -1 : 1) + suggestions.length) % suggestions.length;
    } else if (key.name === 'tab' || ((key.name === 'return' || key.name === 'enter') && suggestions.length &&
      this.value !== '/' + suggestions[this.selected % suggestions.length]![0] && !key.meta && !key.shift)) {
      if (suggestions.length) { const name = suggestions[this.selected % suggestions.length]![0]; this.replace('/' + name + (name === 'model' ? '' : ' ')); this.dismissed = true; }
      else {
        const [hits, fragment] = completeChat(this.value, this.options.state().files);
        if (hits.length) this.replace(this.value.slice(0, this.value.length - fragment.length) + hits[0]);
      }
    } else if (key.name === 'return' || key.name === 'enter') {
      if (key.meta || key.shift) this.insert('\n');
      else {
        const message = this.value;
        if (message.trim()) { this.history = [message, ...this.history.filter(h => h !== message)].slice(0, 200); }
        const draft = this.actionDraft; this.actionDraft = null;
        this.replace(draft?.value || ''); if (draft) this.cursor = draft.cursor;
        this.historyIndex = -1; this.screen?.latest();
        this.question(message);
        this.options.submit(message);
      }
    } else if (key.name === 'up' || key.name === 'down') {
      if (this.historyIndex === -1) this.draft = this.value;
      this.historyIndex = Math.max(-1, Math.min(this.history.length - 1, this.historyIndex + (key.name === 'up' ? 1 : -1)));
      const index = this.historyIndex; this.replace(index < 0 ? this.draft : this.history[index]!); this.historyIndex = index; this.dismissed = true;
    } else if (key.name === 'left') this.cursor -= graphemes(this.value.slice(0, this.cursor)).at(-1)?.length || 0;
    else if (key.name === 'right') this.cursor += graphemes(this.value.slice(this.cursor))[0]?.length || 0;
    else if (key.name === 'home') this.cursor = 0;
    else if (key.name === 'end') this.cursor = this.value.length;
    else if (key.name === 'backspace') {
      const count = graphemes(this.value.slice(0, this.cursor)).at(-1)?.length || 0;
      this.value = this.value.slice(0, this.cursor - count) + this.value.slice(this.cursor); this.cursor -= count; this.selected = 0; this.dismissed = false;
    } else if (key.name === 'delete') this.deleteNext();
    else if (text && !key.meta && !/^[\x00-\x1f\x7f]/.test(text)) this.insert(text);
    this.refresh();
  }
  private deleteNext() { const count = graphemes(this.value.slice(this.cursor))[0]?.length || 0; this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + count); }
  private render() {
    if (this.suspended) return;
    this.erase();
    const columns = Math.max(2, this.options.output.columns || Number(process.env.COLUMNS) || 80), room = columns - 1;
    const state = this.options.state(), prefix = this.picker ? 'filter › ' : state.pasting ? 'paste › ' : state.mode + ' › ';
    const value = this.picker ? this.picker.query : this.value, cursor = this.picker ? value.length : this.cursor;
    const lead = clip(prefix, Math.max(1, room - 1), false);
    const lines = ['']; let row = 0, col = 0, cursorRow = 0, cursorCol = 0, offset = -lead.length;
    for (const g of graphemes(lead + value)) {
      if (offset === cursor) { cursorRow = row; cursorCol = col; }
      if (g === '\n') { lines.push(''); row++; col = 0; }
      else {
        const actualSize = clusterCells(g), size = Math.min(room, actualSize);
        if (col + size > room) { lines.push(''); row++; col = 0; if (offset === cursor) { cursorRow = row; cursorCol = 0; } }
        lines[row] += actualSize > room ? '?' : g; col += size;
      }
      offset += g.length;
    }
    if (cursor === value.length) { cursorRow = row; cursorCol = col; }
    const maxInput = Math.max(1, Math.min(8, (this.options.output.rows || 24) - (this.screen ? 12 : 7)));
    const start = Math.max(0, cursorRow - maxInput + 1);
    const inputLines = lines.slice(start, start + maxInput); cursorRow -= start;
    if (start === 0) inputLines[0] = this.theme.accent(lead) + inputLines[0]!.slice(lead.length);
    if (!value) inputLines[0] += this.theme.muted(clip(this.picker ? 'Type to search · arrows to choose' : 'Ask about the repo, or type / for commands…', Math.max(0, room - cells(lead))));
    const status = clip(state.status, room);
    const rows = [(this.theme.status || this.theme.muted)(status + ' '.repeat(room - cells(status))),
      screenDivider({ label: this.picker ? 'Search' : state.pasting ? 'Multiline message' : 'Message', edge: 'top', style: this.theme.accent }, room), ...inputLines,
      screenDivider({ label: '', edge: 'bottom', style: this.theme.accent }, room)];
    cursorRow += 2;
    const suggestions = this.picker ? [] : this.suggestions();
    if (this.picker) {
      const picker = this.picker, choices = this.pickerChoices();
      const count = Math.max(1, Math.min(8, (this.options.output.rows || 24) - rows.length - (this.screen ? 7 : 5)));
      const begin = Math.max(0, picker.index - count + 1);
      const inner = Math.max(0, room - 4);
      const box = (text: string) => { const shown = clip(text, inner); return room >= 6 ? '│ ' + shown + ' '.repeat(inner - cells(shown)) + ' │' : clip(text, room); };
      const heading = clip(' ' + picker.title + ' ', Math.max(0, room - 4));
      rows.push(this.theme.accent(room >= 6 ? '╭─' + heading + '─'.repeat(room - 3 - cells(heading)) + '╮' : clip(picker.title, room)));
      if (picker.hint) rows.push(this.theme.muted(box(picker.hint)));
      if (!choices.length) rows.push(this.theme.muted(box('No matches · clear the filter with Ctrl-U')));
      choices.slice(begin, begin + count).forEach((choice, i) => {
        const chosen = begin + i === picker.index;
        const text = `${chosen ? '❯' : ' '} ${choice.label}${choice.detail ? '  ·  ' + choice.detail : ''}`;
        rows.push((chosen ? this.theme.selection || this.theme.accent : this.theme.muted)(box(text)));
      });
      const detail = choices[picker.index]?.detail;
      if (detail) rows.push(this.theme.strong(box(detail)));
      const hint = clip(` ↑/↓ select · Enter choose · Esc cancel · ${choices.length ? picker.index + 1 : 0}/${choices.length} `, Math.max(0, room - 4));
      rows.push(this.theme.accent(room >= 6 ? '╰─' + hint + '─'.repeat(room - 3 - cells(hint)) + '╯' : clip(hint, room)));
    } else if (suggestions.length) {
      const count = Math.max(1, Math.min(6, (this.options.output.rows || 24) - rows.length - (this.screen ? 4 : 2)));
      const begin = Math.max(0, this.selected - count + 1), visible = suggestions.slice(begin, begin + count);
      visible.forEach(([name, usage, summary], index) => {
        const chosen = begin + index === this.selected;
        const label = `${chosen ? '›' : ' '} /${name}${usage ? ' ' + usage : ''}`;
        const shown = clip(label, Math.min(36, Math.floor(room * 0.5)));
        const detail = room > 45 ? '  ' + clip(summary, room - cells(shown) - 2) : '';
        rows.push((chosen ? this.theme.accent : this.theme.muted)(shown + detail));
      });
      rows.push(this.theme.muted(clip(`↑/↓ select · Tab/Enter insert · Esc close · ${this.selected + 1}/${suggestions.length}`, room)));
    } else rows.push(this.theme.muted(clip(state.busy ? 'Working · /cancel or Ctrl-C to stop' : state.pasting ? '/send submit · /discard cancel' : this.actionDraft ? 'Enter runs this command · Esc returns to your draft' : 'Ctrl-P commands · Ctrl-O files · Ctrl-R resume · /help', room)));
    if (this.screen) {
      const height = Math.max(1, this.options.output.rows || 24);
      if (height < 3) {
        const tiny = [inputLines[Math.max(0, cursorRow - 2)] || inputLines[0]!, this.theme.muted(clip(state.status, room))].slice(0, height);
        this.viewHeight = 1; this.screen.draw(tiny, columns, 0, cursorCol); return;
      }
      let footer = rows, footerCursorRow = cursorRow;
      // Tiny windows keep the active input visible; menus simplify to one choice.
      if (footer.length > height - 2) {
        const choices = this.picker ? this.pickerChoices() : [];
        const hint = this.picker ? choices[this.picker.index]?.label || 'No matches' : suggestions[this.selected]?.[0] ? '/' + suggestions[this.selected]![0] : 'Enter send · Esc cancel';
        footer = [inputLines[Math.max(0, cursorRow - 2)] || inputLines[0]!, this.theme.muted(clip(hint, room))].slice(0, Math.max(1, height - 2));
        footerCursorRow = 0;
      }
      this.viewHeight = height - footer.length - 1;
      const welcome = this.options.welcome?.(columns, this.viewHeight) || '';
      const content = this.screen.view(room, this.viewHeight, welcome);
      const header = this.screen.scrolled
        ? this.screen.unread ? `history · ${this.screen.unread} new lines · Ctrl-End latest · PgDn to return` : 'history · PgDn to return · Ctrl-End latest'
        : (this.options.header?.() || 'ONBOARDER');
      const frame = [wrapScreenLine(header, room)[0]!, ...content,
        ...Array(Math.max(0, this.viewHeight - content.length)).fill(''), ...footer];
      this.screen.draw(frame, columns, height - footer.length + footerCursorRow, cursorCol);
      return;
    }
    this.options.output.write(rows.join('\n'));
    const up = rows.length - 1 - cursorRow;
    if (up) readline.moveCursor(this.options.output, 0, -up);
    readline.cursorTo(this.options.output, cursorCol);
    this.drawnRows = rows.length; this.cursorRow = cursorRow;
  }
}
