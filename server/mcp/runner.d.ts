export declare const REPO_ROOT: string;
export declare const ENTRY: string;
export declare function mcpCommand(): string;
export declare function mcpEntryPoint(): string;
export declare function mcpConfig(override: any): {
    command: any;
    args: any;
    cwd: any;
};
export declare class McpRunner {
    commandOverride: any;
    child: any;
    state: string;
    startedAt: any;
    lastError: string;
    log: any[];
    onLog: any;
    get running(): boolean;
    note(line: any): void;
    constructor({ onLog, command, args, cwd }?: Record<string, any>);
    start(): Promise<{
        transport: string;
        toolCount: number;
        tools: string[];
        catalog: {
            name: string;
            title: string;
            description: string;
            annotations: {
                readOnlyHint: boolean;
                destructiveHint: boolean;
                idempotentHint: boolean;
                openWorldHint: boolean;
            };
        }[];
        cachedRepositories: any[];
        lastRoot: any;
        analyzers: Record<string, any>;
        version: string;
        protocolVersion: string;
        resources: {
            uriTemplate: string;
            name: string;
            title: string;
            description: string;
            mimeType: string;
        }[];
        prompts: {
            name: string;
            title: string;
            description: string;
            arguments: {
                name: string;
                description: string;
                required: boolean;
            }[];
        }[];
        state: string;
        running: boolean;
        pid: any;
        startedAt: any;
        uptimeMs: number;
        lastError: string;
        log: any[];
    }>;
    handshake(exited: any): Promise<unknown>;
    stop(): Promise<{
        transport: string;
        toolCount: number;
        tools: string[];
        catalog: {
            name: string;
            title: string;
            description: string;
            annotations: {
                readOnlyHint: boolean;
                destructiveHint: boolean;
                idempotentHint: boolean;
                openWorldHint: boolean;
            };
        }[];
        cachedRepositories: any[];
        lastRoot: any;
        analyzers: Record<string, any>;
        version: string;
        protocolVersion: string;
        resources: {
            uriTemplate: string;
            name: string;
            title: string;
            description: string;
            mimeType: string;
        }[];
        prompts: {
            name: string;
            title: string;
            description: string;
            arguments: {
                name: string;
                description: string;
                required: boolean;
            }[];
        }[];
        state: string;
        running: boolean;
        pid: any;
        startedAt: any;
        uptimeMs: number;
        lastError: string;
        log: any[];
    }>;
    status(): {
        transport: string;
        toolCount: number;
        tools: string[];
        catalog: {
            name: string;
            title: string;
            description: string;
            annotations: {
                readOnlyHint: boolean;
                destructiveHint: boolean;
                idempotentHint: boolean;
                openWorldHint: boolean;
            };
        }[];
        cachedRepositories: any[];
        lastRoot: any;
        analyzers: Record<string, any>;
        version: string;
        protocolVersion: string;
        resources: {
            uriTemplate: string;
            name: string;
            title: string;
            description: string;
            mimeType: string;
        }[];
        prompts: {
            name: string;
            title: string;
            description: string;
            arguments: {
                name: string;
                description: string;
                required: boolean;
            }[];
        }[];
        state: string;
        running: boolean;
        pid: any;
        startedAt: any;
        uptimeMs: number;
        lastError: string;
        log: any[];
    };
}
export declare function createMcpRunner(opts: any): McpRunner;
