export declare const SEV_ORDER: string[];
export declare function sevRank(severity: any): number;
export declare const BUILTIN_TOOL = "built-in";
export declare function findingsFromSecurity(security: any): any[];
export declare function tabulate(rows: any): {
    total: any;
    bySeverity: Record<string, any>;
    byTool: Record<string, any>;
    byCategory: Record<string, any>;
    external: any;
    builtin: number;
    critical: any;
    high: any;
    medium: any;
    low: any;
};
export declare function filterFindings(rows: any, { severity, tool, q }?: Record<string, any>): any;
export declare function engineRows(status: any, report: any): {
    id: string;
    label: any;
    kind: any;
    purpose: any;
    available: boolean;
    how: any;
    reason: any;
    options: any;
    defaults: any;
    installable: boolean;
    ran: boolean;
    failed: boolean;
    findings: any;
    ms: any;
    failure: any;
}[];
export declare function engineSummary(report: any, rows: any): {
    tone: string;
    text: string;
};
