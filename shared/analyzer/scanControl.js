export const DEFAULT_LIMITS = Object.freeze({
    maxFiles: 4000,
    maxFileSize: 200 * 1024,
    readConcurrency: 8,
});
export function normalizeScanOptions(options = {}) {
    const whole = (key, maximum) => {
        const value = options[key] ?? DEFAULT_LIMITS[key];
        if (!Number.isInteger(value) || value < 1 || value > maximum) {
            throw new RangeError(`${key} must be a whole number from 1 to ${maximum}.`);
        }
        return value;
    };
    return {
        maxFiles: whole('maxFiles', 100_000),
        maxFileSize: whole('maxFileSize', 10 * 1024 * 1024),
        readConcurrency: whole('readConcurrency', 32),
    };
}
export class ScanAbortedError extends Error {
    constructor() {
        super('The scan was cancelled.');
        this.name = 'AbortError';
    }
}
export function throwIfAborted(signal) {
    if (signal?.aborted)
        throw new ScanAbortedError();
}
/** Stops waiting promptly, while still observing the underlying I/O promise. */
export function abortable(promise, signal) {
    if (!signal)
        return promise;
    return new Promise((resolve, reject) => {
        const aborted = () => { cleanup(); reject(new ScanAbortedError()); };
        const cleanup = () => signal.removeEventListener('abort', aborted);
        signal.addEventListener('abort', aborted, { once: true });
        promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
        if (signal.aborted)
            aborted();
    });
}
/** Exact UTF-8 size, including replacement bytes for unpaired surrogates. */
export function utf8ByteLength(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        const unit = text.charCodeAt(i);
        if (unit < 0x80)
            bytes += 1;
        else if (unit < 0x800)
            bytes += 2;
        else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length &&
            text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
            bytes += 4;
            i++;
        }
        else
            bytes += 3;
    }
    return bytes;
}
//# sourceMappingURL=scanControl.js.map