export interface DownloadArtifact {
    url: string;
    sha256: string;
    maxBytes: number;
    redirectOrigins?: readonly string[];
}
/** Download data only: every redirect and byte is checked before a caller can execute it. */
export declare function verifiedDownload(artifact: DownloadArtifact, signal?: AbortSignal, download?: typeof fetch): Promise<Buffer>;
