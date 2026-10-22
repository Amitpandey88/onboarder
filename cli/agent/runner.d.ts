import { type AgentRequest, type RunManifest, type AgentResult, type AgentEvent } from './contracts.js';
import { runProcess } from './process.js';
export interface RunnerOptions {
    home?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    onEvent?: (event: AgentEvent) => void;
    execute?: typeof runProcess;
}
export declare function runId(value: string): string;
export declare function savedRun(id: string, home?: string): Promise<{
    manifest: RunManifest;
    result: any;
    directory: string;
}>;
export declare function agentPrompt(manifest: RunManifest): string;
export declare function runAgent(request: AgentRequest, options?: RunnerOptions): Promise<AgentResult | {
    mode: "ask" | "github" | "implement" | "pr" | "review" | "triage";
    repository: string;
    sourceRoot: string;
    baseBranch: string;
    permissions: {
        files: boolean;
        checks: boolean;
        github: boolean;
    };
    maxTurns: number;
    timeoutSeconds: number;
    isolatedWorkspace: boolean;
    sourceHasUncommittedChanges: boolean;
    note: string;
    resume: string;
    dryRun: true;
}>;
