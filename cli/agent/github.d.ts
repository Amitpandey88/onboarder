export interface GithubOptions {
    token?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
}
export interface GithubRateLimit {
    remaining: number | null;
    resetAt: string | null;
    retryAfterSeconds: number | null;
}
export declare class GithubApiError extends Error {
    readonly status: number;
    readonly rateLimit?: GithubRateLimit;
    constructor(message: string, status: number, rateLimit?: GithubRateLimit);
}
export declare function githubToken(env?: NodeJS.ProcessEnv): string;
export declare function repositoryFromRemote(remote: string): string | null;
export declare function positiveId(value: unknown, label: string): number;
export declare class GithubClient {
    readonly repository: string;
    private options;
    rateLimit?: GithubRateLimit;
    constructor(repository: string, options?: GithubOptions);
    request(route: string, method?: string, body?: unknown): Promise<{
        data: unknown;
        more: boolean;
    }>;
    list(route: string, pages?: number): Promise<{
        items: unknown[];
        truncated: boolean;
    }>;
}
