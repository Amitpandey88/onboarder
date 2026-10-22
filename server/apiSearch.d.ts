export declare function buildTfIdfIndex(documents: any): {
    index: Map<any, any>;
    docCounts: Map<any, any>;
    totalDocs: number;
};
export declare function searchIndex(indexData: any, queryString: any, limit?: number): any[];
export declare function searchDocuments(indexData: any, rawQuery: any, options?: Record<string, any>): {
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
export declare function handleSearch(res: any, body: any): Promise<void>;
