import type { ReviewContext, ReviewLimits } from '../shared/review/aiContracts.js';
import type { ReviewReport } from '../shared/review/contracts.js';
export declare const DEFAULT_AI_LIMITS: Readonly<ReviewLimits>;
export declare function reviewLimits(input?: unknown): ReviewLimits;
export declare function changedLines(report: ReviewReport, path: string): number[];
export declare function collectReviewContext(root: string, report: ReviewReport, limits: ReviewLimits, signal?: AbortSignal): Promise<{
    context: ReviewContext;
    assertCurrent: () => Promise<void>;
}>;
