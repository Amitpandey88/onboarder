import readline from 'node:readline';
import { type ChatTheme } from './render.js';
import { type TranscriptDivider } from './screen.js';
import { type SearchChoice } from './navigation.js';
export interface ComposerOptions {
    input: NodeJS.ReadStream;
    output: NodeJS.WriteStream;
    theme?: ChatTheme;
    state: () => {
        mode: string;
        status: string;
        busy: boolean;
        pasting: boolean;
        files: string[];
    };
    submit: (message: string) => void;
    cancel: () => void;
    exit: () => void;
    fullscreen?: boolean;
    welcome?: (columns: number, rows: number) => string;
    header?: () => string;
}
export interface PickerChoice extends SearchChoice {
}
export interface PickerOptions {
    title: string;
    hint?: string;
    choices: PickerChoice[];
    selected?: string;
    signal?: AbortSignal;
    query?: string;
    fuzzy?: boolean;
}
/** Raw-input composer with a full-screen viewport or an inline terminal footer. */
export declare class TerminalComposer {
    private options;
    value: string;
    private cursor;
    private selected;
    private dismissed;
    private history;
    private historyIndex;
    private draft;
    private actionDraft;
    private paste;
    private pasteCR;
    private suspended;
    private attached;
    private drawnRows;
    private cursorRow;
    private timer;
    private rawBefore;
    private theme;
    private screen;
    private viewHeight;
    private picker;
    private onKey;
    private onResize;
    constructor(options: ComposerOptions);
    get choosing(): boolean;
    start(): void;
    suspend(): void;
    close(): void;
    refresh(): void;
    print(text: string): void;
    divider(divider: TranscriptDivider): void;
    private question;
    clear(): void;
    choose(options: PickerOptions): Promise<string | null>;
    private pickerChoices;
    private commandPalette;
    private shortcut;
    private pickerKey;
    private erase;
    private replace;
    private insert;
    private suggestions;
    key(text: string, key?: readline.Key): void;
    private deleteNext;
    private render;
}
