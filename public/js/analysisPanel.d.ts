export declare function subscribeAnalysis(listener: any): () => boolean;
export declare function ensureToolsStatus(force?: boolean): Promise<any>;
export declare function runDeepAnalysis(options?: Record<string, any>): Promise<any>;
export declare function installEngine(id: any): Promise<{
    [key: string]: any;
    type: string;
    ok?: boolean;
    error?: string;
    method?: string;
}>;
export declare function runOutcomeMessage(report: any): string;
export declare function initAnalysisPanel(options: any): void;
export declare function renderAnalysisPanel(): void;
