import type { ResolverContext, ImportResolution } from '../../contracts.js';
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
export declare function resolveImport(spec: string, fromPath: string, has: (path: string) => boolean, context?: ResolverContext): ImportResolution;
