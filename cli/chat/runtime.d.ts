import { type DownloadArtifact } from '../../server/security/download.js';
export declare const HERMES_COMMIT = "dcabf76310ff26e1f264368e9e86277380d98266";
export declare function hermesInstaller(platform?: NodeJS.Platform): DownloadArtifact;
export declare function hermesInstallCommand(platform?: NodeJS.Platform): string;
/** Check the same executable and PATH used by chat, without starting a wizard. */
export declare function hermesInstalled(env?: NodeJS.ProcessEnv): Promise<boolean>;
export declare function runInteractive(command: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal, cwd?: string): Promise<number>;
/** Run the official installer with terminal input, outside the named profile. */
export declare function installHermes(signal: AbortSignal, env?: NodeJS.ProcessEnv, options?: {
    download?: typeof fetch;
    execute?: typeof runInteractive;
    artifact?: DownloadArtifact;
}): Promise<void>;
