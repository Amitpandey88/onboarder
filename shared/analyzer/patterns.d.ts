export declare function computeLayers(scan: any, facts: any): {
    layers: any[];
    unreachable: any;
    seeds: any;
};
export declare function detectPatterns(scan: any, facts: any, manifest: any, layersInfo: any): any[];
export declare function couplingMatrix(scan: any, facts: any, maxFolders?: number): {
    folders: any[];
    counts: Map<any, any>;
    max: number;
};
