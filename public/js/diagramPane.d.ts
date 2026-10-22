export declare function renderInto(contentEl: any, source: any): Promise<any>;
export declare function validateDiagram(source: string): Promise<void>;
export declare function wireNodeClicks(contentEl: any, nodes: any, onClick: any): void;
export declare function makePanzoom(canvas: any, content: any): {
    fit: ({ readable }?: {
        readable?: boolean;
    }) => void;
    reset: ({ readable }?: {
        readable?: boolean;
    }) => void;
    home: () => void;
    reanchor: (before: any, after: any) => void;
    visibleAnchor: () => any;
    focusPoint: (cell: any) => void;
    readAtActualSize: () => void;
    snapshot: () => {
        scale: number;
        tx: number;
        ty: number;
    };
    restore: (viewport: any) => void;
};
export declare function downloadSvg(contentEl: any, name: any): boolean;
