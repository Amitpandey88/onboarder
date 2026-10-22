export declare const DEFAULT_SETTINGS: {
    connection: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    hermesModel: string;
};
export declare function getSettings(displayModel?: boolean): {
    connection: string;
    baseUrl: string;
    model: string;
    hermesModel: string;
    apiKey: string;
};
export declare function saveSettings(settings: any): void;
export declare function isConfigured(): boolean;
export declare function isAzureHost(baseUrl: any): boolean;
export declare function fileMessages({ repoName, overview, path, role, fanIn, fanOut, importers, imports, functions, exports_, source }: {
    exports_: any;
    fanIn: any;
    fanOut: any;
    functions: any;
    importers: any;
    imports: any;
    overview: any;
    path: any;
    repoName: any;
    role: any;
    source: any;
}): {
    role: string;
    content: string;
}[];
export declare function overviewMessages({ repoName, overview, entries, hubs, services, cycles, orphans, languages }: {
    cycles: any;
    entries: any;
    hubs: any;
    languages: any;
    orphans: any;
    overview: any;
    repoName: any;
    services: any;
}): {
    role: string;
    content: string;
}[];
export declare function diagramMessages({ repoName, kind, facts }: {
    facts: any;
    kind: any;
    repoName: any;
}): {
    role: string;
    content: string;
}[];
export declare function fileDocMessages({ repoName, overview, file }: {
    file: any;
    overview: any;
    repoName: any;
}): {
    role: string;
    content: string;
}[];
export declare function folderDocDetailedMessages({ repoName, folder, subfolders, files }: {
    files: any;
    folder: any;
    repoName: any;
    subfolders: any;
}): {
    role: string;
    content: string;
}[];
export declare function repoDocMessages({ repoName, overview, readmeExcerpt, entries, hubs }: {
    entries: any;
    hubs: any;
    overview: any;
    readmeExcerpt: any;
    repoName: any;
}): {
    role: string;
    content: string;
}[];
export declare function folderDocMessages({ repoName, folder, subfolders, files }: {
    files: any;
    folder: any;
    repoName: any;
    subfolders: any;
}): {
    role: string;
    content: string;
}[];
export declare function questionMessages({ repoName, overview, question, file }: {
    file: any;
    overview: any;
    question: any;
    repoName: any;
}): {
    role: string;
    content: string;
}[];
export declare function stackSummaryMessages({ repoName, item, docsText, repoNote }: {
    docsText: any;
    item: any;
    repoName: any;
    repoNote: any;
}): {
    role: string;
    content: string;
}[];
export declare function analysisMessages({ repoName, grade, score, counts, engines, findings, question }: {
    counts: any;
    engines: any;
    findings: any;
    grade: any;
    question: any;
    repoName: any;
    score: any;
}): {
    role: string;
    content: string;
}[];
export declare function streamTokens(container: any, text: any): Promise<void>;
