/**
 * Look up a GitHub repository's public facts.
 *
 * `fetchImpl` is a parameter so this is testable without a network, and so the
 * caller can pass an already-aborted-aware fetch if it has one.
 *
 * Returns `{ ok: true, facts, repoPath }` or `{ ok: false, reason }`. Never
 * throws — the reason is the return value, because every failure here is
 * something to print, not something to crash a session over.
 */
export declare function fetchRepoFacts(url: any, { fetchImpl }?: Record<string, any>): Promise<{
    ok: boolean;
    reason: string;
    facts?: undefined;
    repoPath?: undefined;
} | {
    reason?: undefined;
    ok: boolean;
    facts: any;
    repoPath: string;
}>;
