export declare function createServerDrawer(options?: Record<string, any>): {
    open: () => Promise<void>;
    close: () => void;
    isOpen: () => boolean;
};
