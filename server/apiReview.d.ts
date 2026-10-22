import type { ServerResponse } from 'node:http';
import type { AIReviewOptions } from './reviewAI.js';
export declare function handleReview(res: ServerResponse, body: unknown, integrations?: Pick<AIReviewOptions, 'complete'>): Promise<void>;
