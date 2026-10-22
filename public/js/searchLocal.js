import { matchesPathFilters, queryIsEmpty, scorePath, scoreSymbol } from '../../shared/search/query.js';
/** Extract and deduplicate declarations once per scan, rather than once per key. */
export function buildLocalSearchIndex(files) {
    return files.map(file => {
        const path = typeof file === 'string' ? file : file.path;
        const symbols = new Map();
        function put(d, kind, suffix = '') {
            if (!d?.name)
                return;
            const existing = symbols.get(d.name);
            if (existing && (existing.line || !d.line))
                return;
            symbols.set(d.name, { name: d.name + suffix, symbol: d.name, kind, line: d.line });
        }
        if (typeof file !== 'string') {
            for (const d of file.classes || [])
                put(d, d.kind || 'class');
            for (const d of file.functions || [])
                put(d, d.kind || 'function', '()');
            for (const d of file.exports || [])
                put({ ...d, line: undefined }, 'export ' + (d.kind || ''));
        }
        return { path, symbols: [...symbols.values()] };
    }).filter(file => !!file.path);
}
const compare = (a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.order - b.order;
/** A bounded heap keeps the best rows while retaining exact match counts. */
class BestRows {
    limit;
    rows = [];
    count = 0;
    constructor(limit) {
        this.limit = limit;
    }
    add(row) {
        this.count++;
        if (this.limit === 0)
            return;
        if (this.rows.length < this.limit) {
            this.rows.push(row);
            let i = this.rows.length - 1;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (compare(this.rows[i], this.rows[p]) <= 0)
                    break;
                [this.rows[i], this.rows[p]] = [this.rows[p], this.rows[i]];
                i = p;
            }
        }
        else if (compare(row, this.rows[0]) < 0) {
            this.rows[0] = row;
            let i = 0;
            while (i * 2 + 1 < this.rows.length) {
                let child = i * 2 + 1;
                if (child + 1 < this.rows.length && compare(this.rows[child + 1], this.rows[child]) > 0)
                    child++;
                if (compare(this.rows[child], this.rows[i]) <= 0)
                    break;
                [this.rows[i], this.rows[child]] = [this.rows[child], this.rows[i]];
                i = child;
            }
        }
    }
    sorted() { return this.rows.sort(compare); }
}
export function searchLocalIndex(index, parsed, limit = 40) {
    const cap = Math.max(0, Math.min(200, Math.floor(limit)));
    const files = new BestRows(cap);
    const symbols = new BestRows(cap);
    if (!queryIsEmpty(parsed)) {
        let order = 0;
        for (const file of index) {
            if (!matchesPathFilters(parsed, file.path))
                continue;
            const score = scorePath(parsed, file.path);
            if (score > 0)
                files.add({ type: 'file', path: file.path, score, order: order++ });
            for (const symbol of file.symbols) {
                const score = scoreSymbol(parsed, symbol.name, symbol.kind);
                if (score > 0)
                    symbols.add({ type: 'symbol', path: file.path, score, ...symbol, order: order++ });
            }
        }
    }
    return { files: files.sorted(), symbols: symbols.sorted(), counts: { files: files.count, symbols: symbols.count } };
}
//# sourceMappingURL=searchLocal.js.map