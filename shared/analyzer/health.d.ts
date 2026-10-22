export declare function analyzeHealth(scan: any, facts: any): {
    score: number;
    grade: string;
    perFile: any[];
    breakdown: any[];
    blastExact: boolean;
    totals: {
        crit: number;
        high: number;
        avgCx: number;
        orphanRatio: number;
        cycles: number;
    };
    techDebtRatio?: undefined;
    effortHours?: undefined;
    debtCategory?: undefined;
} | {
    score: number;
    grade: string;
    perFile: any;
    breakdown: any[];
    blastExact: boolean;
    totals: {
        crit: any;
        high: any;
        avgCx: number;
        orphanRatio: number;
        cycles: any;
    };
    techDebtRatio: number;
    effortHours: number;
    debtCategory: string;
};
