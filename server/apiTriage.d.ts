import type { ServerResponse } from 'node:http';
import { GithubClient } from '../cli/agent/github.js';
import type { GithubAutomation } from './intelligence/githubAutomation.js';
import type { AIReviewOptions } from './reviewAI.js';
export interface TriageIntegrations {
    githubAutomation?: GithubAutomation;
    triageClient?: (repository: string, signal: AbortSignal) => GithubClient;
    reviewComplete?: AIReviewOptions['complete'];
}
export declare function handleTriage(res: ServerResponse, body: unknown, integrations?: TriageIntegrations): Promise<void>;
