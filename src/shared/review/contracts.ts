import type { AIReview, ReviewCitation } from './aiContracts.js';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ReviewProfile = 'focused' | 'balanced' | 'thorough';
export type ReviewMode = 'working' | 'staged' | 'range';
export interface PatchLine { type: 'add' | 'del' | 'context'; text: string }
export interface PatchHunk { header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; heading: string; lines: PatchLine[] }
export interface PatchFile { oldPath: string; newPath: string; status: string; additions: number; deletions: number; hunks: PatchHunk[]; binary?: boolean; skipReason?: string }
export interface GitDiff { files: PatchFile[]; stats: { filesChanged: number; additions: number; deletions: number }; raw: string; base?: string; head?: string; mode?: ReviewMode; untracked?: number }
export interface ReviewConfig { profile: ReviewProfile; exclude: string[]; instructions: { path: string; instruction: string }[] }
/** Captured static evidence, never a claim that a finding was reproduced by execution. */
export interface ReviewEvidence {
  source: 'git-diff' | 'github-pr-patch';
  analyzer: 'onboarder-patterns/v1' | 'onboarder-contextual/v1';
  method: 'static-pattern' | 'model-inference';
  base: string; head: string; mode: ReviewMode;
  freshness: 'captured' | 'current' | 'stale';
  observedAt: string;
}
export interface ReviewConfiguration {
  source: 'working-tree' | 'index' | 'commit';
  status: 'present' | 'missing';
  revision?: string;
  blob?: string;
  profileOverride?: ReviewProfile;
}
export interface ReviewFinding {
  id: string; path: string; line: number; rule: string; severity: Severity; category: string; message: string; suggestion: string; excerpt: string; evidence?: ReviewEvidence;
  source?: 'static' | 'ai'; title?: string; impact?: string; confidence?: 'high' | 'medium' | 'low'; confidenceReason?: string;
  relatedEvidence?: ReviewCitation[]; engine?: string; revision?: string; sourceFingerprint?: string;
  verification?: 'static-pattern' | 'evidence-validated';
}
export interface ReviewFile { path: string; oldPath: string; status: string; additions: number; deletions: number; kind: string; risk: 'high' | 'medium' | 'low'; findings: number; instructions: string[]; skipped: string | null }
export interface ReviewCheck { id: string; label: string; status: 'pass' | 'warn' | 'fail' | 'skip'; detail: string }
export interface ReviewComparison { base: string; head: string; mode: ReviewMode; files: PatchFile[] }
export interface ReviewReport { schemaVersion?: 2; ai?: AIReview; comparison?: ReviewComparison; evidence?: ReviewEvidence; configuration?: ReviewConfiguration; fingerprint: string; generatedAt: string; mode: ReviewMode; base: string; head: string; profile: ReviewProfile; summary: string; files: ReviewFile[]; findings: ReviewFinding[]; checks: ReviewCheck[]; stats: GitDiff['stats']; coverage: { reviewed: number; skipped: number; untracked: number; limitations: string[]; status?: 'complete' | 'partial'; expectedFiles?: number } }
