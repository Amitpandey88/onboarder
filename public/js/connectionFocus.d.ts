export declare function traceConnections(edges: any, id: any, tree?: boolean): {
    nodes: Set<any>;
    edges: Set<number>;
};
export declare function mermaidNodeId(domId: any): any;
export declare function mermaidEdgeEnds(rawId: string, nodeIds: Iterable<string>): {
    from: string;
    to: string;
};
export declare function createConnectionFocus(options: any): {
    reset(): void;
    setContext(key: any, visible: any): void;
    bind(payloads?: {}): void;
};
