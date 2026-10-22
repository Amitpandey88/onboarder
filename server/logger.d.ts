export declare const SEVERITY: {
    error: number;
    warn: number;
    info: number;
    debug: number;
};
export declare function classifyPath(pathname?: string): "action" | "noise" | "poll";
export declare function classifyRequest(req?: Record<string, any>): "action" | "noise" | "poll";
export declare function formatMessage(entry: any): string;
export declare function identifyingTail(text: any): string;
export declare function fitPath(text: any, max: any): string;
export declare const LEVEL_MIN_COLUMNS = 52;
export declare const SHORT_TIME_COLUMNS = 24;
export declare const NO_TIME_COLUMNS = 12;
export declare function showLevel(columns: any): boolean;
export declare function showFullTime(columns: any): boolean;
export declare function showTime(columns: any): boolean;
export declare function timeColumn(entry: any, columns: any): string;
export declare function prefixWidth(columns: any): number;
export declare function messageWidth(columns: any): number;
export declare function formatEntry(entry: any, { columns }?: Record<string, any>): string;
export declare function renderEntry(entry: any, { color, columns }?: Record<string, any>): string;
export declare function noiseSummary(count: any, ms?: number): string;
export declare function logEntry(level: any, msg: any, extra?: Record<string, any>): {
    ts: string;
    time: string;
    level: any;
    msg: any;
};
export declare function createLogger(level?: string, options?: Record<string, any>): {
    debug: (msg: any, extra: any) => void;
    info: (msg: any, extra: any) => void;
    warn: (msg: any, extra: any) => void;
    error: (msg: any, extra: any) => void;
    http: (req: any) => void;
    flush: () => void;
    suppressed: () => number;
};
