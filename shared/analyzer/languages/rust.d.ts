export declare const extensions: string[];
export declare function analyze(source: any, path: any): {
    imports: any[];
    exports: any[];
    functions: any[];
    classes: any[];
    hasMain: boolean;
};
export declare function crateRootFor(fromPath: any): string;
export declare function moduleDirFor(fromPath: any): string;
export declare function resolveImport(spec: any, fromPath: any, has: any, context?: Record<string, any>, meta?: Record<string, any>): {
    unresolved: any;
    path?: undefined;
} | {
    unresolved?: undefined;
    path: string;
};
