import type { GithubClient } from '../../cli/agent/github.js';
import type { GitDiff, ReviewConfig, ReviewConfiguration } from '../../shared/review/contracts.js';
/** Stay on the allowlisted base repository. Never follow fork URLs or a mutable ref. */
export declare function githubReviewConfig(client: GithubClient, head: string): Promise<{
    config: ReviewConfig;
    configuration: ReviewConfiguration;
}>;
/** Preserve GitHub metadata and make absent or partial patches explicit per file. */
export declare function githubReviewDiff(items: unknown[], base: string, head: string): GitDiff;
