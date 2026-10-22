import type { RunManifest } from './contracts.js';
import type { FixCheck, FixCheckPlan, FixCheckReceipt } from '../../shared/review/fixContracts.js';
/** Definitions are displayed and approved by the operator; model text is never a command. */
export declare function fixCheckPlan(root: string): Promise<FixCheckPlan>;
export declare function executeFixCheck(manifest: RunManifest, check: FixCheck, phase: FixCheckReceipt['phase'], options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
}): Promise<FixCheckReceipt>;
