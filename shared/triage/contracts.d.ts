import type { ReviewReport } from '../review/contracts.js';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type QueueView = 'all' | 'immediate' | 'security' | 'waiting-review' | 'waiting-author' | 'failing-checks' | 'human-approval' | 'stale';
export interface PullRequest {
    provider: string;
    repository: string;
    number: number;
    title: string;
    author: string;
    url: string;
    state: 'open' | 'closed' | 'merged';
    draft: boolean;
    base: string;
    head: string;
    baseBranch: string;
    headBranch: string;
    updatedAt: string;
    createdAt: string;
    requestedReviewers: string[];
    additions: number | null;
    deletions: number | null;
    changedFiles: number | null;
    mergeable: boolean | null;
}
export interface PullFile {
    path: string;
    previousPath?: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
}
export interface CheckSignal {
    name: string;
    state: 'passed' | 'failed' | 'pending' | 'neutral';
    source: 'check-run' | 'commit-status';
}
export interface CheckSummary {
    revision: string;
    state: 'passed' | 'failed' | 'pending' | 'unknown';
    complete: boolean;
    checks: CheckSignal[];
    limitations: string[];
}
export interface ReviewSignal {
    state: 'approved' | 'changes-requested' | 'waiting' | 'outdated' | 'unknown';
    complete: boolean;
    reviewers: string[];
    limitations: string[];
}
export interface OwnershipSuggestions {
    revision: string;
    path: string | null;
    status: 'available' | 'missing' | 'partial' | 'unavailable';
    suggestions: {
        reviewer: string;
        paths: string[];
    }[];
    limitations: string[];
}
export interface ArchitectureSignal {
    status: 'available' | 'partial' | 'unavailable';
    base?: string;
    head: string;
    addedDependencies: number | null;
    removedDependencies: number | null;
    newCycles: number | null;
    boundaryViolations: number | null;
    affectedCallers: string[];
    relevantTests: string[];
    breakingExports: string[];
    limitations: string[];
}
export interface TriagePolicy {
    version: 1;
    thresholds: {
        P0: number;
        P1: number;
        P2: number;
    };
    staleDays: number;
    largeLines: number;
    largeFiles: number;
    weights: {
        critical: number;
        high: number;
        sensitive: number;
        large: number;
        dependency: number;
        architecture: number;
        breaking: number;
        failedCI: number;
        stale: number;
        incomplete: number;
        policy: number;
    };
}
export interface PriorityFactor {
    id: string;
    points: number;
    reason: string;
    paths?: string[];
}
export interface TriageItem {
    schemaVersion: 1;
    pull: PullRequest;
    inspected: boolean;
    observedAt: string;
    freshness: 'observed' | 'current' | 'stale';
    priority: Priority;
    score: number;
    provisional: boolean;
    factors: PriorityFactor[];
    missingSignals: string[];
    readiness: 'blocked' | 'unknown' | 'waiting-review' | 'human-approval' | 'closed';
    queues: QueueView[];
    checks: CheckSummary;
    reviews: ReviewSignal;
    owners: OwnershipSuggestions;
    architecture: ArchitectureSignal;
    files: PullFile[];
    report?: ReviewReport;
    limitations: string[];
    policy: {
        source: 'default' | 'base-commit';
        revision: string;
        hash?: string;
        value: TriagePolicy;
    };
    humanUrgency?: {
        priority: Priority;
        head: string;
        reason: string;
    };
}
export interface TriagePage {
    schemaVersion: 1;
    repository: string;
    page: number;
    limit: number;
    hasNext: boolean;
    observedAt: string;
    items: TriageItem[];
    coverage: {
        scope: 'one-provider-page';
        returned: number;
        complete: boolean;
        limitations: string[];
    };
}
export interface TriageExplanation {
    schemaVersion: 1;
    repository: string;
    number: number;
    head: string;
    status: 'completed' | 'failed' | 'stale';
    summary: string;
    claims: {
        text: string;
        evidenceIds: string[];
    }[];
    limitations: string[];
    usage: {
        requests: number;
        contextBytes: number;
        durationMs: number;
        inputTokens?: number;
        outputTokens?: number;
    };
}
