export declare function hashString(str: any): string;
export declare function repoCacheKey(scan: any): string;
export declare function compareScans(prev: any, curr: any): {
    scoreDiff: number;
    filesDiff: number;
    trend: string;
    summary: string;
};
export declare class ScanCache {
    storage: any;
    memory: Map<string, any>;
    constructor(storage?: Storage);
    get(key: any): any;
    set(key: any, val: any): void;
    clear(): void;
}
