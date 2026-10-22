export declare const HERMES_SOURCE = "https://github.com/NousResearch/hermes-agent.git";
export declare const HERMES_REVISION = "eb7e8620324b32424c06218f6a28094df2e921f8";
export declare function agentHome(env?: NodeJS.ProcessEnv): string;
export declare function hermesBinary(env?: NodeJS.ProcessEnv): string;
export declare function runtimePaths(home?: string, env?: NodeJS.ProcessEnv): {
    home: string;
    profile: string;
    runs: string;
    workspaces: string;
    server: string;
};
export declare function hermesEnvironment(home?: string, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function setupAgent(home?: string, env?: NodeJS.ProcessEnv): Promise<{
    home: string;
    profile: string;
    runs: string;
    workspaces: string;
    server: string;
    configFile: string;
    created: boolean;
}>;
/** Refresh only harness-owned settings; retain the model wizard's provider/auth choices. */
export declare function prepareAgentProfile(home?: string, env?: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<{
    home: string;
    profile: string;
    runs: string;
    workspaces: string;
    server: string;
    configFile: string;
    created: boolean;
}>;
