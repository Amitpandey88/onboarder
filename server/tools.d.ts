export interface ToolResult {
    status?: number;
    ok: boolean;
    stdout: string;
    stderr?: string;
    error?: string;
    timedOut?: boolean;
    cancelled?: boolean;
    code?: number;
    ms?: number;
}
export declare const TOOL_IDS: string[];
export declare function clearDetectionCache(): void;
export declare function detectRunners(): {
    uvx: any;
    npx: any;
};
export declare function detectTools(defs: any): Record<string, any>;
export declare function toolArgv(def: any, root: any, toolOptions?: Record<string, any>, ctx?: Record<string, any>): {
    argv: any[];
    how: string;
    display: any;
};
export declare const TOOL_TIMEOUT_MS = 120000;
export declare function runTool(argv: any, options?: Record<string, any>): Promise<ToolResult>;
export declare function emptyPass(id: any, label: any, reason: any): {
    id: any;
    label: any;
    ok: boolean;
    available: boolean;
    findings: any[];
    reason: any;
    source: string;
    tool: any;
};
