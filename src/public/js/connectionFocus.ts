// Connections use renderer-independent IDs so a locked thread survives redraws.
export function traceConnections(edges, id, tree = false) {
  const nodes = new Set([id]);
  const activeEdges = new Set<number>();
  if (!tree) {
    edges.forEach((edge, index) => {
      if (edge.from === id || edge.to === id) {
        nodes.add(edge.from); nodes.add(edge.to); activeEdges.add(index);
      }
    });
    return { nodes, edges: activeEdges };
  }
  const walk = (start, upstream) => {
    const seen = new Set([start]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      edges.forEach((edge, index) => {
        if ((upstream ? edge.to : edge.from) !== queue[i]) return;
        const next = upstream ? edge.from : edge.to;
        activeEdges.add(index); nodes.add(next);
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      });
    }
  };
  walk(id, true);
  walk(id, false);
  return { nodes, edges: activeEdges };
}

export function mermaidNodeId(domId) {
  return domId.match(/(?:^|-)flowchart-(.+)-\d+$/)?.[1] || null;
}

export function mermaidEdgeEnds(rawId: string, nodeIds: Iterable<string>) {
  const body = rawId.replace(/^.*?L_/, '').replace(/_\d+$/, '');
  const ids = new Set(nodeIds);
  // IDs may contain underscores, especially in an AI sketch.
  for (const from of [...ids].sort((a, b) => b.length - a.length)) {
    if (!body.startsWith(from + '_')) continue;
    const to = body.slice(from.length + 1);
    if (ids.has(to)) return { from, to };
  }
  return null;
}

export function createConnectionFocus(options) {
  const { host, controls, lockButton, status } = options;
  const contexts = new Map();
  let current = { locked: null, candidate: null };
  let hovered = null;
  let nodeElements = new Map();
  let edges = [];
  let tree = false;
  let bindings = new AbortController();

  const paint = () => {
    const id = current.locked || hovered;
    const visible = id && nodeElements.has(id);
    host.classList.toggle('has-thread-focus', Boolean(visible));
    host.classList.toggle('has-locked-thread', Boolean(current.locked));
    const active = visible ? traceConnections(edges, id, tree) : { nodes: new Set(), edges: new Set() };
    for (const [nodeId, el] of nodeElements) {
      el.classList.toggle('is-thread-node', active.nodes.has(nodeId));
      el.classList.toggle('is-thread-origin', nodeId === id);
      el.classList.toggle('is-thread-locked', nodeId === current.locked);
      const pin = el.querySelector('.thread-pin');
      if (pin) {
        pin.setAttribute('aria-pressed', String(nodeId === current.locked));
        pin.setAttribute('aria-label', (nodeId === current.locked ? 'Unlock' : 'Lock') + ' thread: ' + label(nodeId));
      }
    }
    edges.forEach((edge, index) => {
      edge.el.classList.toggle('is-thread-edge', active.edges.has(index));
      edge.label?.classList.toggle('is-thread-edge', active.edges.has(index));
    });
    lockButton.disabled = !current.locked && !nodeElements.has(current.candidate);
    lockButton.setAttribute('aria-pressed', String(Boolean(current.locked)));
    lockButton.textContent = current.locked ? 'Unlock thread' : 'Lock thread';
    const name = label(current.locked || hovered || current.candidate);
    status.textContent = current.locked
      ? (visible ? 'Locked: ' : 'Locked thread outside this view: ') + name
      : hovered ? 'Tracing: ' + name
      : current.candidate ? 'Lock ' + name + ' to keep its connections visible'
      : 'Hover a node to trace connections · Shift-click to lock';
    status.title = status.textContent;
  };
  const label = (id) => {
    const el = nodeElements.get(id);
    return el?.getAttribute('aria-label') || el?.querySelector('.mm-name')?.textContent || id || '';
  };
  const toggle = (id = current.candidate) => {
    if (current.locked && (!id || id === current.locked)) current.locked = null;
    else if (nodeElements.has(id)) current.locked = id;
    paint();
  };
  lockButton.addEventListener('click', () => {
    if (current.locked) { current.locked = null; hovered = null; paint(); }
    else toggle();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && current.locked && !controls.hidden) {
      current.locked = null; hovered = null; paint();
    }
  });

  return {
    reset() { contexts.clear(); current = { locked: null, candidate: null }; hovered = null; },
    setContext(key, visible) {
      if (!contexts.has(key)) contexts.set(key, { locked: null, candidate: null });
      current = contexts.get(key);
      hovered = null;
      controls.hidden = !visible;
    },
    bind(payloads = {}) {
      bindings.abort(); bindings = new AbortController();
      const signal = bindings.signal;
      nodeElements = new Map(); edges = []; hovered = null;
      tree = Boolean(host.querySelector('.mm'));
      const stableIds = new Map();
      const elements = host.querySelectorAll(tree ? '.mm-cell' : 'g.node');
      for (const el of elements) {
        const rawId = tree ? el.dataset.cellId : mermaidNodeId(el.id);
        if (!rawId) continue;
        const subject = payloads[rawId];
        const id = tree ? rawId : subject ? subject.kind + ':' + subject.path : rawId + ':' + el.textContent.trim();
        stableIds.set(rawId, id);
        el.dataset.threadId = id;
        nodeElements.set(id, el);
        if (!tree) {
          el.setAttribute('tabindex', '0');
          el.setAttribute('aria-label', subject?.path || el.textContent.trim());
        }
      }
      if (tree) {
        edges = [...host.querySelectorAll('.mm-edge')].map(el => ({ from: el.dataset.from, to: el.dataset.to, el }));
      } else {
        const labels = new Map();
        for (const el of host.querySelectorAll('.edgeLabel')) {
          labels.set(el.querySelector('[data-id]')?.getAttribute('data-id'), el);
        }
        for (const el of host.querySelectorAll('path.flowchart-link')) {
          const raw = el.getAttribute('data-id') || el.id;
          const ends = mermaidEdgeEnds(raw, stableIds.keys());
          if (ends) edges.push({ from: stableIds.get(ends.from), to: stableIds.get(ends.to), el, label: labels.get(raw) });
        }
      }
      for (const [id, el] of nodeElements) {
        const preview = () => { hovered = id; current.candidate = id; paint(); };
        const leave = () => { if (hovered === id) { hovered = null; paint(); } };
        el.addEventListener('mouseenter', preview, { signal });
        el.addEventListener('mouseleave', leave, { signal });
        el.addEventListener('focusin', preview, { signal });
        el.addEventListener('focusout', event => { if (!el.contains(event.relatedTarget)) leave(); }, { signal });
        el.addEventListener('click', event => {
          current.candidate = id;
          if (event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); toggle(id); }
        }, { capture: true, signal });
        el.addEventListener('keydown', event => {
          if (event.key.toLowerCase() === 'l') { event.preventDefault(); event.stopPropagation(); toggle(id); }
          else if (!tree && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: event.shiftKey }));
          }
        }, { signal });
        if (tree) {
          let pin = el.querySelector('.thread-pin');
          if (!pin) {
            pin = document.createElement('button');
            pin.type = 'button'; pin.className = 'thread-pin';
            pin.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>';
            pin.title = 'Lock this thread (L)';
            el.appendChild(pin);
          }
          pin.addEventListener('click', event => { event.stopPropagation(); toggle(id); }, { signal });
          pin.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
          }, { signal });
        }
      }
      paint();
    },
  };
}
