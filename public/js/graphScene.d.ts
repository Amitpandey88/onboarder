/** Bounded display projection. All source files remain searchable. */
export declare const GRAPH_NODE_LIMIT = 700;
export declare const GRAPH_EDGE_LIMIT = 1800;
export interface GraphFile {
    path: string;
    fanIn?: number;
    fanOut?: number;
    community?: number;
    risk?: number;
    [key: string]: unknown;
}
export interface GraphLink {
    from: string;
    to: string;
}
export declare class GraphIndex {
    private links;
    private ordered;
    private byPath;
    constructor(files: readonly GraphFile[], links: readonly GraphLink[]);
    select(query?: string, focus?: string): {
        nodes: GraphFile[];
        edges: GraphLink[];
        matches: number;
        totalFiles: number;
        totalEdges: number;
        limited: boolean;
    };
}
