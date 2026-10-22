import { type AgentMode, type AgentResult } from '../agent/contracts.js';
export interface ChatSettings {
    root: string;
    sourceUrl?: string;
    mode: AgentMode;
    model?: string;
    provider?: string;
    checks: boolean;
    github: boolean;
    timeout: number;
    maxTurns: number;
    pr?: number;
    issue?: number;
    base?: string;
}
export interface ChatTurn {
    at: string;
    prompt: string;
    answer: string;
    run: string;
    status: AgentResult['status'];
}
export interface ChatRecord {
    schemaVersion: 1;
    id: string;
    createdAt: string;
    updatedAt: string;
    settings: ChatSettings;
    lastRun: string | null;
    turns: ChatTurn[];
}
export declare function newChat(settings: ChatSettings): ChatRecord;
export declare class ChatStore {
    readonly home: string;
    private env;
    constructor(home?: string, env?: NodeJS.ProcessEnv);
    get directory(): string;
    save(record: ChatRecord): Promise<void>;
    load(id: string): Promise<ChatRecord>;
    list(root: string): Promise<ChatRecord[]>;
    export(record: ChatRecord): Promise<string>;
}
export declare function historySummary(records: ChatRecord[]): string;
