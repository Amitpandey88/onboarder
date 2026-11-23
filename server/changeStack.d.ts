import type { ChangeStackResult } from '../shared/changeStack/contracts.js';
export interface ChangeStackOptions {
    base: string;
    head: string;
    semantic?: boolean;
    signal?: AbortSignal;
}
/**
 * Compare two immutable Git revisions and attach the exact Review evidence.
 * The Review snapshot is the source of patch text, stats and skipped-file reasons,
 * so Change Stack never presents a second, differently-bounded diff.
 */
export declare function changeStack(root: string, options: ChangeStackOptions): Promise<ChangeStackResult>;
