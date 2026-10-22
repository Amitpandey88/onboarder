import type { ChatOutput } from './controller.js';
import type { ChatSettings } from './store.js';
import { type TranscriptDivider } from './screen.js';
export interface ChatTheme {
    accent: (text: string) => string;
    muted: (text: string) => string;
    strong: (text: string) => string;
    success: (text: string) => string;
    error: (text: string) => string;
    status?: (text: string) => string;
    selection?: (text: string) => string;
}
export declare const plainTheme: ChatTheme;
export interface BannerInfo {
    model?: string;
    provider?: string;
    tools?: number;
    session?: string;
    rows?: number;
    fullscreen?: boolean;
    indexedFiles?: number;
    catalog?: {
        name: string;
        description: string;
    }[];
}
export interface StatusInfo {
    model: string;
    repo: string;
    busy: boolean;
    elapsed: number;
    activity?: string;
    calls: number;
    tokens?: number;
    turns: number;
    tools: number;
}
export declare function chatStatus(settings: ChatSettings, columns: number, info: StatusInfo): string;
export declare function chatBanner(settings: ChatSettings, columns?: number, theme?: ChatTheme, version?: string, info?: BannerInfo): string;
/** Writes only new output, leaving terminal scrollback and pasted code intact. */
export declare class ChatRenderer {
    private write;
    private theme;
    private env;
    private layout;
    private pending;
    private segment;
    private code;
    private streamed;
    private replyOpen;
    constructor(write: (text: string) => void, theme?: ChatTheme, env?: NodeJS.ProcessEnv, layout?: {
        columns?: () => number;
        divider?: (divider: TranscriptDivider) => void;
    });
    private safe;
    private divider;
    private line;
    private flush;
    finish(): void;
    handle(output: ChatOutput): void;
}
