export declare const TOOL_DEFS: ({
    id: string;
    label: string;
    kind: string;
    purpose: string;
    commands: ({
        kind: string;
        bin: string;
        pkg?: undefined;
    } | {
        kind: string;
        pkg: string;
        bin: string;
    })[];
    install: string[];
    options: {
        key: string;
        label: string;
        type: string;
        values: string[];
        default: string;
        hint: string;
    }[];
    argv: (root: any, options?: Record<string, any>) => any[];
    parse: (text: any, root: any) => any[];
    usesReportFile?: undefined;
    textOutput?: undefined;
} | {
    id: string;
    label: string;
    kind: string;
    purpose: string;
    commands: {
        kind: string;
        bin: string;
    }[];
    install: string[];
    options: {
        key: string;
        label: string;
        type: string;
        default: boolean;
        hint: string;
    }[];
    usesReportFile: boolean;
    argv: (root: any, options?: Record<string, any>, ctx?: Record<string, any>) => any[];
    parse: (text: any, root: any) => any[];
    textOutput?: undefined;
} | {
    usesReportFile?: undefined;
    id: string;
    label: string;
    kind: string;
    purpose: string;
    commands: ({
        pkg?: undefined;
        kind: string;
        bin: string;
    } | {
        kind: string;
        pkg: string;
        bin: string;
    })[];
    install: string[];
    options: {
        key: string;
        label: string;
        type: string;
        values: string[];
        default: any[];
        hint: string;
    }[];
    argv: (root: any, options?: Record<string, any>) => any[];
    parse: (text: any, root: any) => any[];
    textOutput?: undefined;
} | {
    usesReportFile?: undefined;
    id: string;
    label: string;
    kind: string;
    purpose: string;
    commands: ({
        pkg?: undefined;
        kind: string;
        bin: string;
    } | {
        kind: string;
        pkg: string;
        bin: string;
    })[];
    install: string[];
    options: {
        key: string;
        label: string;
        type: string;
        min: number;
        max: number;
        default: number;
        hint: string;
    }[];
    argv: (root: any, options?: Record<string, any>) => any[];
    parse: (text: any, root: any) => any[];
    textOutput: boolean;
} | {
    usesReportFile?: undefined;
    textOutput?: undefined;
    id: string;
    label: string;
    kind: string;
    purpose: string;
    commands: ({
        pkg?: undefined;
        kind: string;
        bin: string;
    } | {
        kind: string;
        pkg: string;
        bin: string;
    })[];
    install: string[];
    options: {
        key: string;
        label: string;
        type: string;
        default: boolean;
        hint: string;
    }[];
    argv: (root: any, options?: Record<string, any>) => any[];
    parse: (text: any) => any[];
})[];
export declare function sanitizeOptions(def: any, raw: any): Record<string, any>;
export declare function defaultOptions(def: any): Record<string, any>;
