import type { LanguageAnalyzer } from '../../contracts.js';
export declare const languages: LanguageAnalyzer[];
export declare function languageFor(path: string): LanguageAnalyzer | null;
export declare function languageLabel(id: string, { short }?: {
    short?: boolean;
}): string;
