export declare function isCloneDir(dir: any): boolean;
export declare function assertGitUrl(url: any): string;
export declare function repoNameFromUrl(url: any): string;
export declare function cloneRepo(url: any): Promise<{
    id: string;
    dir: string;
}>;
export declare function removeClone(dir: any): Promise<void>;
export declare function removeCloneSync(dir: any): void;
