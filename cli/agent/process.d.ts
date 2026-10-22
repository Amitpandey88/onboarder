export interface ProcessOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    maxBytes?: number;
    onLine?: (line: string) => void;
    detached?: boolean;
}
export declare function redact(text: string, env?: NodeJS.ProcessEnv): string;
export declare function terminalText(text: string): string;
/** Argument arrays, bounded pipes, and process-group cleanup for Hermes and its MCP children. */
export declare function runProcess(command: string, args: string[], options?: ProcessOptions): Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>;
