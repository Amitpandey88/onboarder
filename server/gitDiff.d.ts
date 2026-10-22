import type { GitDiff, ReviewMode } from '../shared/review/contracts.js';
export interface DiffOptions {
    base?: string;
    head?: string;
    file?: string;
    mode?: ReviewMode;
    includeUntracked?: boolean;
    signal?: AbortSignal;
}
export declare class GitDiffError extends Error {
    status: number;
    constructor(message: string, status?: number);
}
/** Read only the root configuration blob; never check out or execute repository content. */
export declare function gitReviewConfig(root: string, revision: string, signal?: AbortSignal): Promise<{
    text?: string;
    blob?: string;
}>;
export declare function getGitRefs(root: string): Promise<{
    reason?: undefined;
    available: boolean;
    branches: string[];
    tags: string[];
    current: string;
    commits: {
        hash: string;
        short: string;
        message: string;
        author: string;
        date: string;
    }[];
} | {
    branches?: undefined;
    tags?: undefined;
    current?: undefined;
    commits?: undefined;
    available: boolean;
    reason: string;
}>;
export declare function getGitDiff(root: string, options?: DiffOptions): Promise<GitDiff>;
export declare function parseUnifiedDiff(diffText: string): GitDiff;
