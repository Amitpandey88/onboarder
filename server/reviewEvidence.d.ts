import type { GitDiff, ReviewConfig, ReviewConfiguration, ReviewReport } from '../shared/review/contracts.js';
/** Same fingerprint inputs and retained, redacted patch policy for local and GitHub reviews. */
export declare function retainReviewEvidence(report: ReviewReport, diff: GitDiff, config: ReviewConfig, configuration: ReviewConfiguration): ReviewReport;
