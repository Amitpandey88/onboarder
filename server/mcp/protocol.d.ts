export declare const PACKAGE_VERSION: string;
export declare const PROTOCOL_VERSION = "2025-11-25";
export declare const SUPPORTED_PROTOCOL_VERSIONS: string[];
export declare function negotiateVersion(requested: string): string;
export declare function rpcResult(id: string | number | null, value: unknown): {
    jsonrpc: string;
    id: string | number;
    result: unknown;
};
export declare function rpcError(id: string | number | null, code: number, message: string): {
    jsonrpc: string;
    id: string | number;
    error: {
        code: number;
        message: string;
    };
};
export declare function isObject(value: unknown): value is Record<string, any>;
export declare function invalidRequest(msg: any): {
    jsonrpc: string;
    id: string | number;
    error: {
        code: number;
        message: string;
    };
};
export declare function validateArguments(schema: any, value: unknown, label?: string): void;
export declare function initializeResult(params: any, serverInfo: object, capabilities: object, instructions: string): {
    protocolVersion: string;
    serverInfo: object;
    capabilities: object;
    instructions: string;
};
