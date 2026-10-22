export declare function toolsStatus(): Record<string, any>;
export declare function runExternalAnalysis(root: any, options?: Record<string, any>): Promise<{
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
