import type { ImportEdge, ScannedFile } from '../contracts.js';
import type { ObservedTelemetry } from './telemetry.js';

export interface Evidence { id: string; path: string; startLine: number; endLine: number; text: string; hash: string; reason: string }
export interface ArchitectureRule { id: string; from: string; forbid: string; message: string }
export interface KnowledgeNote { id: string; path: string; text: string; hash?: string; owner?: string }
export interface JourneyStep { id: string; title: string; path?: string; instruction: string }
export interface Journey { id: string; title: string; role: string; steps: JourneyStep[] }
export interface IntelligenceConfig {
  version: 1; rules: ArchitectureRule[]; baseline: string[];
  knowledge: KnowledgeNote[]; journeys: Journey[];
  coverage?: { path: string; revision?: string; metadata?: string; sourceFingerprint?: string };
  telemetry?: { path: string };
}
export interface RuleViolation { id: string; rule: string; from: string; to: string; message: string; baseline: boolean }
export interface CoverageFile { path: string; covered: number[]; uncovered: number[]; branchesCovered: number; branchesTotal: number }
export interface CoverageReport { format: 'lcov' | 'cobertura'; files: CoverageFile[] }
export interface PackageInfo { name: string; path: string; dependencies: Record<string, string>; scripts: string[] }
export interface PackageMap { packages: PackageInfo[]; edges: { from: string; to: string; range: string }[]; duplicateDeclarations: { name: string; ranges: string[] }[] }
export interface RouteInfo { path: string; line: number; method: string; route: string; handler: string; middleware: string[]; confidence: 'inferred' | 'declared' }
export interface Snapshot {
  schemaVersion: 1; id: string; createdAt: string; revision: string;
  fingerprint: string; sourceFingerprint?: string; configurationHash?: string; analyzerVersion: string; files: { path: string; hash: string; exports: string[] }[];
  edges: ImportEdge[]; cycles: string[][]; violations: RuleViolation[];
  metrics: { files: number; connections: number; unresolved: number; security: number; reused: number };
}
export interface SymbolReference { name: string; path: string; line: number; targetPath: string; targetLine: number; kind: 'reference' | 'call' }
export interface SemanticResult {
  available: boolean; reason?: string; engine?: string; truncated?: boolean;
  definitions: { name: string; path: string; line: number; kind: string }[];
  references: SymbolReference[];
}
export interface IntelligenceReport {
  snapshot: Snapshot; freshness: 'current' | 'changed-during-scan'; limitations: string[];
  packages: PackageMap; routes: RouteInfo[]; dataModels: { path: string; line: number; name: string; kind: string }[];
  rules: RuleViolation[]; journeys: Journey[];
  knowledge: (KnowledgeNote & { stale: boolean; owners: string[] })[];
  coverage: { status: 'current' | 'stale' | 'unknown'; reason: string; report?: CoverageReport };
  semantic: SemanticResult; scanFiles: Pick<ScannedFile, 'path' | 'lang' | 'loc'>[];
  telemetry: { status: 'imported' | 'unavailable'; reason: string; observed?: ObservedTelemetry };
}
export interface WorkspaceState {
  activeTopic?: string;
  schemaVersion: 1; notes: Record<string, string>; completed: string[]; bookmarks: string[];
  questions: { question: string; answer: string; fingerprint: string; createdAt: string; revision?: string; evidence?: Evidence[]; topic?: string }[];
  findings: Record<string, { status: 'confirmed' | 'dismissed' | 'fixed'; reason: string; expiresAt?: string }>;
  view?: { name: string; path: string; filter: string };
}
