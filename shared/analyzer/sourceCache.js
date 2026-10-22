import { utf8ByteLength } from './scanControl.js';
/** One-scan read sharing. Construct a new wrapper for every refresh. */
export function memoizedSource(source, maxBytes = 64 * 1024 * 1024) {
    const reads = new Map();
    let bytes = 0;
    return { ...source, read(file) {
            const existing = reads.get(file);
            if (existing)
                return existing;
            const promise = source.read(file).then(text => {
                const size = utf8ByteLength(text);
                if (bytes + size > maxBytes)
                    reads.delete(file);
                else
                    bytes += size;
                return text;
            }, error => { reads.delete(file); throw error; });
            reads.set(file, promise);
            return promise;
        } };
}
//# sourceMappingURL=sourceCache.js.map