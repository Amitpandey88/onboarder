export declare const MAX_SESSIONS = 12;
export declare function openSession({ root, cloneDir, searchIndex, files }: {
    cloneDir?: any;
    files?: any[];
    root: any;
    searchIndex?: any;
}): string;
export declare function getSession(scanId: any): any;
export declare function isCloneId(id: any): boolean;
export declare function closeClone(cloneId: any): Promise<boolean>;
export declare function removalsSettled(): Promise<void>;
export declare function sweepClonesSync(): void;
export declare function installExitCleanup(proc?: NodeJS.Process): void;
export declare function _resetSessions(): void;
export declare function _sessionCount(): number;
