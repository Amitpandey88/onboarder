export declare function diagramTarget(s: any): {
    view: string;
    path: any;
} | {
    view: any;
    path: string;
};
export declare function externalsFor(scan: any, path: any): any;
export declare function overviewFacts(scan: any, facts: any): {
    kind: string;
    facts: string[];
};
export declare function layersFacts(facts: any, patterns: any): {
    kind: string;
    facts: any[];
};
export declare function servicesFacts(scan: any, manifest: any): {
    kind: string;
    facts: string[];
};
export declare function fileFacts({ ctx, externals }: {
    ctx: any;
    externals: any;
}): {
    kind: string;
    facts: string[];
};
export declare function tourStopFacts({ ctx, externals, stop, index, total }: Record<string, any>): {
    kind: string;
    facts: string[];
};
export declare function folderFacts(scan: any, facts: any, folder: any): {
    kind: string;
    facts: string[];
};
