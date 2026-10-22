import { GithubClient } from '../../cli/agent/github.js';
import type { GitProvider, ProviderPage } from './contracts.js';
import type { PullRequest, PullFile, CheckSummary, ReviewSignal } from '../../shared/triage/contracts.js';
export declare const record: (v: unknown) => Record<string, any>;
export declare const exactSha: (v: unknown) => string;
/** Enforces a request/byte ceiling across source, review and pagination helpers. */
declare class ReadOnlyBudget extends GithubClient {
    private delegate;
    requests: number;
    bytes: number;
    constructor(delegate: GithubClient);
    request(route: string, method?: string, body?: unknown): Promise<{
        data: unknown;
        more: boolean;
    }>;
}
export declare class GithubProvider implements GitProvider {
    readonly api: ReadOnlyBudget;
    readonly repository: string;
    private source;
    constructor(client: GithubClient);
    private normalizePull;
    metadata(): Promise<{
        name: any;
        private: boolean;
        defaultBranch: string;
        permissions: {
            [k: string]: boolean;
        };
    }>;
    pulls(state: 'open' | 'closed' | 'all', page: number, limit: number): Promise<{
        items: PullRequest[];
        more: boolean;
        complete: boolean;
        limitations: string[];
    }>;
    pull(number: number): Promise<PullRequest>;
    files(number: number): Promise<ProviderPage<PullFile>>;
    document(file: string, revision: string): Promise<{
        path: string;
        revision: string;
        text: string;
        hash: string;
    }>;
    checks(head: string): Promise<CheckSummary>;
    reviews(number: number, head: string): Promise<ReviewSignal>;
    review(pull: PullRequest, files: ProviderPage<PullFile>): Promise<import("../../shared/review/contracts.js").ReviewReport>;
    issue(number: number): Promise<{
        number: number;
        title: string;
        body: string;
        state: string;
    }>;
    comments(number: number): Promise<{
        items: {
            id: number;
            author: string;
            body: string;
            updatedAt: string;
        }[];
        more: boolean;
        complete: boolean;
        limitations: string[];
    }>;
    commit(revision: string): Promise<{
        revision: string;
        parents: string[];
    }>;
}
export declare function safeProviderError(error: unknown): string;
export {};
