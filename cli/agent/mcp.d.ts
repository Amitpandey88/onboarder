import { createAgentTools } from './tools.js';
import type { AgentTool, RunManifest } from './contracts.js';
export declare function scopedTools(manifest: RunManifest, options?: Parameters<typeof createAgentTools>[1]): AgentTool[];
export declare function createAgentDispatcher(manifest: RunManifest, options?: Parameters<typeof createAgentTools>[1]): (msg: any) => Promise<{
    jsonrpc: string;
    id: any;
    error: {
        code: number;
        message: string;
    };
} | {
    jsonrpc: string;
    id: any;
    result: unknown;
}>;
