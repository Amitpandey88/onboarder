import { graphemes, clusterCells } from './text.js';
import { terminalText } from '../agent/process.js';

/** Keep only our text styling; wrap by terminal cells, including emoji and CJK. */
export function wrapScreenLine(text: string, columns: number): string[] {
  const room = Math.max(1, columns), rows: string[] = [];
  let row = '', used = 0, style = '';
  for (const token of text.split(/(\x1b\[[\d;]*m)/g)) {
    if (/^\x1b\[[\d;]*m$/.test(token)) {
      row += token;
      style = token === '\x1b[0m' || token === '\x1b[m' ? '' : (style + token).slice(-512);
      continue;
    }
    for (const cluster of graphemes(terminalText(token).replace(/\t/g, '  ').replace(/[\r\n]/g, ' '))) {
      const size = clusterCells(cluster);
      if (used + size > room && used) { rows.push(row + (style ? '\x1b[0m' : '')); row = style; used = 0; }
      row += size > room ? '?' : cluster; used += Math.min(size, room);
    }
  }
  rows.push(row + (style ? '\x1b[0m' : ''));
  return rows;
}

/** Alternate-screen ownership, bounded transcript and updates of changed rows only. */
export class TerminalScreen {
  private lines: string[] = [];
  private bytes = 0;
  private width = 0;
  private wrapped: string[] = [];
  private dirty = true;
  private offset = 0;
  private frame: string[] = [];
  private columns = 0;
  private active = false;
  private pendingRows = 0;
  constructor(private output: NodeJS.WriteStream) {}
  get scrolled() { return this.offset > 0; }
  enter() {
    if (this.active) return;
    this.active = true; this.frame = []; this.columns = 0;
    this.output.write('\x1b[?1049h\x1b[2J\x1b[H');
  }
  leave() {
    if (!this.active) return;
    this.active = false; this.frame = [];
    this.output.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  }
  append(text: string) {
    // Keep source and code whitespace, while bounding the in-memory viewport.
    // Complete conversations are still persisted by the controller.
    const lines = text.split(/\r?\n/);
    if (this.offset && this.width) this.pendingRows += lines.reduce((n, line) => n + wrapScreenLine(line, this.width).length, 0);
    for (const line of lines) { this.lines.push(line); this.bytes += Buffer.byteLength(line); }
    while (this.lines.length > 4000 || this.bytes > 2 * 1024 * 1024) this.bytes -= Buffer.byteLength(this.lines.shift()!);
    this.dirty = true;
  }
  clear() { this.lines = []; this.bytes = 0; this.offset = 0; this.pendingRows = 0; this.dirty = true; }
  private reflow(columns: number) {
    if (!this.dirty && this.width === columns) return;
    this.wrapped = this.lines.flatMap(line => wrapScreenLine(line, columns));
    this.width = columns; this.dirty = false;
    this.offset += this.pendingRows; this.pendingRows = 0;
  }
  scroll(direction: number, columns: number, height: number) {
    this.reflow(columns);
    this.offset = Math.min(Math.max(0, this.wrapped.length - height), Math.max(0, this.offset + direction * Math.max(1, height - 2)));
  }
  view(columns: number, height: number, welcome: string): string[] {
    this.reflow(columns);
    this.offset = Math.min(this.offset, Math.max(0, this.wrapped.length - height));
    if (!this.lines.length) return welcome.split('\n').flatMap(line => wrapScreenLine(line, columns)).slice(0, height);
    const end = Math.max(0, this.wrapped.length - this.offset);
    return this.wrapped.slice(Math.max(0, end - height), end);
  }
  draw(rows: string[], columns: number, cursorRow: number, cursorColumn: number) {
    if (!this.active) return;
    let write = '';
    const resized = columns !== this.columns || rows.length !== this.frame.length;
    if (resized) { write += '\x1b[2J'; this.frame = []; this.columns = columns; }
    rows.forEach((row, i) => {
      if (row !== this.frame[i]) write += `\x1b[${i + 1};1H\x1b[2K` + row;
    });
    // Cursor placement remains stable through resizing, streamed output and menus.
    if (write) this.output.write('\x1b[?25l' + write + `\x1b[${cursorRow + 1};${cursorColumn + 1}H\x1b[?25h`);
    else this.output.write(`\x1b[${cursorRow + 1};${cursorColumn + 1}H`);
    this.frame = rows;
  }
}
