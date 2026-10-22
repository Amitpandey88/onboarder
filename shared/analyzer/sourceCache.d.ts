import type { FileSource } from '../contracts.js';
/** One-scan read sharing. Construct a new wrapper for every refresh. */
export declare function memoizedSource(source: FileSource, maxBytes?: number): FileSource;
