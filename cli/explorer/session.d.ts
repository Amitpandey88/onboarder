import type { ScanOptions } from '../../shared/contracts.js';
export declare function isGitUrl(target: any): boolean;
export declare function openRepoOrClone(target: string, options?: ScanOptions): Promise<{
    root: string;
    name: any;
    scan: {
        root: string;
        name: any;
        scannedAt: string;
        stats: {
            reused: number;
            filesTotal: number;
            filesParsed: number;
            skipped: number;
            skips: {
                ignored: number;
                vendorDir: number;
                notSource: number;
                listFailed: number;
                notCode: number;
                readFailed: number;
                tooLarge: number;
                analyzeFailed: number;
            };
            truncated: any;
            edgeCount: number;
            imports: {
                total: number;
                internal: number;
                external: number;
                unresolved: number;
                confidence: number;
                worst: any[];
            };
            tookMs: number;
            languages: Record<string, number>;
            languageLoc: Record<string, number>;
        };
        allFiles: string[];
        files: import("../../shared/contracts.js").ScannedFile[];
        edges: import("../../shared/contracts.js").ImportEdge[];
        externals: {
            name: any;
            usedBy: any[];
        }[];
        folders: {
            path: string;
            name: string;
            depth: number;
            fileCount: number;
            loc: number;
            comment: number;
            blank: number;
            size: number;
            langs: Record<string, number>;
            hasReadme: boolean;
            docRatio: number;
        }[];
        workflows: any[];
        sbom: any;
        license: any;
        licenseReport: any;
    } & {
        tempId?: string;
        gitUrl?: string;
    };
    facts: {
        communities: {
            id: any;
            members: any;
            size: any;
        }[];
        betweenness: {
            [k: string]: number;
        };
        betweennessExact: boolean;
        fanIn: any;
        fanOut: any;
        importers: any;
        importsOf: any;
        entries: any;
        hubs: any;
        orphans: any;
        cycles: any[];
        inCycle: unknown[];
        deadExports: any[];
        testCoverage: {
            testedCount: number;
            totalNonTest: any;
            ratio: number;
        };
        untestedHubs: any;
        depsDrift: {
            unusedDeclared: string[];
            undeclaredImported: string[];
        };
        folderEdges: {
            from: any;
            to: any;
            count: any;
        }[];
        entrySet: any;
    };
    manifest: import("../../shared/contracts.js").Manifest;
    searchIndex: {
        index: Map<any, any>;
        docCounts: Map<any, any>;
        totalDocs: number;
        totalBytes: number;
        skipped: {
            tooLarge: number;
            overCap: number;
            readFailed: number;
            binary: number;
            noTokens: number;
        };
        cap: {
            maxFileBytes: number;
            maxTotalBytes: number;
        };
    };
    layers: {
        layers: any[];
        unreachable: any;
        seeds: any;
    };
    coupling: {
        folders: any[];
        counts: Map<any, any>;
        max: number;
    };
    health: {
        score: number;
        grade: string;
        perFile: any[];
        breakdown: any[];
        blastExact: boolean;
        totals: {
            crit: number;
            high: number;
            avgCx: number;
            orphanRatio: number;
            cycles: number;
        };
        techDebtRatio?: undefined;
        effortHours?: undefined;
        debtCategory?: undefined;
    } | {
        score: number;
        grade: string;
        perFile: any;
        breakdown: any[];
        blastExact: boolean;
        totals: {
            crit: any;
            high: any;
            avgCx: number;
            orphanRatio: number;
            cycles: any;
        };
        techDebtRatio: number;
        effortHours: number;
        debtCategory: string;
    };
    patterns: any[];
    security: {
        counts: {
            critical: number;
            high: number;
            medium: number;
            low: number;
            info: number;
        };
        byCat: Record<string, any>;
        files: any[];
        score: number;
        grade: string;
        total: any;
    };
    stack: {
        languages: Record<string, any>;
        pm: any[];
        items: any[];
    };
    tour: any[];
    languages: {
        id: string;
        loc: unknown;
        label: string;
    }[];
} & {
    gitUrl?: string;
    cloneDir?: string;
    tempId?: string;
}>;
export declare function remoteUrlFor(repo: any): Promise<any>;
export declare function closeRemote(repo: any): Promise<void>;
export declare function openRepo(target?: string, options?: ScanOptions): Promise<{
    root: string;
    name: any;
    scan: {
        root: string;
        name: any;
        scannedAt: string;
        stats: {
            reused: number;
            filesTotal: number;
            filesParsed: number;
            skipped: number;
            skips: {
                ignored: number;
                vendorDir: number;
                notSource: number;
                listFailed: number;
                notCode: number;
                readFailed: number;
                tooLarge: number;
                analyzeFailed: number;
            };
            truncated: any;
            edgeCount: number;
            imports: {
                total: number;
                internal: number;
                external: number;
                unresolved: number;
                confidence: number;
                worst: any[];
            };
            tookMs: number;
            languages: Record<string, number>;
            languageLoc: Record<string, number>;
        };
        allFiles: string[];
        files: import("../../shared/contracts.js").ScannedFile[];
        edges: import("../../shared/contracts.js").ImportEdge[];
        externals: {
            name: any;
            usedBy: any[];
        }[];
        folders: {
            path: string;
            name: string;
            depth: number;
            fileCount: number;
            loc: number;
            comment: number;
            blank: number;
            size: number;
            langs: Record<string, number>;
            hasReadme: boolean;
            docRatio: number;
        }[];
        workflows: any[];
        sbom: any;
        license: any;
        licenseReport: any;
    } & {
        tempId?: string;
        gitUrl?: string;
    };
    facts: {
        communities: {
            id: any;
            members: any;
            size: any;
        }[];
        betweenness: {
            [k: string]: number;
        };
        betweennessExact: boolean;
        fanIn: any;
        fanOut: any;
        importers: any;
        importsOf: any;
        entries: any;
        hubs: any;
        orphans: any;
        cycles: any[];
        inCycle: unknown[];
        deadExports: any[];
        testCoverage: {
            testedCount: number;
            totalNonTest: any;
            ratio: number;
        };
        untestedHubs: any;
        depsDrift: {
            unusedDeclared: string[];
            undeclaredImported: string[];
        };
        folderEdges: {
            from: any;
            to: any;
            count: any;
        }[];
        entrySet: any;
    };
    manifest: import("../../shared/contracts.js").Manifest;
    searchIndex: {
        index: Map<any, any>;
        docCounts: Map<any, any>;
        totalDocs: number;
        totalBytes: number;
        skipped: {
            tooLarge: number;
            overCap: number;
            readFailed: number;
            binary: number;
            noTokens: number;
        };
        cap: {
            maxFileBytes: number;
            maxTotalBytes: number;
        };
    };
    layers: {
        layers: any[];
        unreachable: any;
        seeds: any;
    };
    coupling: {
        folders: any[];
        counts: Map<any, any>;
        max: number;
    };
    health: {
        score: number;
        grade: string;
        perFile: any[];
        breakdown: any[];
        blastExact: boolean;
        totals: {
            crit: number;
            high: number;
            avgCx: number;
            orphanRatio: number;
            cycles: number;
        };
        techDebtRatio?: undefined;
        effortHours?: undefined;
        debtCategory?: undefined;
    } | {
        score: number;
        grade: string;
        perFile: any;
        breakdown: any[];
        blastExact: boolean;
        totals: {
            crit: any;
            high: any;
            avgCx: number;
            orphanRatio: number;
            cycles: any;
        };
        techDebtRatio: number;
        effortHours: number;
        debtCategory: string;
    };
    patterns: any[];
    security: {
        counts: {
            critical: number;
            high: number;
            medium: number;
            low: number;
            info: number;
        };
        byCat: Record<string, any>;
        files: any[];
        score: number;
        grade: string;
        total: any;
    };
    stack: {
        languages: Record<string, any>;
        pm: any[];
        items: any[];
    };
    tour: any[];
    languages: {
        id: string;
        loc: unknown;
        label: string;
    }[];
} & {
    gitUrl?: string;
    cloneDir?: string;
    tempId?: string;
}>;
export declare function resolveTarget(repo: any, typed: any): {
    error: string;
    file?: undefined;
    folder?: undefined;
    candidates?: undefined;
} | {
    error?: undefined;
    file: any;
    folder?: undefined;
    candidates?: undefined;
} | {
    error?: undefined;
    file?: undefined;
    folder: any;
    candidates?: undefined;
} | {
    file?: undefined;
    folder?: undefined;
    error: string;
    candidates: any;
};
export declare function readRepoFile(repo: any, repoPath: any): Promise<string>;
export declare function searchRepo(repo: any, query: any, { limit }?: Record<string, any>): {
    results: any[];
    total: number;
    indexed: any;
    capped: boolean;
    advanced: any;
    query: {
        terms: any;
        phrases: any;
        negatives: any;
        exts: any;
        paths: any;
        kinds: any;
        isTest: any;
        isSource: any;
        regex: string;
        caseSensitive: any;
        advanced: any;
    };
    error: any;
    stats: {
        bytes: any;
        skipped: any;
        cap: any;
    };
};
export declare function lineNumber(value: any, fallback: any): any;
export declare function explainRepoFile(repo: any, file: any): string;
export declare function explainRepoFolder(repo: any, folder: any): string;
export declare function explainRepoOverview(repo: any): string;
export declare function fileFacts(repo: any, file: any): {
    role: string;
    loc: any;
    complexity: any;
    fanIn: any;
    fanOut: any;
    inCycle: any;
    findings: any;
};
