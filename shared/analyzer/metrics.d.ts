export declare function codeStats(source: any, lang?: string): {
    lines: number;
    code: number;
    comment: number;
    blank: number;
};
export declare function complexityOf(source: any, lang: any): number;
export declare function halsteadMetrics(source: any, lang: any): {
    n1: number;
    n2: number;
    N1: number;
    N2: number;
    vocabulary: number;
    length: number;
    volume: number;
    difficulty: number;
    effort: number;
};
export declare function cognitiveComplexity(source: any, lang: any): number;
export declare function maintainabilityIndex(halstead: any, complexity: any, loc: any): number;
