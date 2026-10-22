import type { ReviewReport } from '../../shared/review/contracts.js';
interface ReviewState {
    report: ReviewReport | null;
    mode: string;
    base: string;
    head: string;
    profile: string;
    severity: string;
    query: string;
    showAcknowledged: boolean;
    aiText: string;
    error: string;
    aiMode?: boolean;
    source?: string;
    category?: string;
}
interface ReviewContext {
    scanId: string | null;
    scan: {
        files: {
            path: string;
        }[];
    };
    facts?: {
        importers?: Record<string, string[]>;
    };
    review: ReviewState;
}
export declare function stopReview(): void;
export declare function renderReviewView(container: HTMLElement, context: ReviewContext): void;
export {};
