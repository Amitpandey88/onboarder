import type { ServerResponse } from 'node:http';
import { runAgent } from '../cli/agent/runner.js';
import { FixStore } from './fixStore.js';
import type { AIReviewOptions } from './reviewAI.js';
export declare function handleFix(res: ServerResponse, body: unknown, execute?: typeof runAgent, integrations?: {
    owner?: string;
    store?: FixStore;
    complete?: AIReviewOptions['complete'];
}): Promise<void>;
