import type { ReviewReport } from '../../shared/review/contracts.js';
export declare function showReviewEvidence(report: ReviewReport, id: string): boolean;
/** Render only the retained comparison; never fetch current source as evidence. */
export declare function showReviewPatch(report: ReviewReport, path: string, target?: number): boolean;
