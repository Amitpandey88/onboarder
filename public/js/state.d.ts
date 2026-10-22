import type { ReviewReport } from '../../shared/review/contracts.js';
export declare const EXPLORER_VIEWS: string[];
export declare const state: {
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
        report: ReviewReport | null;
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
};
export declare function loadRepo({ scan, facts, manifest, history, scanId, cloneId }: {
    cloneId: any;
    facts: any;
    history: any;
    manifest: any;
    scan: any;
    scanId: any;
}, extra?: Record<string, any>): {
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
        report: ReviewReport | null;
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
};
export declare function unloadRepo(): void;
export declare function focusFile(path: any): void;
export declare function focusFolder(path: any): void;
export declare function clearFocus(): void;
export declare function inspectorSubject(s?: {
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
        report: ReviewReport | null;
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
}): {
    kind: string;
    path: any;
    backLabel: any;
} | {
    path?: undefined;
    kind: string;
    backLabel: any;
};
export declare function inspectorBackLabel(s?: {
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
        report: ReviewReport | null;
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
}): any;
export declare function isExplorerView(view: any): boolean;
export declare function aiViewKey(s?: {
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
        report: ReviewReport | null;
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
}): string;
export declare function defaultCodePath(s?: {
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
        report: ReviewReport | null;
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
}): any;
export declare function pushCodeHistory(path: any, s?: {
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
        report: ReviewReport | null;
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
export declare function codeHistoryTarget(delta: any, s?: {
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
        report: ReviewReport | null;
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
}): any;
