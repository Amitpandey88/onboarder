import type { RunManifest } from './contracts.js';
export declare function createCheckpoint(manifest: RunManifest, files: string[]): Promise<{
    id: string;
    digest: string;
    createdAt: string;
    files: {
        file: string;
        sha256: string | null;
    }[];
}>;
export declare function restoreCheckpoint(manifest: RunManifest, id: string, expectedHashes: Record<string, unknown>, expectedDigest?: string): Promise<{
    id: string;
    restored: string[];
    note: string;
}>;
