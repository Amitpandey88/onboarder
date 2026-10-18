// Lightweight dependency canvas: stable layout, bounded scene, event-driven paints.
// No continuous physics loop or per-item GPU filters.
import { GraphIndex } from './graphScene.js';
import { escapeHtml } from './html.js';
export function initForceGraph(canvas, options) {
    const opts = options || {};
    const ctx = canvas.getContext('2d');
    const interactions = new AbortController();
    const listen = (target, type, handler, settings = {}) => target.addEventListener(type, handler, { ...settings, signal: interactions.signal });
    let frame = null;
    let viewActive = true;
    let active = !document.hidden;
    let destroyed = false;
    let width = 0, height = 0, pixelRatio = 1;
    let transform = { x: 0, y: 0, k: 1 };
    let nodes = [], edges = [];
    let inNeighbors = new Map(), outNeighbors = new Map();
    let index = new GraphIndex([], []);
    let sceneKey = '';
    let hovered = null, selected = null, locked = null, candidate = null;
    let dragged = null, panning = false, moved = false;
    let startX = 0, startY = 0, downX = 0, downY = 0;
    let searchQuery = '', highlightPath = '';
    let searchTimer;
    let clickTimer;
    let tooltipNode = null;
    let needsFit = true;
    let fitOnResize = true;
    let paints = 0;
    const lockBtn = document.getElementById('graphLock');
    function requestPaint() {
        if (!active || destroyed || frame !== null)
            return;
        frame = requestAnimationFrame(() => { frame = null; paint(); });
    }
    function syncLock() {
        if (!lockBtn)
            return;
        lockBtn.disabled = !locked && !candidate;
        lockBtn.setAttribute('aria-pressed', String(Boolean(locked)));
        lockBtn.textContent = locked ? 'Unlock thread' : 'Lock thread';
        lockBtn.title = locked ? 'Locked: ' + locked.path + ' · Esc to unlock' : (candidate ? 'Lock: ' + candidate.path + ' · ' : '') + 'Shift-click a node to lock its thread';
    }
    function sizeCanvas() {
        if (!active || destroyed)
            return false;
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0)
            return false;
        // Bound the backing buffer even on Retina/4K displays. CSS size stays exact.
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 4096 / rect.width, 4096 / rect.height, Math.sqrt(2_000_000 / (rect.width * rect.height)));
        const w = Math.max(1, Math.floor(rect.width * ratio)), h = Math.max(1, Math.floor(rect.height * ratio));
        const previousWidth = width, previousHeight = height;
        const changed = width !== rect.width || height !== rect.height;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        width = rect.width;
        height = rect.height;
        pixelRatio = ratio;
        if (changed) {
            if (needsFit || fitOnResize)
                fitTransform();
            else {
                transform.x += (width - previousWidth) / 2;
                transform.y += (height - previousHeight) / 2;
            }
        }
        return true;
    }
    function resize() { if (sizeCanvas())
        requestPaint(); }
    function fitTransform() {
        if (!width || !height)
            return;
        if (!nodes.length) {
            transform = { x: width / 2, y: height / 2, k: 1 };
            needsFit = false;
            return;
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const node of nodes) {
            minX = Math.min(minX, node.x - node.r);
            maxX = Math.max(maxX, node.x + node.r);
            minY = Math.min(minY, node.y - node.r);
            maxY = Math.max(maxY, node.y + node.r);
        }
        const k = Math.max(0.03, Math.min((width - 64) / Math.max(80, maxX - minX), (height - 100) / Math.max(80, maxY - minY), 2));
        transform = { k, x: width / 2 - (minX + maxX) / 2 * k, y: height / 2 - (minY + maxY) / 2 * k };
        needsFit = false;
    }
    function placeNodes() {
        // Deterministic phyllotaxis spreads nodes without a costly settling simulation.
        const angle = Math.PI * (3 - Math.sqrt(5));
        nodes.forEach((node, i) => {
            const radius = 26 * Math.sqrt(i);
            node.x = Math.cos(i * angle) * radius;
            node.y = Math.sin(i * angle) * radius;
        });
    }
    function applyScene(fit = false) {
        if (destroyed)
            return;
        const result = index.select(searchQuery, highlightPath);
        opts.onStatus?.(result.nodes.length + ' of ' + result.totalFiles + ' files · ' + result.edges.length + ' of ' + result.totalEdges + ' connections' +
            (searchQuery ? ' · ' + result.matches + (result.matches === 1 ? ' match' : ' matches') : result.limited ? ' · Search to find other files' : ''));
        const key = JSON.stringify([result.nodes.map(n => [n.path, n.fanIn, n.fanOut, n.community, n.risk]), result.edges]);
        if (key === sceneKey) {
            requestPaint();
            return;
        }
        clearTimeout(clickTimer);
        sceneKey = key;
        const previous = new Map(nodes.map(node => [node.path, node]));
        const first = nodes.length === 0;
        nodes = result.nodes.map((node, i) => {
            const old = previous.get(node.path);
            const angle = i * Math.PI * (3 - Math.sqrt(5));
            const radius = 26 * Math.sqrt(i);
            return { ...node, x: old?.x ?? Math.cos(angle) * radius, y: old?.y ?? Math.sin(angle) * radius,
                r: Math.max(4, Math.min(15, 4 + Math.sqrt(Number(node.fanIn) || 0) * 1.7)),
                basename: node.path.split('/').pop() || node.path, lowerPath: node.path.toLowerCase() };
        });
        const byPath = new Map(nodes.map(node => [node.path, node]));
        const keep = (node) => byPath.get(node?.path) || null;
        hovered = keep(hovered);
        selected = keep(selected);
        locked = keep(locked);
        candidate = keep(candidate);
        dragged = null;
        panning = false;
        updateTooltip(null);
        syncLock();
        edges = result.edges.map(link => ({ source: byPath.get(link.from), target: byPath.get(link.to) }));
        inNeighbors = new Map(nodes.map(node => [node, new Set()]));
        outNeighbors = new Map(nodes.map(node => [node, new Set()]));
        for (const edge of edges) {
            outNeighbors.get(edge.source).add(edge.target);
            inNeighbors.get(edge.target).add(edge.source);
        }
        if (fit || first) {
            needsFit = true;
            fitOnResize = true;
            sizeCanvas();
            fitTransform();
        }
        requestPaint();
    }
    function update(files, links) { if (destroyed)
        return; index = new GraphIndex(files, links || []); applyScene(); }
    function paint() {
        if (!active || destroyed || !width || !height)
            return;
        paints++;
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);
        const dark = document.documentElement.dataset.theme === 'dark';
        const focus = locked || hovered || selected;
        const hasFocus = Boolean(focus || highlightPath || searchQuery);
        const incoming = inNeighbors.get(focus), outgoing = outNeighbors.get(focus);
        const prominent = (node) => node === focus || incoming?.has(node) || outgoing?.has(node) ||
            node.path === highlightPath || Boolean(searchQuery && node.lowerPath.includes(searchQuery));
        const left = -transform.x / transform.k, right = (width - transform.x) / transform.k;
        const top = -transform.y / transform.k, bottom = (height - transform.y) / transform.k;
        const visible = (node) => node.x + node.r >= left && node.x - node.r <= right && node.y + node.r >= top && node.y - node.r <= bottom;
        const visibleEdge = (edge) => !(Math.max(edge.source.x, edge.target.x) < left || Math.min(edge.source.x, edge.target.x) > right ||
            Math.max(edge.source.y, edge.target.y) < top || Math.min(edge.source.y, edge.target.y) > bottom);
        // One path per edge style instead of a separate GPU operation per connection.
        for (let layer = 0; layer < 3; layer++) {
            ctx.beginPath();
            for (const edge of edges) {
                const kind = focus && edge.source === focus ? 1 : focus && edge.target === focus ? 2 : 0;
                if (kind !== layer || !visibleEdge(edge))
                    continue;
                ctx.moveTo(edge.source.x, edge.source.y);
                ctx.lineTo(edge.target.x, edge.target.y);
            }
            ctx.strokeStyle = layer === 1 ? '#f43f5e' : layer === 2 ? '#38bdf8' : dark ? '#ece7db' : '#57503f';
            ctx.lineWidth = (layer ? 1.8 : 0.7) / transform.k;
            ctx.globalAlpha = layer ? 0.9 : hasFocus ? 0.06 : 0.19;
            ctx.stroke();
        }
        const visibleNodes = nodes.filter(visible);
        for (const node of visibleNodes) {
            const important = prominent(node);
            ctx.globalAlpha = hasFocus && !important ? 0.22 : 0.95;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
            ctx.fillStyle = 'hsl(' + ((Number(node.community) || Number(node.fanIn) || 0) * 137.5 % 360) + ',60%,' + (dark ? '64' : '42') + '%)';
            ctx.fill();
        }
        // Highlight rings are batched too, including a hub with hundreds of neighbors.
        for (const target of [false, true]) {
            let count = 0;
            ctx.beginPath();
            for (const node of visibleNodes) {
                if (!prominent(node) || (node === focus) !== target)
                    continue;
                ctx.moveTo(node.x + node.r, node.y);
                ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
                count++;
            }
            if (count) {
                ctx.globalAlpha = 0.95;
                ctx.strokeStyle = target ? (dark ? '#ffffff' : '#2a2721') : '#38bdf8';
                ctx.lineWidth = 2 / transform.k;
                ctx.stroke();
            }
        }
        // A fixed label budget avoids hundreds of outlined glyphs on every move.
        const labelLimit = width < 600 ? 20 : 48;
        const prioritized = visibleNodes.filter(prominent);
        if (focus)
            prioritized.sort((a, b) => Number(b === focus) - Number(a === focus));
        const labels = [...prioritized, ...visibleNodes.filter(node => !prominent(node))];
        const labelBoxes = [];
        ctx.font = (11 / transform.k) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        for (const node of labels) {
            if (!prominent(node) && transform.k < 0.32)
                continue;
            if (labelBoxes.length >= labelLimit)
                break;
            let x = transform.x + node.x * transform.k + node.r * transform.k + 4;
            const y = transform.y + node.y * transform.k;
            const textWidth = Math.min(node.basename.length, 35) * 6.5;
            if (x + textWidth > width - 4)
                x = transform.x + node.x * transform.k - node.r * transform.k - textWidth - 4;
            x = Math.max(4, x);
            if (labelBoxes.some(box => Math.abs(y - box.y) < 15 && x < box.x + box.width + 5 && x + textWidth + 5 > box.x))
                continue;
            labelBoxes.push({ x, y, width: textWidth });
            ctx.globalAlpha = hasFocus && !prominent(node) ? 0.3 : 1;
            ctx.fillStyle = dark ? '#ece7db' : '#2a2721';
            const label = node.basename.length > 35 ? node.basename.slice(0, 32) + '…' : node.basename;
            ctx.fillText(label, (x - transform.x) / transform.k, node.y);
        }
        ctx.restore();
    }
    function fit() { needsFit = true; fitOnResize = true; sizeCanvas(); fitTransform(); requestPaint(); }
    function reset() { placeNodes(); fit(); }
    function zoom(factor, x = width / 2, y = height / 2) {
        fitOnResize = false;
        const k = Math.max(0.03, Math.min(5, transform.k * factor));
        transform.x = x - (x - transform.x) * k / transform.k;
        transform.y = y - (y - transform.y) * k / transform.k;
        transform.k = k;
        requestPaint();
    }
    function nodeAt(event) {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left - transform.x) / transform.k, y = (event.clientY - rect.top - transform.y) / transform.k;
        const slop = Math.min(14, 5 / transform.k);
        return nodes.find(node => (node.x - x) ** 2 + (node.y - y) ** 2 <= (node.r + slop) ** 2) || null;
    }
    function updateTooltip(node, x = 0, y = 0) {
        const tooltip = document.getElementById('graphTooltip');
        if (!tooltip)
            return;
        if (!node) {
            tooltip.hidden = true;
            tooltipNode = null;
            return;
        }
        if (tooltipNode !== node) {
            tooltipNode = node;
            tooltip.innerHTML = '<strong>' + escapeHtml(node.basename) + '</strong><p>' + escapeHtml(node.path) + '</p><p>' +
                (node.fanIn || 0) + ' dependents · ' + (node.fanOut || 0) + ' imports</p><small>Click to open · Double-click to center · Shift-click to lock thread</small>';
        }
        tooltip.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - 270)) + 'px';
        tooltip.style.top = Math.max(8, Math.min(y + 14, window.innerHeight - 160)) + 'px';
        tooltip.hidden = false;
    }
    listen(canvas, 'pointerdown', (event) => {
        if (!active)
            return;
        clearTimeout(clickTimer);
        canvas.setPointerCapture(event.pointerId);
        dragged = nodeAt(event);
        panning = !dragged;
        downX = event.clientX;
        downY = event.clientY;
        moved = false;
        startX = event.clientX - transform.x;
        startY = event.clientY - transform.y;
    });
    listen(canvas, 'pointermove', (event) => {
        if (!active)
            return;
        if (dragged || panning) {
            moved ||= Math.hypot(event.clientX - downX, event.clientY - downY) > 4;
            if (moved)
                fitOnResize = false;
            if (dragged) {
                const rect = canvas.getBoundingClientRect();
                dragged.x = (event.clientX - rect.left - transform.x) / transform.k;
                dragged.y = (event.clientY - rect.top - transform.y) / transform.k;
            }
            else {
                transform.x = event.clientX - startX;
                transform.y = event.clientY - startY;
            }
            updateTooltip(null);
            requestPaint();
            return;
        }
        const next = nodeAt(event);
        if (next !== hovered) {
            hovered = next;
            if (next)
                candidate = next;
            syncLock();
            canvas.style.cursor = next ? 'pointer' : 'grab';
            requestPaint();
        }
        updateTooltip(next, event.clientX, event.clientY);
    });
    const stopPointer = (event) => {
        dragged = null;
        panning = false;
        if (canvas.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId);
    };
    listen(canvas, 'pointerup', stopPointer);
    listen(canvas, 'pointercancel', stopPointer);
    listen(canvas, 'wheel', (event) => {
        if (!active)
            return;
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    listen(canvas, 'click', (event) => {
        if (!active || moved) {
            moved = false;
            return;
        }
        const node = nodeAt(event);
        clearTimeout(clickTimer);
        if (event.shiftKey && node) {
            candidate = node;
            locked = locked === node ? null : node;
            syncLock();
        }
        else {
            selected = node;
            if (node)
                clickTimer = setTimeout(() => {
                    if (active && !destroyed)
                        canvas.dispatchEvent(new CustomEvent('graph-node-click', { detail: { path: node.path }, bubbles: true }));
                }, 280);
        }
        requestPaint();
    });
    listen(canvas, 'dblclick', (event) => {
        clearTimeout(clickTimer);
        const node = nodeAt(event);
        if (!active || !node)
            return;
        fitOnResize = false;
        transform.k = Math.max(1.2, transform.k);
        transform.x = width / 2 - node.x * transform.k;
        transform.y = height / 2 - node.y * transform.k;
        selected = node;
        requestPaint();
    });
    listen(canvas, 'mouseleave', () => { hovered = null; updateTooltip(null); requestPaint(); });
    if (lockBtn)
        listen(lockBtn, 'click', () => { locked = locked ? null : candidate; hovered = null; syncLock(); requestPaint(); });
    listen(document, 'keydown', (event) => { if (active && event.key === 'Escape' && locked) {
        locked = null;
        hovered = null;
        syncLock();
        requestPaint();
    } });
    for (const [id, action] of [['graphReset', reset], ['graphZoomIn', () => zoom(1.25)], ['graphZoomOut', () => zoom(0.8)]]) {
        const button = document.getElementById(id);
        if (button)
            listen(button, 'click', action);
    }
    function updateActivity() {
        const next = viewActive && !document.hidden && !destroyed;
        if (next === active)
            return;
        active = next;
        if (!active) {
            clearTimeout(clickTimer);
            if (frame !== null)
                cancelAnimationFrame(frame);
            frame = null;
            dragged = null;
            panning = false;
            updateTooltip(null);
        }
        else
            resize();
    }
    const observer = typeof window.ResizeObserver === 'undefined' ? null : new window.ResizeObserver(resize);
    if (canvas.parentElement)
        observer?.observe(canvas.parentElement);
    listen(window, 'resize', resize);
    listen(document, 'visibilitychange', updateActivity);
    resize();
    return {
        update, resize, fit, reset,
        setActive: (value) => { viewActive = value; updateActivity(); },
        search: (query) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { searchQuery = query.trim().toLowerCase(); applyScene(true); }, 100);
        },
        highlight: (path) => { if (highlightPath === path)
            return; highlightPath = path; applyScene(Boolean(path)); },
        // Read-only diagnostic snapshot used by lifecycle/performance checks.
        stats: () => ({ nodes: nodes.length, edges: edges.length, labels: width < 600 ? 20 : 48,
            pixels: canvas.width * canvas.height, paints, pending: frame !== null, positions: nodes.map(n => ({ path: n.path, x: n.x, y: n.y })), viewport: { ...transform } }),
        destroy: () => {
            if (destroyed)
                return;
            destroyed = true;
            active = false;
            interactions.abort();
            observer?.disconnect();
            clearTimeout(searchTimer);
            clearTimeout(clickTimer);
            updateTooltip(null);
            if (frame !== null)
                cancelAnimationFrame(frame);
            frame = null;
            nodes = [];
            edges = [];
            index = new GraphIndex([], []);
            inNeighbors.clear();
            outNeighbors.clear();
        },
    };
}
//# sourceMappingURL=forceGraph.js.map