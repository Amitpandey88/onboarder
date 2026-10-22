import type { ReviewProvider } from '../server/reviewAI.js';
export declare function configuredReviewProvider(flags: Record<string, any>, env?: NodeJS.ProcessEnv): Promise<ReviewProvider | undefined>;
export declare function reviewCommand(folder: string, flags: Record<string, any>, env?: NodeJS.ProcessEnv): Promise<0 | 1 | 2>;
