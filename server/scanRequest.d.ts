import type { ScanRequest } from '../shared/contracts.js';
/** Validate untrusted JSON before touching the filesystem or cloning anything. */
export declare function parseScanRequest(value: unknown): ScanRequest;
