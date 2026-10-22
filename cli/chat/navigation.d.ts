export interface SearchChoice {
    value: string;
    label: string;
    detail?: string;
}
export declare const FILE_ACTIONS: readonly [{
    readonly value: 'show';
    readonly label: 'Read source';
    readonly detail: 'Line numbers and a file summary';
}, {
    readonly value: 'inspect';
    readonly label: 'Inspect this file';
    readonly detail: 'Role, exports, complexity and findings';
}, {
    readonly value: 'deps';
    readonly label: 'Trace connections';
    readonly detail: 'Imports and the files that depend on this one';
}, {
    readonly value: 'graph';
    readonly label: 'Explore its graph';
    readonly detail: 'Follow the dependency tree';
}, {
    readonly value: 'blast';
    readonly label: 'See change impact';
    readonly detail: 'What may be affected if this file changes';
}, {
    readonly value: 'explain';
    readonly label: 'Explain locally';
    readonly detail: 'Understand the module without AI';
}];
export interface FileSelection {
    path: string;
    action: typeof FILE_ACTIONS[number]['value'];
}
/** Rank contiguous matches first, then ordered character matches for paths. */
export declare function searchChoices<T extends SearchChoice>(choices: readonly T[], query: string): T[];
export declare function commandChoices(): SearchChoice[];
export declare function fileChoices(files: readonly string[]): SearchChoice[];
