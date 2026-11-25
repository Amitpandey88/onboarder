/** Portable update types, version comparison, and formatting helpers shared across server, CLI, and browser. */
export type InstallMethod = 'npm-global' | 'npm-local' | 'npx' | 'source' | 'standalone';
export interface UpdateStatus {
    packageName: string;
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    upToDate: boolean;
    checkedAt: string | null;
    fromCache: boolean;
    checkDisabled: boolean;
    installMethod: InstallMethod;
    canAutoUpdate: boolean;
    canRestart: boolean;
    serverMode: string | null;
    reason: string | null;
    manualCommand: string;
    releaseUrl: string | null;
    npmUrl: string | null;
    nodeCompatible: boolean;
    requiredNode: string | null;
    releaseNotes: string | null;
    installing: boolean;
    error: string | null;
}
export type UpdateEvent = {
    type: 'status';
    phase: 'checking' | 'installing' | 'verifying';
    message: string;
} | {
    type: 'log';
    line: string;
} | {
    type: 'done';
    ok: boolean;
    previousVersion: string;
    currentVersion: string;
    updatedTo?: string;
    alreadyCurrent?: boolean;
    restartRequired?: boolean;
    canRestart?: boolean;
    manualCommand?: string;
    error?: string;
};
export interface ParsedSemver {
    major: number;
    minor: number;
    patch: number;
    pre: string[];
}
export declare const PACKAGE_NAME = "codebase-onboarder";
export declare const REPO_SLUG = "Amitpandey88/onboarder";
/** Validate a version string received from a registry before passing it to npm or building URLs. */
export declare function isValidVersionString(version: unknown): version is string;
/** Parse a SemVer 2.0.0 version string into comparable numeric and prerelease components. */
export declare function parseSemver(version: unknown): ParsedSemver | null;
/** Compare two SemVer strings: returns 1 if a > b, -1 if a < b, 0 if equal or unparseable. */
export declare function compareVersions(a: string, b: string): number;
/** True only when both versions are valid SemVer and latest is strictly newer than current. */
export declare function isUpdateAvailable(current: string, latest: string | null | undefined): boolean;
/** Check simple lower-bound Node engine constraints such as ">=20" or ">=20.19.0". */
export declare function satisfiesMinimumNode(nodeVersion: string, engineRange: string | null | undefined): boolean;
export declare function releaseNotesUrl(version: string | null | undefined): string | null;
export declare function npmPackageUrl(version: string | null | undefined): string | null;
export declare function installMethodLabel(method: InstallMethod): string;
