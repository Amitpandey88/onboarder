import http from 'node:http';
export declare const CONFIG: {
    projectRoot: string;
    publicDir: string;
    sharedDir: string;
    mcp: import("./mcp/runner.js").McpRunner;
};
export declare function createServer(config?: typeof CONFIG & import('./apiTriage.js').TriageIntegrations & {
    fixStore?: import('./fixStore.js').FixStore;
    configPath?: string;
    getSettings?: () => Promise<import('../shared/contracts.js').Settings>;
    boot?: {
        host: string;
        port: number;
        domain: string;
        https: boolean;
    };
}): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
export declare function startupBanner(settings: any, { configFile, columns }?: Record<string, any>): string;
export declare function openInBrowser(url: any): void;
export declare function listenError(error: any, { host, port, pid }?: Record<string, any>): any;
export declare function startServer({ configFile, openBrowser, log }?: Record<string, any>): Promise<{
    server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    settings: {
        version: number;
        mode: 'local' | 'self-hosted';
        domain: string;
        https: boolean;
        accessKey: string;
        autoOpen: boolean;
        account: import("../shared/contracts.js").AccountSettings;
        tunnel: {
            cloudflare: boolean;
            tailscale: boolean;
        };
        host: string;
        port: number;
    };
    host: string;
    port: number;
}>;
