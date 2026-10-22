export declare function monacoLangOf(path: string): string;
export declare function initViewer(container: HTMLElement, theme: string): Promise<boolean>;
export declare function showInViewer(text: string, lang: string, theme: string): void;
export declare function setViewerTheme(theme: string): void;
export declare function revealLineInViewer(line: unknown): void;
