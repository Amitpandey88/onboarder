export declare function analyzeHistory(scan: any, commits: any, opts?: Record<string, any>): {
    available: boolean;
    commitCount: any;
    totalCommits: any;
    truncated: boolean;
    commits: any;
    authors: any[];
    firstCommitAt: any;
    lastCommitAt: any;
    perFile: {
        path: any;
        name: any;
        churn: any;
        authors: any;
        solo: boolean;
        firstSeen: any;
        lastTouched: any;
        complexity: number;
        hotspot: number;
    }[];
    byPath: Record<string, any>;
    soloFiles: number;
    coChanged: any[];
    pathsGone: number;
};
export declare function unavailableHistory(reason: any): {
    available: boolean;
    reason: any;
};
