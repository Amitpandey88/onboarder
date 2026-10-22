export declare function readRepoFile(path: any): Promise<any>;
export declare function gatherFileContext(path: any): Promise<{
    path: any;
    role: string;
    fanIn: any;
    fanOut: any;
    importers: any;
    imports: any;
    functions: any;
    exports_: any;
    source: string;
}>;
