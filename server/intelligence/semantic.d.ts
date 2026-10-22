import type { SemanticResult } from '../../shared/intelligence/contracts.js';
/** Optional compiler loaded from operator configuration, never repository code. */
export declare function semanticAnalysis(_root: string, texts: Map<string, string>, signal?: AbortSignal): Promise<SemanticResult>;
export declare function semanticEngineDirectory(): string;
export declare function installSemanticEngine(signal?: AbortSignal): Promise<{
    engine: string;
    version: string;
    note: string;
}>;
