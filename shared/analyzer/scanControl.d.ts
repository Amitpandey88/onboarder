import type { ScanLimits, ScanOptions, ScanSignal } from '../contracts.js';
export declare const DEFAULT_LIMITS: Readonly<ScanLimits>;
export declare function normalizeScanOptions(options?: ScanOptions): ScanLimits;
export declare class ScanAbortedError extends Error {
    constructor();
}
export declare function throwIfAborted(signal?: ScanSignal): void;
/** Stops waiting promptly, while still observing the underlying I/O promise. */
export declare function abortable<T>(promise: Promise<T>, signal?: ScanSignal): Promise<T>;
/** Exact UTF-8 size, including replacement bytes for unpaired surrogates. */
export declare function utf8ByteLength(text: string): number;
