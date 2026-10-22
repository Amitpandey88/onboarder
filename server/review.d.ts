import type { DiffOptions } from './gitDiff.js';
import type { ReviewProfile } from '../shared/review/contracts.js';
export declare function runReview(root: string, options?: DiffOptions & {
    profile?: ReviewProfile;
}): Promise<import("../shared/review/contracts.js").ReviewReport>;
