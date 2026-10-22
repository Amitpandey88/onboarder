import type { FileSource, ScanOptions } from '../../shared/contracts.js';
import type { Evidence, IntelligenceConfig, IntelligenceReport, Snapshot } from '../../shared/intelligence/contracts.js';
import { scanRepo } from '../../shared/analyzer/scan.js';
import { computeFacts } from '../../shared/analyzer/graph.js';
import { detectManifest } from '../../shared/analyzer/services.js';
export declare const ANALYZER_VERSION = "intelligence-1";
export declare const hash: (text: string) => string;
export declare function evidenceText(source: string): string;
export declare function boundedSource(root: string, file: string, max?: number): Promise<string>;
export declare function gitRead(root: string, args: string[], signal?: AbortSignal): Promise<string>;
export declare function revisionOf(root: string): Promise<string>;
type Analysis = Awaited<ReturnType<typeof scanRepo>>;
export declare class IntelligenceWorkspace {
    readonly root: string;
    readonly cache: NonNullable<ScanOptions['analysisCache']>;
    texts: Map<string, string>;
    report: IntelligenceReport | null;
    scan: Analysis | null;
    repository: {
        scan: Analysis;
        facts: ReturnType<typeof computeFacts>;
        manifest: Awaited<ReturnType<typeof detectManifest>>;
    } | null;
    private pending;
    private semanticFingerprint;
    private semanticResult;
    constructor(root: string);
    refresh(options?: {
        signal?: AbortSignal;
        semantic?: boolean;
    }): Promise<IntelligenceReport>;
    private build;
    evidence(question: string, limit?: number): {
        fingerprint: string;
        revision: string;
        evidence: Evidence[];
        relatedTests: string[];
        limitations: string[];
    };
}
export declare function workspaceFor(root: string): Promise<IntelligenceWorkspace>;
/** Shared immutable commit/index source for intelligence and contextual review. */
export declare function revisionFileSource(root: string, ref: string, signal?: AbortSignal): Promise<{
    source: FileSource;
    texts: Map<string, string>;
    revision: string;
}>;
/** Read immutable Git objects without checkout, hooks, or repository scripts. */
export declare function revisionSnapshot(root: string, ref: string, config?: IntelligenceConfig, options?: {
    signal?: AbortSignal;
    maxFiles?: number;
}): Promise<Snapshot>;
export declare function compareRevisions(root: string, base: string, head: string): Promise<{
    base: string;
    head: string;
    addedConnections: string[];
    removedConnections: string[];
    introducedCycles: string[][];
    addedFiles: string[];
    removedFiles: string[];
    changedFiles: string[];
    removedExports: {
        path: string;
        name: string;
    }[];
    newViolations: import("../../shared/intelligence/contracts.js").RuleViolation[];
    securityDelta: number;
    before: Snapshot;
    after: Snapshot;
}>;
export declare function portfolioFor(roots: string[]): Promise<{
    repositories: {
        id: string;
        name: string;
        snapshot: any;
    }[];
    packageConnections: {
        fromRepository: any;
        fromPackage: any;
        toRepository: any;
        toPackage: any;
        range: any;
    }[];
    limitation: string;
}>;
export {};
