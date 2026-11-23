import type { Snapshot, SemanticResult } from '../intelligence/contracts.js';
import type { PatchFile, ReviewReport } from '../review/contracts.js';

export type ChangeGroupId = 'contracts' | 'architecture' | 'implementation' | 'tests' | 'documentation' | 'configuration' | 'other';
export type ChangeMovement = 'none' | 'renamed' | 'moved' | 'renamed-moved';
export interface ChangeStackFile {
  id: string;
  oldPath: string;
  newPath: string;
  status: string;
  movement: ChangeMovement;
  movementEvidence: string[];
  groupId: ChangeGroupId;
  additions: number;
  deletions: number;
  exportsAdded: string[];
  exportsRemoved: string[];
  semanticChangeIds: string[];
  patchAvailable: boolean;
  patchSkipped: string[];
}
export interface ChangeStackInput {
  before: Snapshot;
  after: Snapshot;
  patches: PatchFile[];
  semantic?: { before: SemanticResult; after: SemanticResult };
  generatedAt?: string;
}
export interface ChangeStackGroup {
  id: ChangeGroupId;
  title: string;
  explanation: string;
  reviewFocus: string;
  fileIds: string[];
}
export interface ChangeStackSymbolChange {
  id: string;
  name: string;
  previousName?: string;
  symbolKind: string;
  kind: Exclude<ChangeMovement, 'none'>;
  before: { path: string; line: number };
  after: { path: string; line: number };
  confidence: 'compiler-supported' | 'candidate';
  explanation: string;
  references: { path: string; beforeLine?: number; afterLine?: number }[];
}
export interface ChangeStackOverlayNode {
  id: string;
  fileId?: string;
  beforePath: string | null;
  afterPath: string | null;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'moved' | 'renamed-moved' | 'unchanged';
}
export interface ChangeStackOverlayEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  status: 'added' | 'removed' | 'unchanged';
}
export interface ChangeStackOverlay {
  nodes: ChangeStackOverlayNode[];
  edges: ChangeStackOverlayEdge[];
  truncated: boolean;
  totalNodes: number;
  totalEdges: number;
}
export interface ChangeArchitectureDelta {
  base: string;
  head: string;
  addedConnections: string[];
  removedConnections: string[];
  introducedCycles: string[][];
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
  removedExports: { path: string; name: string }[];
  newViolations: { id: string; rule: string; from: string; to: string; message: string; baseline: boolean }[];
  securityDelta: number;
}
export interface ChangeStackReport {
  schemaVersion: 1;
  generatedAt: string;
  base: string;
  head: string;
  summary: {
    files: number;
    additions: number;
    deletions: number;
    fileMoves: number;
    symbolChanges: number;
    affectedCallers: number;
    relatedTests: number;
  };
  files: ChangeStackFile[];
  groups: ChangeStackGroup[];
  symbolChanges: ChangeStackSymbolChange[];
  architecture: ChangeArchitectureDelta;
  overlay: ChangeStackOverlay;
  impact: { affectedCallers: string[]; relatedTests: string[] };
  semantic: {
    requested: boolean;
    status: 'not-requested' | 'available' | 'partial' | 'unavailable';
    engine?: string;
    reasons: string[];
  };
  coverage: { status: 'complete' | 'partial'; limitations: string[] };
  limitations: string[];
}
export interface ChangeStackResult extends ChangeStackReport {
  /** The same exact-range report used by Review and its captured patch dialogs. */
  review: ReviewReport;
}
