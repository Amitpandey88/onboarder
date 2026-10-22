import type { FileSource, Manifest } from '../contracts.js';
export declare function detectManifest(source: FileSource): Promise<Manifest>;
export declare function parseRequirements(text: any): string[];
export declare function parseGoRequires(text: any): string[];
export declare function parseCargoDeps(text: any): any[];
