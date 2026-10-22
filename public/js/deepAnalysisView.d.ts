export declare function initDeepAnalysis(options: any): void;
export declare function renderDeepAnalysis(container: any, appState?: {
    scan: any;
    facts: any;
    manifest: any;
    stack: any;
    health: any;
    security: any;
    history: any;
    patterns: any;
    treeData: any;
    scanId: any;
    cloneId: any;
    browserSource: any;
    view: string;
    lastExplorer: string;
    folder: string;
    detail: any;
    selected: any;
    focusedFolder: any;
    tour: {
        stops: undefined[];
        idx: number;
    };
    currentDiagram: {
        source: string;
        nodes: {};
    };
    aiDiagrams: {};
    aiActiveKey: any;
    docs: {
        rendered: boolean;
        writing: boolean;
        tabs: Map<any, any>;
        active: string;
        tabsEl: HTMLElement | null;
        wrapEl: HTMLElement | null;
        railEl: HTMLElement | null;
        bar: HTMLElement | null;
        pageEl: HTMLElement | null;
    };
    about: {
        rendered: boolean;
    };
    mm: {
        expanded: Set<string>;
    };
    filters: {
        text: string;
        showTests: boolean;
        depth: number;
    };
    atlas: {
        built: boolean;
        items: undefined[];
    };
    atlasOpen: any;
    code: {
        path: any;
        history: any[];
        idx: number;
        cache: {};
    };
    tools: {
        status: any;
        report: any;
        running: boolean;
        loading: boolean;
        findings: any[];
        merged: number;
        error: any;
        install: {};
        options: {};
    };
    analysis: {
        severity: string;
        tool: string;
        q: string;
        ai: {
            text: string;
            error: string;
            running: boolean;
            question: string;
        };
    };
    review: {
        report: import("../../shared/review/contracts.js").ReviewReport | null;
        mode: string;
        base: string;
        head: string;
        profile: string;
        severity: string;
        query: string;
        showAcknowledged: boolean;
        aiText: string;
        error: string;
        aiMode: boolean;
        source: string;
        category: string;
    };
}): void;
export declare function renderAINote(ai: any): string;
