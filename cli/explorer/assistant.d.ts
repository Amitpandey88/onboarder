interface AskConfig {
    baseUrl: string;
    model: string;
    apiKey: string;
}
export declare function askConfig(env?: NodeJS.ProcessEnv): AskConfig | null;
export declare function askSetupMessage(): string;
export declare function askModel(question: string, context: string, config: AskConfig, fetchImpl?: typeof fetch): Promise<string>;
export {};
