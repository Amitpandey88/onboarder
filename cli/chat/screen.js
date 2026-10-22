import { graphemes, clusterCells, cells, clip } from './text.js';
import { terminalText } from '../agent/process.js';
/** Dividers are laid out at display time, so a resize never wraps their border. */
export function screenDivider(divider, columns) {
    const width = Math.max(1, Math.min(columns, divider.maxWidth || columns));
    const label = clip(divider.label, Math.max(0, width - 5));
    const text = width < 6 ? clip(divider.label || '─'.repeat(width), width)
        : (divider.edge === 'top' ? '╭─' : '╰─') + (label ? ' ' + label + ' ' : '')
            + '─'.repeat(width - 3 - (label ? cells(label) + 2 : 0)) + (divider.edge === 'top' ? '╮' : '╯');
    return divider.style ? divider.style(text) : text;
}
/** Keep only our text styling; wrap by terminal cells, including emoji and CJK. */
export function wrapScreenLine(text, columns) {
    const room = Math.max(1, columns), rows = [];
    let row = '', used = 0, style = '';
    for (const token of text.split(/(\x1b\[[\d;]*m)/g)) {
        if (/^\x1b\[[\d;]*m$/.test(token)) {
            row += token;
            style = token === '\x1b[0m' || token === '\x1b[m' ? '' : (style + token).slice(-512);
            continue;
        }
        for (const cluster of graphemes(terminalText(token).replace(/\t/g, '  ').replace(/[\r\n]/g, ' '))) {
            const size = clusterCells(cluster);
            if (used + size > room && used) {
                rows.push(row + (style ? '\x1b[0m' : ''));
                row = style;
                used = 0;
            }
            row += size > room ? '?' : cluster;
            used += Math.min(size, room);
        }
    }
    rows.push(row + (style ? '\x1b[0m' : ''));
    return rows;
}
/** Alternate-screen ownership, bounded transcript and updates of changed rows only. */
export class TerminalScreen {
    output;
    lines = [];
    bytes = 0;
    width = 0;
    wrapped = [];
    dirty = true;
    offset = 0;
    frame = [];
    columns = 0;
    active = false;
    pendingRows = 0;
    unreadLines = 0;
    constructor(output) {
        this.output = output;
    }
    get scrolled() { return this.offset > 0; }
    get unread() { return this.unreadLines; }
    latest() { this.offset = 0; this.pendingRows = 0; this.unreadLines = 0; }
    enter() {
        if (this.active)
            return;
        this.active = true;
        this.frame = [];
        this.columns = 0;
        this.output.write('\x1b[?1049h\x1b[2J\x1b[H');
    }
    leave() {
        if (!this.active)
            return;
        this.active = false;
        this.frame = [];
        this.output.write('\x1b[0m\x1b[?25h\x1b[?1049l');
    }
    append(text) {
        // Keep source and code whitespace, while bounding the in-memory viewport.
        // Complete conversations are still persisted by the controller.
        const lines = text.split(/\r?\n/);
        this.appendLines(lines);
    }
    appendDivider(divider) { this.appendLines([{ ...divider }]); }
    appendLines(lines) {
        if (this.offset)
            this.unreadLines += lines.length;
        if (this.offset && this.width)
            this.pendingRows += lines.reduce((n, line) => n + (typeof line === 'string' ? wrapScreenLine(line, this.width).length : 1), 0);
        for (const line of lines) {
            this.lines.push(line);
            this.bytes += Buffer.byteLength(typeof line === 'string' ? line : line.label);
        }
        while (this.lines.length > 4000 || this.bytes > 2 * 1024 * 1024) {
            const removed = this.lines.shift();
            this.bytes -= Buffer.byteLength(typeof removed === 'string' ? removed : removed.label);
        }
        this.dirty = true;
    }
    clear() { this.lines = []; this.bytes = 0; this.latest(); this.dirty = true; }
    reflow(columns) {
        if (!this.dirty && this.width === columns)
            return;
        this.wrapped = this.lines.flatMap(line => typeof line === 'string' ? wrapScreenLine(line, columns) : [screenDivider(line, columns)]);
        this.width = columns;
        this.dirty = false;
        this.offset += this.pendingRows;
        this.pendingRows = 0;
    }
    scroll(direction, columns, height) {
        this.reflow(columns);
        this.offset = Math.min(Math.max(0, this.wrapped.length - height), Math.max(0, this.offset + direction * Math.max(1, height - 2)));
        if (!this.offset)
            this.unreadLines = 0;
    }
    view(columns, height, welcome) {
        this.reflow(columns);
        this.offset = Math.min(this.offset, Math.max(0, this.wrapped.length - height));
        if (!this.offset)
            this.unreadLines = 0;
        if (!this.lines.length)
            return welcome.split('\n').flatMap(line => wrapScreenLine(line, columns)).slice(0, height);
        const end = Math.max(0, this.wrapped.length - this.offset);
        return this.wrapped.slice(Math.max(0, end - height), end);
    }
    draw(rows, columns, cursorRow, cursorColumn) {
        if (!this.active)
            return;
        let write = '';
        const resized = columns !== this.columns || rows.length !== this.frame.length;
        if (resized) {
            write += '\x1b[2J';
            this.frame = [];
            this.columns = columns;
        }
        rows.forEach((row, i) => {
            if (row !== this.frame[i])
                write += `\x1b[${i + 1};1H\x1b[2K` + row;
        });
        // Cursor placement remains stable through resizing, streamed output and menus.
        if (write)
            this.output.write('\x1b[?25l' + write + `\x1b[${cursorRow + 1};${cursorColumn + 1}H\x1b[?25h`);
        else
            this.output.write(`\x1b[${cursorRow + 1};${cursorColumn + 1}H`);
        this.frame = rows;
    }
}
//# sourceMappingURL=screen.js.map