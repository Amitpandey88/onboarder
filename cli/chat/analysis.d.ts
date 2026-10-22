import { toolsStatus, runExternalAnalysis } from '../../server/tools/scan.js';
export declare function analysisSelection(args: string[]): Record<string, any>;
interface AnalysisPorts {
    choose?: (choices: Array<{
        value: string;
        label: string;
        detail?: string;
    }>, signal: AbortSignal) => Promise<string | null>;
    progress?: (text: string) => void;
    status?: typeof toolsStatus;
    run?: typeof runExternalAnalysis;
    home?: string;
    env?: NodeJS.ProcessEnv;
}
export declare class ChatAnalysis {
    private ports;
    constructor(ports?: AnalysisPorts);
    private status;
    private file;
    private latest;
    execute(name: string, args: string[], root: string, signal: AbortSignal, checks: boolean): Promise<{
        text: string;
        explain?: string;
    }>;
}
export {};
