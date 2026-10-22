import type { TriageItem, TriagePolicy } from './contracts.js';
export declare const DEFAULT_TRIAGE_POLICY: TriagePolicy;
export declare function triagePolicy(value?: unknown): TriagePolicy;
export declare const sensitivePath: (p: string) => boolean;
export declare const policyPath: (p: string) => boolean;
export declare function prioritize(item: TriageItem, now?: number): TriageItem;
export declare function filterTriage(items: TriageItem[], input?: {
    view?: string;
    query?: string;
    sort?: string;
}): TriageItem[];
