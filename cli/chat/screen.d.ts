export interface TranscriptDivider {
    label: string;
    edge: 'top' | 'bottom';
    style?: (text: string) => string;
    maxWidth?: number;
}
/** Dividers are laid out at display time, so a resize never wraps their border. */
export declare function screenDivider(divider: TranscriptDivider, columns: number): string;
/** Keep only our text styling; wrap by terminal cells, including emoji and CJK. */
export declare function wrapScreenLine(text: string, columns: number): string[];
/** Alternate-screen ownership, bounded transcript and updates of changed rows only. */
export declare class TerminalScreen {
    private output;
    private lines;
    private bytes;
    private width;
    private wrapped;
    private dirty;
    private offset;
    private frame;
    private columns;
    private active;
    private pendingRows;
    private unreadLines;
    constructor(output: NodeJS.WriteStream);
    get scrolled(): boolean;
    get unread(): number;
    latest(): void;
    enter(): void;
    leave(): void;
    append(text: string): void;
    appendDivider(divider: TranscriptDivider): void;
    private appendLines;
    clear(): void;
    private reflow;
    scroll(direction: number, columns: number, height: number): void;
    view(columns: number, height: number, welcome: string): string[];
    draw(rows: string[], columns: number, cursorRow: number, cursorColumn: number): void;
}
