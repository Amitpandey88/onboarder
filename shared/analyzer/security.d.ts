export declare const SEVERITIES: string[];
export declare const sevRank: (s: any) => number;
export declare function analyzeSecurityFile(source: any, lang: any): any[];
export declare function summarizeSecurity(scan: any): {
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
export declare function mergeFindingsIntoScan(scan: any, external: any): number;
