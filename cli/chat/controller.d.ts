import { type AgentMode, type AgentEvent, type AgentResult } from '../agent/contracts.js';
import { runAgent, type RunnerOptions } from '../agent/runner.js';
import { ChatStore, type ChatRecord, type ChatSettings } from './store.js';
import { ChatSources } from './source.js';
import { type FileSelection } from './navigation.js';
export type ChatOutput = {
    type: 'message';
    text: string;
} | {
    type: 'start';
    prompt: string;
    mode: AgentMode;
} | {
    type: 'event';
    event: AgentEvent;
} | {
    type: 'end';
    result: AgentResult;
    elapsed: number;
} | {
    type: 'clear' | 'exit';
};
export interface ChatPorts {
    output: (event: ChatOutput) => void;
    run?: typeof runAgent;
    browse?: (name: string, args: string[], root: string, signal: AbortSignal) => Promise<string>;
    utility?: (name: ChatUtility, signal: AbortSignal) => Promise<string>;
    chooseModel?: (configure: boolean, signal: AbortSignal) => Promise<boolean>;
    chooseFile?: (root: string, query: string, signal: AbortSignal) => Promise<FileSelection | null>;
    chooseConversation?: (records: ChatRecord[], signal: AbortSignal) => Promise<string | null>;
    analysis?: (name: string, args: string[], root: string, signal: AbortSignal, checks: boolean) => Promise<{
        text: string;
        explain?: string;
    }>;
    store?: ChatStore;
    runner?: Omit<RunnerOptions, 'onEvent' | 'signal'>;
    sources?: ChatSources;
}
export type ChatUtility = 'doctor' | 'setup' | 'model' | 'tools' | 'runs';
export declare class ChatController {
    private ports;
    record: ChatRecord;
    lastResult: AgentResult | null;
    busy: boolean;
    closed: boolean;
    private abort;
    private paste;
    private store;
    private sources;
    constructor(settings: ChatSettings, ports: ChatPorts);
    get settings(): ChatSettings;
    get pasting(): boolean;
    get workspace(): string;
    private say;
    cancel(): void;
    close(): void;
    private persist;
    save(): Promise<boolean>;
    private resetContext;
    status(): string;
    accept(input: string): Promise<void>;
    private submit;
    private utility;
    private openSource;
    resume(id: string): Promise<void>;
    private run;
}
