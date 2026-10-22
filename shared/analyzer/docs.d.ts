export declare function parseFolderDoc(text: any): {
    folderBrief: string;
    files: Map<any, any>;
};
export declare function fileFactsLine(path: any, scan: any, facts: any): string;
export declare function fileStaticDoc(path: any, scan: any, facts: any): any;
export declare function folderStaticDoc(folder: any, scan: any, facts: any, subfolderCount?: number): string;
export declare function docFileRow(path: any, scan: any, facts: any): {
    path: any;
    name: any;
    parsed: boolean;
    fanIn: any;
    fanOut: any;
    role: string;
    functions: any;
};
