import type { ImportEdge, ScannedFile } from '../contracts.js';
import type { CoverageFile, CoverageReport, IntelligenceConfig, IntelligenceReport, Journey, PackageMap, RouteInfo, Snapshot } from './contracts.js';
export declare function relativePath(value: unknown): string;
export declare function parseIntelligenceConfig(input: unknown): IntelligenceConfig;
export declare const emptyIntelligenceConfig: () => IntelligenceConfig;
export declare function architectureViolations(edges: ImportEdge[], config: IntelligenceConfig): import("./contracts.js").RuleViolation[];
/** Measured execution data. Ambiguous paths and entity-bearing XML fail closed. */
export declare function parseCoverage(source: string): CoverageReport;
export declare function packageMap(texts: Map<string, string>): PackageMap;
export declare function detectRoutes(texts: Map<string, string>): RouteInfo[];
export declare function detectDataModels(texts: Map<string, string>): {
    path: string;
    line: number;
    name: string;
    kind: string;
}[];
export declare function ownersFor(file: string, codeowners: string): string[];
export declare function defaultJourneys(files: ScannedFile[], entries: string[]): Journey[];
export declare function compareSnapshots(before: Snapshot, after: Snapshot): {
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
    newViolations: import("./contracts.js").RuleViolation[];
    securityDelta: number;
};
export declare function impactReport(report: IntelligenceReport, file: string): {
    file: string;
    fingerprint: string;
    dependents: {
        path: string;
        via: string[];
    }[];
    suggestedTests: string[];
    measuredCoverage: CoverageFile;
    coverageStatus: "current" | "stale" | "unknown";
    symbolReferences: import("./contracts.js").SymbolReference[];
    limitation: string;
};
