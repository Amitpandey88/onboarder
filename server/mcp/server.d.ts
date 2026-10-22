import { PROTOCOL_VERSION } from './protocol.js';
export { PROTOCOL_VERSION };
export declare const SERVER_INFO: {
    name: string;
    version: string;
    title: string;
};
export declare const SERVER_INSTRUCTIONS: string;
export { handle };
export declare function createDispatcher({ stateless }?: {
    stateless?: boolean;
}): (msg: any) => Promise<{
    jsonrpc: string;
    id: string | number;
    error: {
        code: number;
        message: string;
    };
} | {
    jsonrpc: string;
    id: any;
    result: any;
} | {
    jsonrpc: string;
    id: any;
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
}>;
declare function handle(msg: any): Promise<{
    jsonrpc: string;
    id: string | number;
    error: {
        code: number;
        message: string;
    };
} | {
    jsonrpc: string;
    id: any;
    result: any;
} | {
    jsonrpc: string;
    id: any;
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
}>;
/**
 * Run the server until stdin closes. `input` and `output` are parameters so tests
 * can drive a whole session through in-memory streams.
 */
export declare function serveMcp({ input, output, dispatch, maxMessageBytes }?: Record<string, any>): {
    stop(): void;
    settled(): Promise<void>;
};
