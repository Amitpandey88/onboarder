import { GithubClient } from './github.js';
/** Resolve immutable Git objects, checking modes before reading any blob. The
 * contents API can dereference symlinks, so it cannot enforce our file scope. */
export declare class GithubSourceReader {
    private client;
    private roots;
    private trees;
    constructor(client: GithubClient);
    read(file: string, sha: string): Promise<{
        repository: string;
        file: string;
        commitSha: string;
        blobSha: string;
        content: string;
        sha256: string;
        bytes: number;
    }>;
}
