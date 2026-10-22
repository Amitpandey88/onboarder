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
    namespace: any;
};
export declare function sourceRootFor(fromPath: any, namespace: any): string;
export declare function resolveImport(spec: any, fromPath: any, has: any, context?: Record<string, any>, meta?: Record<string, any>): {
    path?: undefined;
    unresolved: any;
    packageDir?: undefined;
} | {
    unresolved?: undefined;
    path: string;
    packageDir?: undefined;
} | {
    path?: undefined;
    unresolved?: undefined;
    packageDir: any;
};
