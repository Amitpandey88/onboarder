import type { ServerResponse } from 'node:http';
import { runProcess } from '../cli/agent/process.js';
export declare class HermesWeb {
    private home;
    private env;
    private execute;
    private active;
    constructor(home?: string, env?: NodeJS.ProcessEnv, execute?: typeof runProcess);
    private launcher;
    status(res: ServerResponse): Promise<void>;
    private validateMessages;
    private answer;
    /** Same tool-free provider bridge, with bounded output for structured local reviews. */
    complete(messages: {
        role: string;
        content: string;
    }[], options?: {
        signal?: AbortSignal;
    }): Promise<{
        text: string;
    }>;
    chat(res: ServerResponse, body: unknown): Promise<void>;
}
export declare const hermesWeb: HermesWeb;
