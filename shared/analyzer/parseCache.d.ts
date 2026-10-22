import type { FileAnalysis } from '../contracts.js';
type Entry = {
    text: string;
    analysis: FileAnalysis;
};
/** Bound retained source independently from the repository's file-count limit. */
export declare class ParseCache extends Map<string, Entry> {
    readonly maxBytes: number;
    private bytes;
    private weights;
    constructor(maxBytes?: number);
    set(key: string, value: Entry): this;
    delete(key: string): boolean;
    clear(): void;
}
export {};
