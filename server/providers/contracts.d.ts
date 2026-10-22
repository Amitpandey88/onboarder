import type { PullRequest, PullFile, CheckSummary, ReviewSignal } from '../../shared/triage/contracts.js';
import type { ReviewReport } from '../../shared/review/contracts.js';
export interface ProviderPage<T> {
    items: T[];
    more: boolean;
    complete: boolean;
    limitations: string[];
}
/** Read-only, provider-neutral surface. Future adapters must implement and test real authentication/API behavior. */
export interface GitProvider {
    readonly repository: string;
    metadata(): Promise<{
        name: string;
        private: boolean;
        defaultBranch: string;
        permissions: Record<string, boolean> | null;
    }>;
    pulls(state: 'open' | 'closed' | 'all', page: number, limit: number): Promise<ProviderPage<PullRequest>>;
    pull(number: number): Promise<PullRequest>;
    files(number: number): Promise<ProviderPage<PullFile>>;
    checks(head: string): Promise<CheckSummary>;
    reviews(number: number, head: string): Promise<ReviewSignal>;
    document(path: string, revision: string): Promise<{
        path: string;
        revision: string;
        text: string;
        hash: string;
    } | null>;
    review(pull: PullRequest, files: ProviderPage<PullFile>): Promise<ReviewReport>;
    issue(number: number): Promise<{
        number: number;
        title: string;
        body: string;
        state: string;
    }>;
    comments(number: number): Promise<ProviderPage<{
        id: number;
        author: string;
        body: string;
        updatedAt: string;
    }>>;
    commit(revision: string): Promise<{
        revision: string;
        parents: string[];
    }>;
}
