/**
 * The `origin` remote of a checkout, or null with a reason.
 *
 * `origin` specifically, not "the first remote": origin is the one that means
 * "where this came from". A fork's `upstream` is a different repository, and
 * reporting that repo's stars for a fork is a confident wrong answer.
 */
export declare function gitRemoteOrigin(root: any): Promise<{
    ok: boolean;
    url?: string;
    reason?: string;
}>;
