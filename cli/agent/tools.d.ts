import type { AgentTool, RunManifest } from './contracts.js';
import { GithubClient } from './github.js';
export declare function field(args: Record<string, unknown>, name: string, max?: number): string;
export declare function createAgentTools(manifest: RunManifest, options?: {
    client?: GithubClient;
    signal?: AbortSignal;
}): AgentTool[];
