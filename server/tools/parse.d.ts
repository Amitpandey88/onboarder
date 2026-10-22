export declare const SEVERITY_ORDER: string[];
export declare function normalizeSeverity(raw: any): "critical" | "high" | "info" | "low" | "medium";
export declare function parseSemgrep(json: any, rel: any): any[];
export declare function parseGitleaks(json: any, rel: any): any[];
export declare function parseKnip(json: any, rel: any): any[];
export declare function parseVulture(text: any, rel: any): any[];
export declare function parseDepcheck(json: any): any[];
export declare function mergeFindings(...lists: any[]): any[];
