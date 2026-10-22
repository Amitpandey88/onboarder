export declare function buildTree(allFiles: any): {
    name: string;
    path: string;
    dirs: Map<any, any>;
    files: any[];
};
export declare function findNode(root: any, path: any): any;
export declare function countFiles(node: any): any;
export declare function pruneTree(root: any, include: any, matchesFolder?: any): any;
export declare function expandedToDepth(root: any, maxDepth: any): Set<string>;
export declare function resetOpenState(): void;
export declare function renderTree(container: any, tree: any, ctx: any): void;
