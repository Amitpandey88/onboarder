export type PanelStyle = 'label' | 'frame' | 'hint' | 'title';
export interface PanelRow {
    label?: string;
    value?: unknown;
    hint?: string;
}
export interface PanelOptions {
    indent?: string;
    columns?: number;
    paint?: (text: string, style: PanelStyle) => string;
}
export declare function width(text: unknown): number;
export declare function termWidth(stream?: NodeJS.WriteStream & {
    fd: 1;
}): number;
export declare function fit(text: unknown, max: number, { tail }?: {
    tail?: boolean;
}): string;
export declare function panel(title: string, rows: PanelRow[], { indent, columns, paint }?: PanelOptions): string;
export declare const hint: (text: string) => {
    hint: string;
};
export declare const row: (label: string, value: unknown) => {
    label: string;
    value: string;
};
