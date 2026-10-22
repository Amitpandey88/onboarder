export declare function initInspector(options?: Record<string, any>): void;
export declare function clearInspector(): void;
export declare function showFile(path: any, state: any): void;
export declare function showFolder(folder: any, { scan, facts, backLabel }: {
    backLabel: any;
    facts: any;
    scan: any;
}): void;
export declare function showOverview({ scan, facts, manifest, history }: {
    facts: any;
    history: any;
    manifest: any;
    scan: any;
}): void;
export declare function showPatterns({ scan, patterns }: {
    patterns: any;
    scan: any;
}): void;
export declare function showHealth({ scan, health }: {
    health: any;
    scan: any;
}): void;
export declare function showSecurity({ scan, security }: {
    scan: any;
    security: any;
}): void;
export declare function showHistory({ scan, history }: {
    history: any;
    scan: any;
}): void;
export declare function setExplain(html: any, sourceNote: any): void;
export declare function explainStreamWriter(headerHtml?: string): {
    push(delta: any): void;
    finish(note: any): void;
    fail(message: any): void;
};
export declare function onInspectorNavigate(handler: any): void;
