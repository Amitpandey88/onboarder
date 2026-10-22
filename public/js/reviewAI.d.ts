import type { ReviewFinding, ReviewReport } from '../../shared/review/contracts.js';
/** Consume bounded progress frames; a disconnected stream is never a successful review. */
export declare function requestReview(body: Record<string, unknown>, signal: AbortSignal, progress: (phase: string) => void): Promise<ReviewReport>;
export declare function findingGroups(findings: ReviewFinding[], notes: Set<string>): string;
