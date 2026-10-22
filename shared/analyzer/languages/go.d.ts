export declare const extensions: string[];
export declare function analyze(source: any, path: any): {
    imports: any[];
    exports: any[];
    functions: any[];
    classes: any[];
    calls: any[];
    hasMain: boolean;
    packageName: any;
};
export declare function packageNameOf(spec: any): any;
export declare function resolveImport(spec: any, fromPath: any, has: any, context?: Record<string, any>): {
    packageDir: any;
    unresolved?: undefined;
    external?: undefined;
} | {
    packageDir?: undefined;
    unresolved: any;
    external?: undefined;
} | {
    packageDir?: undefined;
    unresolved?: undefined;
    external: any;
};
