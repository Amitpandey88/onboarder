export declare function computeFacts(scan: any, manifest?: Record<string, any>): {
    communities: {
        id: any;
        members: any;
        size: any;
    }[];
    betweenness: {
        [k: string]: number;
    };
    betweennessExact: boolean;
    fanIn: any;
    fanOut: any;
    importers: any;
    importsOf: any;
    entries: any;
    hubs: any;
    orphans: any;
    cycles: any[];
    inCycle: unknown[];
    deadExports: any[];
    testCoverage: {
        testedCount: number;
        totalNonTest: any;
        ratio: number;
    };
    untestedHubs: any;
    depsDrift: {
        unusedDeclared: string[];
        undeclaredImported: string[];
    };
    folderEdges: {
        from: any;
        to: any;
        count: any;
    }[];
    entrySet: any;
};
export declare function factIndex(facts: any): any;
export declare function roleOf(path: any, facts: any): "config" | "entry" | "hub" | "leaf" | "module" | "test";
export declare function inCycle(path: any, facts: any): any;
export declare function scanIndex(scan: any): any;
