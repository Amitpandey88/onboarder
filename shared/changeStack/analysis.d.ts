import type { ChangeStackInput, ChangeStackReport } from './contracts.js';
/** Build the deterministic Change Stack from two immutable snapshots plus the captured exact diff. */
export declare function buildChangeStack(input: ChangeStackInput): ChangeStackReport;
