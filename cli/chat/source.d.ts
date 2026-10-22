import { runProcess } from '../agent/process.js';
export interface ChatSource {
    root: string;
    sourceUrl?: string;
    reused: boolean;
}
interface SourceOptions {
    env?: NodeJS.ProcessEnv;
    execute?: typeof runProcess;
}
export declare function isRemoteSource(value: string): boolean;
export declare function githubSource(value: string): {
    repository: string;
    url: string;
    gitUrl: string;
};
/** Persistent checkouts keep conversations and agent worktrees usable after exit. */
export declare class ChatSources {
    readonly home: string;
    private options;
    constructor(home?: string, options?: SourceOptions);
    get directory(): string;
    private target;
    private git;
    private verify;
    open(target: string, from?: string, signal?: AbortSignal, progress?: (text: string) => void): Promise<ChatSource>;
    pull(root: string, signal?: AbortSignal, progress?: (text: string) => void): Promise<string>;
}
export {};
