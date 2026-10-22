/** Read only display fields; Hermes continues to own YAML parsing and credentials. */
export declare function profileDisplay(home?: string, env?: NodeJS.ProcessEnv): Promise<{
    model?: string;
    provider?: string;
}>;
