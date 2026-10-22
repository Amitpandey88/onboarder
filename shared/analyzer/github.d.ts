/**
 * The `owner/repo` a git URL points at, or null if it is not a GitHub URL.
 *
 * Both URL shapes git accepts: `https://github.com/owner/repo(.git)` and
 * `git@github.com:owner/repo(.git)`. Anything else is not GitHub, and gets no
 * remote lookup — a GitLab or Bitbucket clone is a real outcome, not an error.
 */
export declare function githubRepoPath(url: any): string;
/**
 * The public facts worth showing, read out of `GET /repos/{owner}/{repo}`.
 *
 * Returns null for anything that is not an object, so a caller can tell "no
 * facts" from "all zeroes" without a try/catch around every field.
 */
export declare function remoteFacts(json: any): {
    stars: number;
    forks: number;
    watching: number;
    issues: number;
    description: any;
    license: any;
    created: any;
    pushed: any;
    branch: any;
    topics: any;
    homepage: any;
    archived: boolean;
};
/**
 * Why a remote lookup did not produce facts, in the words a person can act on.
 *
 * 403, 404 and 429 are separated because they mean opposite things — one is
 * "ask less often, or authenticate", one is "private, or gone, or never there",
 * and one is "slow down" — and collapsing them into "GitHub said no" helps
 * nobody diagnose anything.
 */
export declare function remoteError(status: any): string;
