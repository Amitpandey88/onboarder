export declare function labelled(marker: any, value: any, tail?: string, { pad }?: Record<string, any>): string;
declare function step(value: any, max: any): string;
export { step };
export declare function bar(value: any, max: any, room: any): string;
export declare function columns(items: any, { room, rows }?: Record<string, any>): any[];
export declare function couplingGrid(repo: any, { maxFolders, columns: cols }?: Record<string, any>): string[];
export declare function depTree(repo: any, rootPath: any, { depth, direction, room }?: Record<string, any>): any[];
