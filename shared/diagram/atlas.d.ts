export declare function atlasSpecs(scan: any, facts: any, manifest: any, patterns: any): {
    kind: string;
    path: string;
    title: string;
    sub: string;
}[];
export declare function atlasDiagram(spec: any, { scan, facts, manifest, patterns }: {
    facts: any;
    manifest: any;
    patterns: any;
    scan: any;
}): {
    source: string;
    nodes: {};
};
export declare function filterAtlasItems(specs: any, { text, showTests }?: Record<string, any>): any;
