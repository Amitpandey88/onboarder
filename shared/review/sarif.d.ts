import type { ReviewReport } from './contracts.js';
/** Interoperable output. Findings remain visible even when acknowledged locally. */
export declare function reviewSarif(report: ReviewReport): {
    version: string;
    $schema: string;
    runs: {
        tool: {
            driver: {
                name: string;
                informationUri: string;
                rules: {
                    id: string;
                    shortDescription: {
                        text: string;
                    };
                }[];
            };
        };
        versionControlProvenance: {
            revisionId: string;
        }[];
        results: {
            ruleId: string;
            ruleIndex: number;
            level: string;
            message: {
                text: string;
            };
            partialFingerprints: {
                'onboarderFinding/v1': string;
            };
            properties?: {
                evidence: import("./contracts.js").ReviewEvidence;
                source: "ai" | "static";
                verification: "evidence-validated" | "static-pattern";
                confidence?: "high" | "low" | "medium";
                confidenceReason?: string;
                relatedEvidence?: import("./aiContracts.js").ReviewCitation[];
                sourceFingerprint?: string;
                impact?: string;
            };
            locations: {
                physicalLocation: {
                    artifactLocation: {
                        uri: string;
                        uriBaseId: string;
                    };
                    region: {
                        startLine: number;
                    };
                };
            }[];
        }[];
        properties: {
            comparisonFingerprint: string;
            mode: import("./contracts.js").ReviewMode;
            limitations: string[];
            aiReview?: {
                status: "completed" | "failed" | "not-configured" | "partial" | "skipped" | "stale";
                message: string;
                usage: {
                    requests: number;
                    contextBytes: number;
                    inputTokens?: number;
                    outputTokens?: number;
                    durationMs: number;
                };
                limits: import("./aiContracts.js").ReviewLimits;
                limitations: string[];
            };
            evidence?: import("./contracts.js").ReviewEvidence;
            configuration?: import("./contracts.js").ReviewConfiguration;
            coverageStatus?: "complete" | "partial";
        };
    }[];
};
