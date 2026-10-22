import type { FixRun, FixProposal } from '../shared/review/fixContracts.js';
import type { AIReviewOptions } from './reviewAI.js';
import { FixStore } from './fixStore.js';
export interface FixIdentity {
    root: string;
    owner: string;
    store?: FixStore;
}
export declare function showFixProposal(identity: FixIdentity, id: string): Promise<FixProposal>;
export declare function fixStatus(identity: FixIdentity, id: string): Promise<FixRun>;
export declare function rejectFix(identity: FixIdentity, id: string, digest: string): Promise<FixProposal>;
/** Approval is consumed before mutation; replay never starts a second application. */
export declare function applyFix(identity: FixIdentity, id: string, digest: string, signal?: AbortSignal, onProgress?: (run: FixRun) => void): Promise<FixRun>;
export declare function verifyFix(identity: FixIdentity, id: string, permission?: {
    allowChecks?: boolean;
    trustWorktree?: boolean;
    checkDigest?: string;
    checks?: string[];
    timeoutMs?: number;
    ai?: AIReviewOptions;
}, signal?: AbortSignal): Promise<FixRun>;
export declare function rollbackFix(identity: FixIdentity, id: string): Promise<FixRun>;
export declare function acceptFix(identity: FixIdentity, id: string, fingerprint: string): Promise<FixRun>;
