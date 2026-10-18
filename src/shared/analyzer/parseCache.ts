import type { FileAnalysis } from '../contracts.js';
import { utf8ByteLength } from './scanControl.js';
type Entry = { text: string; analysis: FileAnalysis };
/** Bound retained source independently from the repository's file-count limit. */
export class ParseCache extends Map<string, Entry> {
  private bytes = 0;
  private weights = new Map<string, number>();
  constructor(readonly maxBytes = 32 * 1024 * 1024) { super(); }
  override set(key: string, value: Entry): this {
    this.delete(key);
    const size = utf8ByteLength(value.text);
    if (size > this.maxBytes) return this;
    super.set(key, value); this.weights.set(key, size); this.bytes += size;
    while (this.bytes > this.maxBytes) this.delete(this.keys().next().value!);
    return this;
  }
  override delete(key: string) {
    this.bytes -= this.weights.get(key) || 0; this.weights.delete(key);
    return super.delete(key);
  }
  override clear() { super.clear(); this.weights.clear(); this.bytes = 0; }
}
