import { type UpdateEvent, type UpdateStatus } from '../shared/update.js';
import { type ApplyUpdateOptions, type UpdateCheckOptions } from '../server/update.js';
export declare const UPDATE_HELP = "\n  Onboarder update \u2014 detect and install the latest release\n\n  Usage\n    onboarder update                 Check for an update and prompt to install\n    onboarder update check           Check the npm registry without installing\n    onboarder update install         Install the latest compatible release\n    onboarder update --check         Same as `onboarder update check`\n    onboarder update --yes           Install without prompting (for scripts)\n    onboarder update --restart       Restart a running background server after updating\n    onboarder update --notes         Include GitHub release notes when available\n    onboarder update --json          Machine-readable JSON output\n\n  Aliases\n    onboarder upgrade\n\n  Environment\n    ONBOARDER_NO_UPDATE_CHECK=1      Disable automatic background update checks\n";
export declare function formatUpdateHintLine(status: UpdateStatus | null): string;
export declare function formatUpdateStatusText(status: UpdateStatus, options?: {
    verbose?: boolean;
}): string;
export declare function readCachedUpdateHint(configFile?: string, settings?: {
    updateCheck?: boolean;
} | null, env?: NodeJS.ProcessEnv): Promise<UpdateStatus | null>;
export interface UpdateCommandDeps {
    flags?: Record<string, any>;
    out?: (line: string) => void;
    err?: (line: string) => void;
    confirmFn?: (question: string, fallback?: boolean) => Promise<boolean>;
    checkFn?: (options: UpdateCheckOptions) => Promise<UpdateStatus>;
    applyFn?: (options: ApplyUpdateOptions, onEvent: (event: UpdateEvent) => void) => Promise<Extract<UpdateEvent, {
        type: 'done';
    }>>;
    restartFn?: (options: {
        flags: Record<string, any>;
        out: (line: string) => void;
        err: (line: string) => void;
    }) => Promise<number>;
    isServerRunning?: (configFile: string) => number | null;
    isTTY?: boolean;
}
export declare function updateCommand(action: string | undefined, rest?: string[], deps?: UpdateCommandDeps): Promise<number>;
