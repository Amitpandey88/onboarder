import type { ScanRequest } from '../../shared/contracts.js';
export declare function scanOnServer(payload: ScanRequest, options?: {
    signal?: AbortSignal;
}): Promise<any>;
export declare function cleanupClone(cloneId: any): Promise<void>;
export declare function fetchFileText(scanId: any, path: any): Promise<string>;
export declare function fetchToolsStatus(): Promise<any>;
export declare function runAnalysisTools(scanId: any, options?: Record<string, any>): Promise<any>;
export declare function streamToolInstall(tool: any, onEvent: any): Promise<any>;
export declare function fetchMcpStatus(): Promise<any>;
export declare function startMcpServer(): Promise<any>;
export declare function stopMcpServer(): Promise<any>;
export declare function fetchMcpCommand(): Promise<any>;
export declare function streamExplain({ connection, baseUrl, apiKey, model, messages, maxTokens, providerOptions, purpose, signal }: {
    apiKey?: string;
    baseUrl?: string;
    connection?: string;
    maxTokens?: number;
    messages: any;
    model?: string;
    providerOptions?: {};
    purpose?: string;
    signal?: AbortSignal;
}): AsyncGenerator<any, void, unknown>;
export declare function fetchHermesStatus(signal?: AbortSignal): Promise<any>;
export declare function fetchServerSettings(): Promise<any>;
export declare function updateServerSettings(patch: any): Promise<any>;
export declare function rotateServerAccessKey(): Promise<any>;
export declare function logoutRemoteSession(): Promise<any>;
