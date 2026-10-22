import type { ReviewFinding, ReviewReport } from './contracts.js';

export type FixStatus = 'proposed' | 'approved' | 'applied' | 'checks-pending' | 'verified-by-checks' | 'verification-failed' | 'inconclusive' | 'rejected' | 'stale' | 'rolled-back' | 'accepted';
export interface FixEdit { path: string; before: string; after: string; beforeHash: string; afterHash: string }
export interface FixProposal {
  schemaVersion: 1; id: string; workspaceId: string; finding: ReviewFinding; reviewFingerprint: string;
  revision: string; sourceFingerprint: string; digest: string; createdAt: string; expiresAt: string;
  status: FixStatus; edits: FixEdit[]; patch: string; rationale: string; sideEffects: string[];
  affectedDependencies: string[]; breakingChanges: string[]; tests: string[]; risk: 'low' | 'medium' | 'high';
  investigationRequired: boolean; limitations: string[];
  usage: { requests: number; contextBytes: number; inputTokens?: number; outputTokens?: number; durationMs: number };
  runId?: string;
}
export interface FixCheck {
  id: string; command: string; args: string[]; description: string;
  script?: string;
  definitionHash?: string;
}
export interface FixCheckPlan { digest: string; checks: FixCheck[]; notice: string }
export interface FixCheckReceipt {
  id: string; phase: 'baseline' | 'result'; status: 'passed' | 'failed' | 'skipped' | 'timed-out' | 'cancelled' | 'error';
  code: number | null; output: string; startedAt: string; durationMs: number;
  sourceBefore: string; sourceAfter: string | null; sourceChanged: boolean; commandDigest: string;
}
export interface FixComparison {
  before: ReviewReport; after: ReviewReport; noLongerDetected: ReviewFinding[];
  unresolved: ReviewFinding[]; introduced: ReviewFinding[];
  architecture: { before: unknown[]; after: unknown[]; introduced: unknown[]; status: string };
  explanation: string;
}
export interface FixRun {
  schemaVersion: 1; id: string; proposalId: string; proposalDigest: string; workspaceId: string;
  status: FixStatus; sourceRevision: string; sourceFingerprint: string; resultFingerprint?: string;
  workspace: string; branch: string; checkpointId?: string; checkpointDigest?: string; modifiedFiles: string[]; actualDiff: string;
  checks: FixCheckReceipt[]; checkPlan?: FixCheckPlan; comparison?: FixComparison;
  restoration: { at: string; restored: string[]; status: string; message: string }[];
  activity: { at: string; event: string }[]; message: string; acceptedAt?: string;
}
