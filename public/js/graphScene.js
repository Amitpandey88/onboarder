/** Bounded display projection. All source files remain searchable. */
export const GRAPH_NODE_LIMIT = 700;
export const GRAPH_EDGE_LIMIT = 1800;
export class GraphIndex {
    links;
    ordered;
    byPath;
    constructor(files, links) {
        this.links = links;
        this.byPath = new Map(files.map(file => [file.path, file]));
        this.ordered = [...this.byPath.values()].sort((a, b) => ((b.fanIn || 0) + (b.fanOut || 0)) - ((a.fanIn || 0) + (a.fanOut || 0)) || a.path.localeCompare(b.path));
    }
    select(query = '', focus = '') {
        const term = query.trim().toLowerCase();
        const selected = new Map();
        if (focus && this.byPath.has(focus))
            selected.set(focus, this.byPath.get(focus));
        let matches = 0;
        for (const file of this.ordered) {
            if (term && !file.path.toLowerCase().includes(term))
                continue;
            matches++;
            if (selected.size < GRAPH_NODE_LIMIT)
                selected.set(file.path, file);
        }
        if (term && selected.size < GRAPH_NODE_LIMIT) {
            // Context is one hop from matching files, without recursively expanding hubs.
            const seeds = new Set(selected.keys());
            for (const link of this.links) {
                const neighbor = seeds.has(link.from) ? link.to : seeds.has(link.to) ? link.from : '';
                if (neighbor && this.byPath.has(neighbor))
                    selected.set(neighbor, this.byPath.get(neighbor));
                if (selected.size >= GRAPH_NODE_LIMIT)
                    break;
            }
        }
        const edges = [];
        const seen = new Set();
        for (const link of this.links) {
            if (!selected.has(link.from) || !selected.has(link.to))
                continue;
            const key = JSON.stringify([link.from, link.to]);
            if (seen.has(key))
                continue;
            seen.add(key);
            edges.push(link);
            if (edges.length >= GRAPH_EDGE_LIMIT)
                break;
        }
        return { nodes: [...selected.values()], edges, matches, totalFiles: this.byPath.size,
            totalEdges: this.links.length, limited: selected.size < this.byPath.size || edges.length < this.links.length };
    }
}
//# sourceMappingURL=graphScene.js.map