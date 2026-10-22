export declare function setDiagramTheme(theme: any): void;
export declare function getDiagramTheme(): string;
export declare function diagramThemeConfig(): {
    theme: string;
    themeVariables: {
        darkMode: boolean;
        background: any;
        primaryColor: any;
        primaryBorderColor: any;
        primaryTextColor: any;
        secondaryColor: any;
        secondaryTextColor: any;
        tertiaryColor: any;
        tertiaryTextColor: any;
        textColor: any;
        lineColor: any;
        clusterBkg: any;
        clusterBorder: any;
        titleColor: any;
        nodeTextColor: any;
        edgeLabelBackground: any;
        fontFamily: string;
        fontSize: string;
    };
    flowchart: {
        curve: string;
        htmlLabels: boolean;
        nodeSpacing: number;
        rankSpacing: number;
    };
};
export declare function diagramThemeBlock(): string;
export declare function overviewDiagram(scan: any, facts: any): {
    source: string;
    nodes: Record<string, any>;
};
export declare function folderDiagram(scan: any, facts: any, folder: any, opts?: Record<string, any>): {
    source: string;
    nodes: {};
};
export declare function fileDetailDiagram(scan: any, facts: any, path: any): {
    source: string;
    nodes: {};
};
export declare function callsDiagram(file: any): {
    source: string;
    nodes: {};
};
export declare function servicesDiagram(scan: any, manifest: any): {
    source: string;
    nodes: {};
};
export declare function emptyDiagram(note: any): {
    source: string;
    nodes: {};
};
export declare function layersDiagram(scan: any, facts: any, layersInfo: any, opts?: Record<string, any>): {
    source: string;
    nodes: Record<string, any>;
};
export declare function healthDiagram(scan: any, facts: any, health: any, opts?: Record<string, any>): {
    source: string;
    nodes: Record<string, any>;
};
export declare function securityDiagram(scan: any, facts: any, security: any, opts?: Record<string, any>): {
    source: string;
    nodes: Record<string, any>;
};
export declare function historyDiagram(scan: any, facts: any, history: any, opts?: Record<string, any>): {
    source: string;
    nodes: {};
};
