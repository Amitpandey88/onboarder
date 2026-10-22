/** A stable, small snapshot for scripts and CI. It contains no source text. */
export interface RepositoryReport {
    schemaVersion: 1;
    repository: {
        name: string;
        root: string;
    };
    scan: {
        parsedFiles: number;
        skipped: number;
        partial: boolean;
        imports: {
            total: number;
            internal: number;
            external: number;
            unresolved: number;
            confidence: number;
        };
    };
    architecture: {
        entryPoints: string[];
        cycles: number;
        topHubs: Array<{
            path: string;
            importedBy: number;
        }>;
    };
    health: {
        grade: string;
        score: number;
        riskiestFiles: Array<{
            path: string;
            risk: number;
        }>;
    };
    security: {
        grade: string;
        findings: number;
    };
    testReachability: {
        reachable: number;
        sourceFiles: number;
        percent: number;
    };
}
interface RepositoryInput {
    name: string;
    root: string;
    scan: {
        stats: {
            filesParsed: number;
            skipped: number;
            truncated: unknown;
            imports: RepositoryReport['scan']['imports'];
        };
    };
    facts: {
        entries: string[];
        cycles: unknown[];
        hubs: Array<{
            path: string;
            fanIn: number;
        }>;
        testCoverage: {
            testedCount: number;
            totalNonTest: number;
            ratio: number;
        };
    };
    health: {
        grade: string;
        score: number;
        perFile: Array<{
            path: string;
            risk: number;
        }>;
    };
    security: {
        grade: string;
        total: number;
    };
}
export declare function createReport(repo: RepositoryInput): RepositoryReport;
export declare function formatReport(report: RepositoryReport): string;
export {};
