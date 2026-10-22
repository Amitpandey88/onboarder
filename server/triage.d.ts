import type { GitProvider } from './providers/contracts.js';
import type { PullRequest, TriageItem, TriagePage } from '../shared/triage/contracts.js';
export declare function localGithubRepository(root: string, signal?: AbortSignal): Promise<string>;
export declare function observedPull(pull: PullRequest, now?: number): TriageItem;
export declare function listTriage(provider: GitProvider, options?: {
    state?: 'open' | 'closed' | 'all';
    page?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<TriagePage>;
export declare function inspectTriage(provider: GitProvider, number: number, options?: {
    root?: string;
    signal?: AbortSignal;
    humanUrgency?: TriageItem['humanUrgency'];
}): Promise<TriageItem>;
