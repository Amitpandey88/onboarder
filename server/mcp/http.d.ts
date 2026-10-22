export declare const HTTP_HOST = "127.0.0.1";
export declare const DEFAULT_PORT = 8790;
export declare function handleMcpHttpRequest(req: any, res: any): void | Promise<void>;
/**
 * Start the Streamable HTTP transport. Returns `{ url, port, server, close }`, and
 * `port` is the port actually bound — which matters because the caller may have
 * asked for 0 and gets a free one back.
 */
export declare function createHttpTransport({ port, host }?: Record<string, any>): Promise<unknown>;
