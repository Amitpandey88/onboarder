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
export declare function resolveImport(spec: any, fromPath: any, has: any, context?: Record<string, any>): {
    path: string;
    unresolved?: undefined;
    external?: undefined;
} | {
    path?: undefined;
    unresolved: any;
    external?: undefined;
} | {
    path?: undefined;
    unresolved?: undefined;
    external: any;
};
