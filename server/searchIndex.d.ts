export declare function buildSearchIndex(source: any, codeFiles: any, options?: Record<string, any>): Promise<{
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
}>;
