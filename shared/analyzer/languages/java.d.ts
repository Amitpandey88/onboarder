export declare const extensions: string[];
export declare function analyze(source: any, path: any): {
    imports: any[];
    exports: {
        name: any;
        kind: string;
    }[];
    functions: any[];
    classes: any[];
    hasMain: boolean;
    packageName: any;
};
export declare function sourceRootFor(fromPath: any, packageName: any): string;
export declare function resolveImport(spec: any, fromPath: any, has: any, context?: Record<string, any>, meta?: Record<string, any>): {
    unresolved: any;
    path?: undefined;
} | {
    unresolved?: undefined;
    path: any;
};
