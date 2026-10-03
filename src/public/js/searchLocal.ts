import { matchesPathFilters, queryIsEmpty, scorePath, scoreSymbol } from '../../shared/search/query.js';

interface Declaration { name?: string; kind?: string; line?: number }
interface SearchFile { path: string; classes?: Declaration[]; functions?: Declaration[]; exports?: Declaration[] }
interface SymbolRecord { name: string; symbol: string; kind: string; line?: number }
export interface LocalSearchRecord { path: string; symbols: SymbolRecord[] }
export interface LocalSearchRow { type: 'file' | 'symbol'; path: string; score: number; name?: string; symbol?: string; kind?: string; line?: number; order: number }

/** Extract and deduplicate declarations once per scan, rather than once per key. */
export function buildLocalSearchIndex(files: (SearchFile | string)[]): LocalSearchRecord[] {
  return files.map(file => {
    const path = typeof file === 'string' ? file : file.path;
    const symbols = new Map<string, SymbolRecord>();
    function put(d: Declaration, kind: string, suffix = '') {
      if (!d?.name) return;
      const existing = symbols.get(d.name);
      if (existing && (existing.line || !d.line)) return;
      symbols.set(d.name, { name: d.name + suffix, symbol: d.name, kind, line: d.line });
    }
    if (typeof file !== 'string') {
      for (const d of file.classes || []) put(d, d.kind || 'class');
      for (const d of file.functions || []) put(d, d.kind || 'function', '()');
      for (const d of file.exports || []) put({ ...d, line: undefined }, 'export ' + (d.kind || ''));
    }
    return { path, symbols: [...symbols.values()] };
  }).filter(file => !!file.path);
}
const compare = (a: LocalSearchRow, b: LocalSearchRow) => b.score - a.score || a.path.localeCompare(b.path) || a.order - b.order;
/** A bounded heap keeps the best rows while retaining exact match counts. */
class BestRows {
  rows: LocalSearchRow[] = [];
  count = 0;
  constructor(private limit: number) {}
  add(row: LocalSearchRow) {
    this.count++;
    if (this.limit === 0) return;
    if (this.rows.length < this.limit) {
      this.rows.push(row);
      let i = this.rows.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (compare(this.rows[i], this.rows[p]) <= 0) break;
        [this.rows[i], this.rows[p]] = [this.rows[p], this.rows[i]]; i = p;
      }
    } else if (compare(row, this.rows[0]) < 0) {
      this.rows[0] = row;
      let i = 0;
      while (i * 2 + 1 < this.rows.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.rows.length && compare(this.rows[child + 1], this.rows[child]) > 0) child++;
        if (compare(this.rows[child], this.rows[i]) <= 0) break;
        [this.rows[i], this.rows[child]] = [this.rows[child], this.rows[i]]; i = child;
      }
    }
  }
  sorted() { return this.rows.sort(compare); }
}
export function searchLocalIndex(index: LocalSearchRecord[], parsed: ReturnType<typeof import('../../shared/search/query.js').parseQuery>, limit = 40) {
  const cap = Math.max(0, Math.min(200, Math.floor(limit)));
  const files = new BestRows(cap); const symbols = new BestRows(cap);
  if (!queryIsEmpty(parsed)) {
    let order = 0;
    for (const file of index) {
      if (!matchesPathFilters(parsed, file.path)) continue;
      const score = scorePath(parsed, file.path);
      if (score > 0) files.add({ type: 'file', path: file.path, score, order: order++ });
      for (const symbol of file.symbols) {
        const score = scoreSymbol(parsed, symbol.name, symbol.kind);
        if (score > 0) symbols.add({ type: 'symbol', path: file.path, score, ...symbol, order: order++ });
      }
    }
  }
  return { files: files.sorted(), symbols: symbols.sorted(), counts: { files: files.count, symbols: symbols.count } };
}
