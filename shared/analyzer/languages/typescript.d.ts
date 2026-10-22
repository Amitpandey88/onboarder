import { resolveImport, packageNameOf } from './javascript.js';
export declare const extensions: string[];
export declare function analyze(source: any, path: any): {
    imports: any[];
    exports: any[];
    functions: any[];
    classes: any[];
    interfaces: any[];
    hasMain: boolean;
};
export { resolveImport, packageNameOf };
