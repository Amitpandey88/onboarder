import { utf8ByteLength } from './scanControl.js';
/** Bound retained source independently from the repository's file-count limit. */
export class ParseCache extends Map {
    maxBytes;
    bytes = 0;
    weights = new Map();
    constructor(maxBytes = 32 * 1024 * 1024) {
        super();
        this.maxBytes = maxBytes;
    }
    set(key, value) {
        this.delete(key);
        const size = utf8ByteLength(value.text);
        if (size > this.maxBytes)
            return this;
        super.set(key, value);
        this.weights.set(key, size);
        this.bytes += size;
        while (this.bytes > this.maxBytes)
            this.delete(this.keys().next().value);
        return this;
    }
    delete(key) {
        this.bytes -= this.weights.get(key) || 0;
        this.weights.delete(key);
        return super.delete(key);
    }
    clear() { super.clear(); this.weights.clear(); this.bytes = 0; }
}
//# sourceMappingURL=parseCache.js.map