export declare function initSearch(files: any[], options: any): {
    show: (opener?: HTMLElement) => void;
    hide: (restoreFocus?: boolean) => void;
    destroy: () => void;
    updateFiles: (newFiles: any, newScanId: any) => void;
    isShowing: () => boolean;
};
