import { type InstallMethod, type UpdateEvent, type UpdateStatus } from '../shared/update.js';
export declare const DEFAULT_PROJECT_ROOT: string;
export declare const NPM_REGISTRY_ORIGIN = "https://registry.npmjs.org";
export declare const NPM_LATEST_URL = "https://registry.npmjs.org/codebase-onboarder/latest";
export declare const GITHUB_RELEASES_TAG_URL = "https://api.github.com/repos/Amitpandey88/onboarder/releases/tags";
export declare const UPDATE_CACHE_TTL_MS: number;
export interface CachedUpdateRecord {
    checkedAt: string;
    currentVersion: string;
    latestVersion: string;
    requiredNode: string | null;
    tarball: string | null;
    integrity: string | null;
    releaseNotes?: string | null;
}
export interface InstallationInfo {
    packageName: string;
    currentVersion: string;
    projectRoot: string;
    method: InstallMethod;
    prefix: string | null;
    localRoot: string | null;
    canAutoUpdate: boolean;
    reason: string | null;
    manualCommand: string;
    npmBin: string | null;
    gitBin: string | null;
}
export interface RegistryRelease {
    version: string;
    requiredNode: string | null;
    tarball: string | null;
    integrity: string | null;
    checkedAt: string;
}
export interface UpdateCheckOptions {
    force?: boolean;
    cacheOnly?: boolean;
    includeNotes?: boolean;
    configFile?: string | null;
    cacheFile?: string | null;
    settings?: {
        updateCheck?: boolean;
    } | null;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    projectRoot?: string;
    currentVersion?: string;
    platform?: NodeJS.Platform;
    execPath?: string;
    serverMode?: string | null;
    canRestart?: boolean;
    ttlMs?: number;
    timeoutMs?: number;
    now?: number;
    signal?: AbortSignal;
    writeCache?: boolean;
    runGit?: GitRunner;
    exists?: (p: string) => boolean;
    isWritable?: (p: string) => boolean;
}
export interface ApplyUpdateOptions extends UpdateCheckOptions {
    targetVersion?: string;
    spawnCommand?: CommandRunner;
}
export type GitRunner = (args: string[], cwd: string) => Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>;
export type CommandRunner = (command: string, args: string[], options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    onLine: (line: string) => void;
    signal?: AbortSignal;
}) => Promise<number>;
export declare function isUpdating(): boolean;
export declare function updateCachePath(configFile?: string): string;
export declare function isAutoUpdateCheckDisabled(env?: NodeJS.ProcessEnv, settings?: {
    updateCheck?: boolean;
} | null): boolean;
export declare function readInstalledPackage(projectRoot?: string): {
    name: string;
    version: string;
};
export declare function findNpmBinary(options?: {
    execPath?: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    exists?: (p: string) => boolean;
}): string | null;
export declare function detectInstallationSync(options?: {
    projectRoot?: string;
    currentVersion?: string;
    targetVersion?: string | null;
    platform?: NodeJS.Platform;
    execPath?: string;
    env?: NodeJS.ProcessEnv;
    exists?: (p: string) => boolean;
    isWritable?: (p: string) => boolean;
}): InstallationInfo;
/** Verify whether a Git source checkout is safe to fast-forward update in place. */
export declare function assessInstallation(base: InstallationInfo, runGit?: GitRunner): Promise<InstallationInfo>;
export declare function fetchRegistryRelease(options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
    now?: number;
}): Promise<RegistryRelease>;
export declare function fetchReleaseNotes(version: string, options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
}): Promise<string | null>;
export declare function readUpdateCache(cacheFile: string): Promise<CachedUpdateRecord | null>;
export declare function writeUpdateCache(cacheFile: string, record: CachedUpdateRecord): Promise<void>;
export declare function buildUpdateStatus(install: InstallationInfo, options: {
    latestVersion: string | null;
    checkedAt: string | null;
    fromCache: boolean;
    checkDisabled: boolean;
    requiredNode?: string | null;
    releaseNotes?: string | null;
    error?: string | null;
    serverMode?: string | null;
    canRestart?: boolean;
}): UpdateStatus;
export declare function checkForUpdates(options?: UpdateCheckOptions): Promise<UpdateStatus>;
/** Fire-and-forget cache refresh for interactive long-lived sessions; never throws or blocks exit. */
export declare function refreshUpdateCacheInBackground(options?: UpdateCheckOptions): void;
export declare function buildUpdateSteps(install: InstallationInfo, targetVersion: string, ctx: {
    tmpDir: string;
    emptyHooksDir: string;
}): Array<{
    command: string;
    args: string[];
    cwd: string;
    label: string;
}>;
export declare function applyUpdate(options?: ApplyUpdateOptions, onEvent?: (event: UpdateEvent) => void): Promise<Extract<UpdateEvent, {
    type: 'done';
}>>;
export declare function canVerifyNodeUpdate(version: string): boolean;
