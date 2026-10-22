export interface FixSourceSelector {
    mode: 'working' | 'staged' | 'range';
    head?: string;
}
export interface FixSnapshot {
    revision: string;
    fingerprint: string;
    files: Map<string, string>;
    excluded: string[];
    unavailable: string[];
    overlay: {
        path: string;
        content: string | null;
        executable?: boolean;
    }[];
}
export declare const privateText: (value: string) => string;
export declare function requirePublicSource(value: string): void;
export declare function fixGit(root: string, args: string[], signal?: AbortSignal): Promise<string>;
/** Bounded source snapshot. No repository scripts, filters, hooks or programs run. */
export declare function captureFixSource(root: string, selector: FixSourceSelector, signal?: AbortSignal): Promise<FixSnapshot>;
export declare function canonicalFixRoot(root: string): Promise<string>;
