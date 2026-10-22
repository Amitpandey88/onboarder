export declare const TOOLS: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
            };
            number: {
                type: string;
                minimum: number;
                maximum: number;
            };
            page: {
                type: string;
                minimum: number;
                maximum: number;
            };
            limit: {
                type: string;
                minimum: number;
                maximum: number;
            };
            state: {
                type: string;
                enum: string[];
            };
            includeSource: {
                type: string;
                description?: undefined;
            };
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<any>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
            };
            question: {
                type: string;
                maxLength: number;
            };
            base: {
                type: string;
                maxLength: number;
            };
            head: {
                type: string;
                maxLength: number;
            };
            semantic: {
                type: string;
            };
            includeSource: {
                type: string;
                description?: undefined;
            };
            force?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
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
        before: import("../../shared/intelligence/contracts.js").Snapshot;
        after: import("../../shared/intelligence/contracts.js").Snapshot;
    } | {
        fingerprint: string;
        revision: string;
        relatedTests: string[];
        limitations: string[];
        evidence: {
            id: string;
            path: string;
            startLine: number;
            endLine: number;
            hash: string;
            reason: string;
        }[];
    } | {
        freshness: 'current' | 'changed-during-scan';
        limitations: string[];
        journeys: import("../../shared/intelligence/contracts.js").Journey[];
        knowledge: (import("../../shared/intelligence/contracts.js").KnowledgeNote & {
            stale: boolean;
            owners: string[];
        })[];
        coverage: {
            status: 'current' | 'stale' | 'unknown';
            reason: string;
            report?: import("../../shared/intelligence/contracts.js").CoverageReport;
        };
        telemetry: {
            status: 'imported' | 'unavailable';
            reason: string;
            observed?: import("../../shared/intelligence/telemetry.js").ObservedTelemetry;
        };
        snapshot: {
            scanCoverage?: {
                truncated: boolean;
                unavailable: number;
                unsupported: number;
            };
            schemaVersion: 1;
            id: string;
            createdAt: string;
            revision: string;
            fingerprint: string;
            sourceFingerprint?: string;
            configurationHash?: string;
            analyzerVersion: string;
            metrics: {
                files: number;
                connections: number;
                unresolved: number;
                security: number;
                reused: number;
            };
            files: {
                path: string;
                hash: string;
                exports: string[];
            }[];
            edges: import("../../shared/contracts.js").ImportEdge[];
            cycles: string[][];
            violations: import("../../shared/intelligence/contracts.js").RuleViolation[];
        };
        rules: import("../../shared/intelligence/contracts.js").RuleViolation[];
        routes: import("../../shared/intelligence/contracts.js").RouteInfo[];
        dataModels: {
            path: string;
            line: number;
            name: string;
            kind: string;
        }[];
        scanFiles: Pick<import("../../shared/contracts.js").ScannedFile, "lang" | "loc" | "path">[];
        packages: {
            packages: {
                name: string;
                path: string;
                scripts: string[];
                dependencies: {
                    [k: string]: string;
                };
            }[];
            edges: {
                from: string;
                to: string;
                range: string;
            }[];
            duplicateDeclarations: {
                name: string;
                ranges: string[];
            }[];
        };
        semantic: {
            available: boolean;
            reason?: string;
            engine?: string;
            truncated?: boolean;
            definitions: {
                name: string;
                path: string;
                line: number;
                kind: string;
            }[];
            references: import("../../shared/intelligence/contracts.js").SymbolReference[];
        };
        resultLimits: {
            files: number;
            edges: number;
            rules: number;
            routes: number;
            packages: number;
            packageDependencies: number;
            semanticDefinitions: number;
            semanticReferences: number;
            totalFiles: number;
            totalEdges: number;
            totalRules: number;
            totalDefinitions: number;
            totalReferences: number;
        };
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            force: {
                type: string;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        name: any;
        summary: any;
        stats: {
            files: any;
            filesSeen: any;
            languages: any;
            connections: any;
            importsResolved: any;
        };
        entryPoints: any;
        hubs: any;
        cycles: any;
        orphanCount: any;
        deadExportCount: any;
        services: any;
        packageName: any;
        dependencies: {
            name: string;
            version: unknown;
        }[];
        devDependencies: string[];
        health: {
            score: any;
            grade: any;
        };
        security: {
            score: any;
            grade: any;
            findings: any;
        };
        caveats: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        name: any;
        summary: any;
        stats: {
            files: any;
            filesSeen: any;
            languages: any;
            connections: any;
            importsResolved: any;
        };
        entryPoints: any;
        hubs: any;
        cycles: any;
        orphanCount: any;
        deadExportCount: any;
        services: any;
        packageName: any;
        dependencies: {
            name: string;
            version: unknown;
        }[];
        devDependencies: string[];
        health: {
            score: any;
            grade: any;
        };
        security: {
            score: any;
            grade: any;
            findings: any;
        };
        caveats: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        layers: any;
        seeds: any;
        unreachable: any;
        patterns: any;
        coupling: {
            folders: any;
            edges: {
                from: any;
                to: any;
                count: any;
            }[];
            max: any;
        };
        services: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        summary: any;
        stops: {
            order: number;
            path: any;
            name: any;
            why: any;
            dependents: any;
            dependencies: any;
        }[];
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        score: any;
        grade: any;
        totals: any;
        breakdown: any;
        blastExact: any;
        riskiestFiles: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        score: any;
        grade: any;
        total: any;
        bySeverity: any;
        byCategory: any;
        filesWithFindings: any;
        findings: any[];
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        totalCommits?: undefined;
        available: boolean;
        reason: any;
        commitCount?: undefined;
        truncated?: undefined;
        firstCommitAt?: undefined;
        lastCommitAt?: undefined;
        contributors?: undefined;
        hotspots?: undefined;
        soloFiles?: undefined;
        coChanged?: undefined;
        pathsGone?: undefined;
    } | {
        reason?: undefined;
        available: boolean;
        commitCount: any;
        totalCommits: any;
        truncated: any;
        firstCommitAt: any;
        lastCommitAt: any;
        contributors: any;
        hotspots: any;
        soloFiles: any;
        coChanged: any;
        pathsGone: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        languages: any;
        packageManagers: any;
        dependencies: any;
        projectLicense: any;
        licenseCounts: any;
        workflows: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            file: {
                type: string;
                description: string;
            };
            includeSource: {
                type: string;
                description: string;
            };
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<{
        path: string;
        role: string;
        documentation: any;
        row: {
            path: any;
            name: any;
            parsed: boolean;
            fanIn: any;
            fanOut: any;
            role: string;
            functions: any;
        };
        imports: any;
        importedBy: any;
        metrics: {
            loc: any;
            complexity: any;
            exports: any;
            functions: any;
        };
        summary: string;
        source?: string;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            folder: {
                type: string;
                description: string;
            };
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<{
        imports: {
            folder: any;
            count: any;
        }[];
        importedBy: {
            folder: any;
            count: any;
        }[];
        folder: string;
        fileCount: any;
        parsedFileCount: any;
        subfolders: unknown[];
        files: any;
        documentation: string;
        summary: string;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            file: {
                type: string;
                description: string;
            };
            startLine: {
                type: string;
                minimum: number;
                description: string;
            };
            endLine: {
                type: string;
                minimum: number;
                description: string;
            };
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<{
        path: string;
        text: string;
    } | {
        path: string;
        text: string;
        startLine: any;
        endLine: number;
        totalLines: number;
        truncated: boolean;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            folder: {
                type: string;
                description: string;
            };
            contains: {
                type: string;
                description: string;
            };
            extension: {
                type: string;
                description: string;
            };
            tests: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        folder: string;
        total: any;
        truncated: boolean;
        files: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            caseSensitive: {
                type: string;
                description: string;
            };
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<{
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
        total: number;
        indexed: any;
        results: {
            path: any;
            line: any;
            snippet: any;
        }[];
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            tools: {
                type: string;
                items: {
                    type: string;
                    enum: string[];
                };
                description: string;
            };
            kinds: {
                type: string;
                items: {
                    type: string;
                    enum: string[];
                };
                description: string;
            };
        };
        required: any[];
    };
    run(args: any): Promise<{
        ms: number;
        passes: ({
            id: any;
            label: any;
            ok: boolean;
            available: boolean;
            findings: any[];
            reason: any;
            source: string;
            tool: any;
        } | {
            id: any;
            label: any;
            kind: any;
            ok: boolean;
            available: boolean;
            findings: any;
            source: string;
            tool: any;
            how: any;
            ms: number;
        })[];
        findings: any[];
        ranCount: number;
        totalTools: number;
        unavailable: {
            id: any;
            label: any;
            reason: any;
        }[];
        source: string;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            path?: undefined;
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(): Promise<{
        analyzers: any[];
    }>;
})[];
export declare function toolDefinitions(): {
    name: string;
    title: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
            };
            number: {
                type: string;
                minimum: number;
                maximum: number;
            };
            page: {
                type: string;
                minimum: number;
                maximum: number;
            };
            limit: {
                type: string;
                minimum: number;
                maximum: number;
            };
            state: {
                type: string;
                enum: string[];
            };
            includeSource: {
                type: string;
                description?: undefined;
            };
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
            };
            question: {
                type: string;
                maxLength: number;
            };
            base: {
                type: string;
                maxLength: number;
            };
            head: {
                type: string;
                maxLength: number;
            };
            semantic: {
                type: string;
            };
            includeSource: {
                type: string;
                description?: undefined;
            };
            force?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            force: {
                type: string;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            file: {
                type: string;
                description: string;
            };
            includeSource: {
                type: string;
                description: string;
            };
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            folder: {
                type: string;
                description: string;
            };
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            file: {
                type: string;
                description: string;
            };
            startLine: {
                type: string;
                minimum: number;
                description: string;
            };
            endLine: {
                type: string;
                minimum: number;
                description: string;
            };
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            folder: {
                type: string;
                description: string;
            };
            contains: {
                type: string;
                description: string;
            };
            extension: {
                type: string;
                description: string;
            };
            tests: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            caseSensitive: {
                type: string;
                description: string;
            };
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            tools: {
                type: string;
                items: {
                    type: string;
                    enum: string[];
                };
                description: string;
            };
            kinds: {
                type: string;
                items: {
                    type: string;
                    enum: string[];
                };
                description: string;
            };
        };
        required: any[];
        additionalProperties: boolean;
    } | {
        type: string;
        properties: {
            path?: undefined;
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
        additionalProperties: boolean;
    };
    annotations: {
        readOnlyHint: boolean;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
    };
}[];
export declare function findTool(name: any): {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
            };
            number: {
                type: string;
                minimum: number;
                maximum: number;
            };
            page: {
                type: string;
                minimum: number;
                maximum: number;
            };
            limit: {
                type: string;
                minimum: number;
                maximum: number;
            };
            state: {
                type: string;
                enum: string[];
            };
            includeSource: {
                type: string;
                description?: undefined;
            };
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<any>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
            };
            question: {
                type: string;
                maxLength: number;
            };
            base: {
                type: string;
                maxLength: number;
            };
            head: {
                type: string;
                maxLength: number;
            };
            semantic: {
                type: string;
            };
            includeSource: {
                type: string;
                description?: undefined;
            };
            force?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
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
        before: import("../../shared/intelligence/contracts.js").Snapshot;
        after: import("../../shared/intelligence/contracts.js").Snapshot;
    } | {
        fingerprint: string;
        revision: string;
        relatedTests: string[];
        limitations: string[];
        evidence: {
            id: string;
            path: string;
            startLine: number;
            endLine: number;
            hash: string;
            reason: string;
        }[];
    } | {
        freshness: 'current' | 'changed-during-scan';
        limitations: string[];
        journeys: import("../../shared/intelligence/contracts.js").Journey[];
        knowledge: (import("../../shared/intelligence/contracts.js").KnowledgeNote & {
            stale: boolean;
            owners: string[];
        })[];
        coverage: {
            status: 'current' | 'stale' | 'unknown';
            reason: string;
            report?: import("../../shared/intelligence/contracts.js").CoverageReport;
        };
        telemetry: {
            status: 'imported' | 'unavailable';
            reason: string;
            observed?: import("../../shared/intelligence/telemetry.js").ObservedTelemetry;
        };
        snapshot: {
            scanCoverage?: {
                truncated: boolean;
                unavailable: number;
                unsupported: number;
            };
            schemaVersion: 1;
            id: string;
            createdAt: string;
            revision: string;
            fingerprint: string;
            sourceFingerprint?: string;
            configurationHash?: string;
            analyzerVersion: string;
            metrics: {
                files: number;
                connections: number;
                unresolved: number;
                security: number;
                reused: number;
            };
            files: {
                path: string;
                hash: string;
                exports: string[];
            }[];
            edges: import("../../shared/contracts.js").ImportEdge[];
            cycles: string[][];
            violations: import("../../shared/intelligence/contracts.js").RuleViolation[];
        };
        rules: import("../../shared/intelligence/contracts.js").RuleViolation[];
        routes: import("../../shared/intelligence/contracts.js").RouteInfo[];
        dataModels: {
            path: string;
            line: number;
            name: string;
            kind: string;
        }[];
        scanFiles: Pick<import("../../shared/contracts.js").ScannedFile, "lang" | "loc" | "path">[];
        packages: {
            packages: {
                name: string;
                path: string;
                scripts: string[];
                dependencies: {
                    [k: string]: string;
                };
            }[];
            edges: {
                from: string;
                to: string;
                range: string;
            }[];
            duplicateDeclarations: {
                name: string;
                ranges: string[];
            }[];
        };
        semantic: {
            available: boolean;
            reason?: string;
            engine?: string;
            truncated?: boolean;
            definitions: {
                name: string;
                path: string;
                line: number;
                kind: string;
            }[];
            references: import("../../shared/intelligence/contracts.js").SymbolReference[];
        };
        resultLimits: {
            files: number;
            edges: number;
            rules: number;
            routes: number;
            packages: number;
            packageDependencies: number;
            semanticDefinitions: number;
            semanticReferences: number;
            totalFiles: number;
            totalEdges: number;
            totalRules: number;
            totalDefinitions: number;
            totalReferences: number;
        };
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            force: {
                type: string;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        name: any;
        summary: any;
        stats: {
            files: any;
            filesSeen: any;
            languages: any;
            connections: any;
            importsResolved: any;
        };
        entryPoints: any;
        hubs: any;
        cycles: any;
        orphanCount: any;
        deadExportCount: any;
        services: any;
        packageName: any;
        dependencies: {
            name: string;
            version: unknown;
        }[];
        devDependencies: string[];
        health: {
            score: any;
            grade: any;
        };
        security: {
            score: any;
            grade: any;
            findings: any;
        };
        caveats: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        name: any;
        summary: any;
        stats: {
            files: any;
            filesSeen: any;
            languages: any;
            connections: any;
            importsResolved: any;
        };
        entryPoints: any;
        hubs: any;
        cycles: any;
        orphanCount: any;
        deadExportCount: any;
        services: any;
        packageName: any;
        dependencies: {
            name: string;
            version: unknown;
        }[];
        devDependencies: string[];
        health: {
            score: any;
            grade: any;
        };
        security: {
            score: any;
            grade: any;
            findings: any;
        };
        caveats: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        layers: any;
        seeds: any;
        unreachable: any;
        patterns: any;
        coupling: {
            folders: any;
            edges: {
                from: any;
                to: any;
                count: any;
            }[];
            max: any;
        };
        services: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        summary: any;
        stops: {
            order: number;
            path: any;
            name: any;
            why: any;
            dependents: any;
            dependencies: any;
        }[];
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        score: any;
        grade: any;
        totals: any;
        breakdown: any;
        blastExact: any;
        riskiestFiles: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        score: any;
        grade: any;
        total: any;
        bySeverity: any;
        byCategory: any;
        filesWithFindings: any;
        findings: any[];
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        totalCommits?: undefined;
        available: boolean;
        reason: any;
        commitCount?: undefined;
        truncated?: undefined;
        firstCommitAt?: undefined;
        lastCommitAt?: undefined;
        contributors?: undefined;
        hotspots?: undefined;
        soloFiles?: undefined;
        coChanged?: undefined;
        pathsGone?: undefined;
    } | {
        reason?: undefined;
        available: boolean;
        commitCount: any;
        totalCommits: any;
        truncated: any;
        firstCommitAt: any;
        lastCommitAt: any;
        contributors: any;
        hotspots: any;
        soloFiles: any;
        coChanged: any;
        pathsGone: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        languages: any;
        packageManagers: any;
        dependencies: any;
        projectLicense: any;
        licenseCounts: any;
        workflows: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            file: {
                type: string;
                description: string;
            };
            includeSource: {
                type: string;
                description: string;
            };
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<{
        path: string;
        role: string;
        documentation: any;
        row: {
            path: any;
            name: any;
            parsed: boolean;
            fanIn: any;
            fanOut: any;
            role: string;
            functions: any;
        };
        imports: any;
        importedBy: any;
        metrics: {
            loc: any;
            complexity: any;
            exports: any;
            functions: any;
        };
        summary: string;
        source?: string;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            folder: {
                type: string;
                description: string;
            };
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<{
        imports: {
            folder: any;
            count: any;
        }[];
        importedBy: {
            folder: any;
            count: any;
        }[];
        folder: string;
        fileCount: any;
        parsedFileCount: any;
        subfolders: unknown[];
        files: any;
        documentation: string;
        summary: string;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            file: {
                type: string;
                description: string;
            };
            startLine: {
                type: string;
                minimum: number;
                description: string;
            };
            endLine: {
                type: string;
                minimum: number;
                description: string;
            };
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<{
        path: string;
        text: string;
    } | {
        path: string;
        text: string;
        startLine: any;
        endLine: number;
        totalLines: number;
        truncated: boolean;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            folder: {
                type: string;
                description: string;
            };
            contains: {
                type: string;
                description: string;
            };
            extension: {
                type: string;
                description: string;
            };
            tests: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            query?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(args: any): Promise<{
        root: any;
        folder: string;
        total: any;
        truncated: boolean;
        files: any;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
            };
            caseSensitive: {
                type: string;
                description: string;
            };
            tools?: undefined;
            kinds?: undefined;
        };
        required: string[];
    };
    run(args: any): Promise<{
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
        total: number;
        indexed: any;
        results: {
            path: any;
            line: any;
            snippet: any;
        }[];
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            path: {
                type: string;
                minLength: number;
                maxLength: number;
                description: string;
            };
            tools: {
                type: string;
                items: {
                    type: string;
                    enum: string[];
                };
                description: string;
            };
            kinds: {
                type: string;
                items: {
                    type: string;
                    enum: string[];
                };
                description: string;
            };
        };
        required: any[];
    };
    run(args: any): Promise<{
        ms: number;
        passes: ({
            id: any;
            label: any;
            ok: boolean;
            available: boolean;
            findings: any[];
            reason: any;
            source: string;
            tool: any;
        } | {
            id: any;
            label: any;
            kind: any;
            ok: boolean;
            available: boolean;
            findings: any;
            source: string;
            tool: any;
            how: any;
            ms: number;
        })[];
        findings: any[];
        ranCount: number;
        totalTools: number;
        unavailable: {
            id: any;
            label: any;
            reason: any;
        }[];
        source: string;
    }>;
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            path?: undefined;
            number?: undefined;
            page?: undefined;
            state?: undefined;
            action?: undefined;
            question?: undefined;
            base?: undefined;
            head?: undefined;
            semantic?: undefined;
            force?: undefined;
            includeSource?: undefined;
            file?: undefined;
            startLine?: undefined;
            endLine?: undefined;
            folder?: undefined;
            contains?: undefined;
            extension?: undefined;
            tests?: undefined;
            query?: undefined;
            limit?: undefined;
            caseSensitive?: undefined;
            tools?: undefined;
            kinds?: undefined;
        };
        required: any[];
    };
    run(): Promise<{
        analyzers: any[];
    }>;
};
export declare function callTool(name: any, args: any): Promise<any>;
export declare function mcpStatus(): {
    transport: string;
    toolCount: number;
    tools: string[];
    catalog: {
        name: string;
        title: string;
        description: string;
        annotations: {
            readOnlyHint: boolean;
            destructiveHint: boolean;
            idempotentHint: boolean;
            openWorldHint: boolean;
        };
    }[];
    cachedRepositories: any[];
    lastRoot: any;
    analyzers: Record<string, any>;
};
