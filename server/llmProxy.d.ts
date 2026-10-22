export declare function detectProvider(apiKey: any, baseUrl: any): "anthropic" | "gemini" | "openai";
export declare function extractRequestId(headers: any): any;
export declare function buildChatRequest(body: Record<string, any>, stream?: boolean): {
    url: any;
    headers: Record<string, string>;
    payload: Record<string, unknown>;
    provider: string;
};
/** Bounded non-streaming adapter shared by contextual review and configured providers. */
export declare function completeChat(body: Record<string, any>, options?: {
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
}): Promise<{
    text: string;
    truncated: boolean;
    inputTokens?: any;
    outputTokens?: any;
}>;
export declare function proxyChat(res: any, body: any): Promise<void>;
