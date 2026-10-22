import { runProcess } from '../agent/process.js';
export interface ModelProvider {
    id: string;
    name: string;
    models: string[];
}
export declare class HermesModels {
    private home;
    private env;
    private execute;
    constructor(home?: string, env?: NodeJS.ProcessEnv, execute?: typeof runProcess);
    private request;
    catalog(signal: AbortSignal): Promise<ModelProvider[]>;
    select(model: string, provider: string, signal: AbortSignal): Promise<{
        model: string;
        provider: string;
    }>;
}
