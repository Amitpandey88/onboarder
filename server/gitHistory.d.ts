export declare function gitLog(root: any): Promise<{
    ok: boolean;
    reason: string;
    text?: undefined;
    totalCommits?: undefined;
} | {
    reason?: undefined;
    ok: boolean;
    text: any;
    totalCommits: number;
}>;
export declare function parseGitLog(text: any): any[];
