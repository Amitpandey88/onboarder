/** Git filters can execute code even for status/diff/checkout. Disable configured filters explicitly. */
export declare function safeGitArguments(root: string, signal?: AbortSignal): Promise<string[]>;
