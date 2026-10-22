interface Declaration {
    name?: string;
    kind?: string;
    line?: number;
}
interface SearchFile {
    path: string;
    classes?: Declaration[];
    functions?: Declaration[];
    exports?: Declaration[];
}
interface SymbolRecord {
    name: string;
    symbol: string;
    kind: string;
    line?: number;
}
export interface LocalSearchRecord {
    path: string;
    symbols: SymbolRecord[];
}
export interface LocalSearchRow {
    type: 'file' | 'symbol';
    path: string;
    score: number;
    name?: string;
    symbol?: string;
    kind?: string;
    line?: number;
    order: number;
}
/** Extract and deduplicate declarations once per scan, rather than once per key. */
export declare function buildLocalSearchIndex(files: (SearchFile | string)[]): LocalSearchRecord[];
export declare function searchLocalIndex(index: LocalSearchRecord[], parsed: ReturnType<typeof import('../../shared/search/query.js').parseQuery>, limit?: number): {
    files: LocalSearchRow[];
    symbols: LocalSearchRow[];
    counts: {
        files: number;
        symbols: number;
    };
};
export {};
