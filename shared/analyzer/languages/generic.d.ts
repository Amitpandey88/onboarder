export declare const extensions: string[];
export declare function analyze(source: any, path: any): {
    imports: any[];
    exports: any[];
    functions: any[];
    classes: any[];
    calls: any[];
    hasMain: boolean;
};
export declare function packageNameOf(spec: any): any;
export declare function resolveImport(spec: any, fromPath: any, has: any, context?: Record<string, any>, meta?: Record<string, any>): {
    unresolved?: undefined;
    external: any;
    path?: undefined;
} | {
    unresolved?: undefined;
    external?: undefined;
    path: any;
} | {
    external?: undefined;
    path?: undefined;
    unresolved: any;
};
