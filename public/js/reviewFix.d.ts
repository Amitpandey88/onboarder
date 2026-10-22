import type { ReviewReport } from '../../shared/review/contracts.js';
export declare function stopFixPanel(): void;
export declare function showFixPanel(scanId: string, report: ReviewReport | null, findingId?: string, limits?: Record<string, number>): void;
