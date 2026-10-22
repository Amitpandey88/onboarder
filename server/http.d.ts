import type { IncomingMessage, ServerResponse } from 'node:http';
export declare const MAX_BODY_BYTES: number;
export declare function readBody(req: IncomingMessage, limit?: number): Promise<unknown>;
export declare function sendJSON(res: ServerResponse, status: number, data: unknown, headers?: Record<string, string | number | string[]>): void;
export declare function sendError(res: ServerResponse, status: number, message: string): void;
export declare function sendText(res: ServerResponse, status: number, text: string): void;
