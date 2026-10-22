export declare const GEOMETRY: {
    colW: number;
    rowH: number;
    cellW: number;
    cellH: number;
    pad: number;
    maxFolderChildren: number;
    maxNeighbors: number;
};
export declare function buildSpecs({ root, expanded, folderInfo, fileInfo, rootSummary }: {
    expanded: any;
    fileInfo: any;
    folderInfo: any;
    root: any;
    rootSummary: any;
}): {
    id: string;
    kind: string;
    name: any;
    summary: any;
    cls: any;
    expandable: boolean;
    nav: any;
    kids: () => any[];
};
export declare function layoutMindMap(rootSpec: any, expanded: any): {
    cells: any[];
    edges: any[];
    width: number;
    height: number;
};
export declare function renderMindMap(container: any, layout: any, expanded: any, handlers: any): HTMLDivElement;
