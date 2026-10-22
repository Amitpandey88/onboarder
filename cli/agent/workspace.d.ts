import type { RunManifest } from './contracts.js';
/** File isolation only: this does not sandbox execution of repository code. */
export declare function createImplementationWorkspace(manifest: RunManifest, home: string, revision?: string, signal?: AbortSignal): Promise<RunManifest>;
