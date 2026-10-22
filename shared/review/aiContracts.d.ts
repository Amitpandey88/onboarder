import type { ReviewMode } from './contracts.js';
export interface ReviewCitation {
    id: string;
    path: string;
    startLine: number;
    endLine: number;
    text: string;
    revision: string;
    sourceHash: string;
    reason: string;
}
export interface ReviewLimits {
    maxContextBytes: number;
    maxExcerpts: number;
    maxChangedFiles: number;
    maxOutputTokens: number;
    timeoutMs: number;
    maxRequestsPerMinute: number;
}
export interface ReviewChange {
    path: string;
    lines: number[];
    symbols: {
        name: string;
        line: number;
        kind: string;
    }[];
    exports: string[];
    relatedFiles: string[];
}
export interface ReviewContext {
    schemaVersion: 1;
    mode: ReviewMode;
    revision: string;
    sourceFingerprint: string;
    evidence: ReviewCitation[];
    changes: ReviewChange[];
    relationships: {
        from: string;
        to: string;
        kind: 'dependency' | 'call' | 'reference';
        line?: number;
        name?: string;
    }[];
    routes: {
        path: string;
        line: number;
        method: string;
        route: string;
        handler: string;
    }[];
    policies: {
        path: string;
        instruction: string;
    }[];
    architecture: {
        rule: string;
        from: string;
        to: string;
        message: string;
    }[];
    architectureRules: {
        id: string;
        from: string;
        forbid: string;
        message: string;
    }[];
    existingFindings: {
        path: string;
        line: number;
        rule: string;
        message: string;
    }[];
    semantic: {
        available: boolean;
        reason?: string;
    };
    coverage: {
        analyzedFiles: number;
        changedFiles: number;
        totalChangedFiles: number;
        truncated: boolean;
        limitations: string[];
    };
}
export interface AIReview {
    schemaVersion: 1;
    engine: 'onboarder-contextual/v1';
    status: 'not-configured' | 'completed' | 'partial' | 'failed' | 'stale' | 'skipped';
    message: string;
    context?: ReviewContext;
    limits: ReviewLimits;
    accepted: number;
    rejected: number;
    deduplicated: number;
    modelAnalysisComplete?: boolean;
    rejections: string[];
    limitations: string[];
    usage: {
        requests: number;
        contextBytes: number;
        inputTokens?: number;
        outputTokens?: number;
        durationMs: number;
    };
}
