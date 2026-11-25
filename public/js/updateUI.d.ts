import type { UpdateStatus } from '../../shared/update.js';
import type { DesktopUpdateProgress, DesktopUpdateStatus } from './desktopHost.js';
export interface UpdateSummaryView {
    badgeText: string;
    badgeTone: 'ok' | 'available' | 'warn' | 'muted';
    buttonLabel: string;
    buttonTitle: string;
    dotClass: string;
    bannerVisible: boolean;
    bannerTitle: string;
    bannerText: string;
}
export declare function summarizeUpdateView(status: UpdateStatus | null, options?: {
    dismissedVersion?: string | null;
    busy?: boolean;
    updatedVersion?: string | null;
}): UpdateSummaryView;
export declare function summarizeDesktopUpdateView(status: DesktopUpdateStatus | null, options?: {
    busy?: boolean;
    progress?: DesktopUpdateProgress | null;
    dismissedVersion?: string | null;
}): UpdateSummaryView;
export declare function createUpdateDrawer(options?: Record<string, any>): {
    open: (openOpts?: {
        refresh?: boolean;
    }) => Promise<void>;
    close: () => void;
    check: (checkOpts?: {
        refresh?: boolean;
        silent?: boolean;
    }) => Promise<DesktopUpdateStatus | UpdateStatus>;
    syncAutoCheckPreference: (enabled: boolean) => void;
    isOpen: () => boolean;
};
