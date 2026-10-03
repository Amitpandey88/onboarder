export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ReviewProfile = 'focused' | 'balanced' | 'thorough';
export type ReviewMode = 'working' | 'staged' | 'range';
export interface PatchLine { type: 'add' | 'del' | 'context'; text: string }
export interface PatchHunk { header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; heading: string; lines: PatchLine[] }
export interface PatchFile { oldPath: string; newPath: string; status: string; additions: number; deletions: number; hunks: PatchHunk[]; binary?: boolean; skipReason?: string }
export interface GitDiff { files: PatchFile[]; stats: { filesChanged: number; additions: number; deletions: number }; raw: string; base?: string; head?: string; mode?: ReviewMode; untracked?: number }
export interface ReviewConfig { profile: ReviewProfile; exclude: string[]; instructions: { path: string; instruction: string }[] }
export interface ReviewFinding { id: string; path: string; line: number; rule: string; severity: Severity; category: string; message: string; suggestion: string; excerpt: string }
export interface ReviewFile { path: string; oldPath: string; status: string; additions: number; deletions: number; kind: string; risk: 'high' | 'medium' | 'low'; findings: number; instructions: string[]; skipped: string | null }
export interface ReviewCheck { id: string; label: string; status: 'pass' | 'warn' | 'fail' | 'skip'; detail: string }
export interface ReviewReport { fingerprint: string; generatedAt: string; mode: ReviewMode; base: string; head: string; profile: ReviewProfile; summary: string; files: ReviewFile[]; findings: ReviewFinding[]; checks: ReviewCheck[]; stats: GitDiff['stats']; coverage: { reviewed: number; skipped: number; untracked: number; limitations: string[] } }
