// The Map view: the repo as an expanding tree map rather than a flowchart.
//
// This is the landing view after a scan, and the only one that is not Mermaid.
// Cells are laid out by mindmap.js from a spec built here — the spec is where the
// graph's numbers become the one-line summaries under each name, which is the
// whole value of the view and the reason this glue is worth its own module.
//
// Folder clicks expand in place. File clicks offer a destination; the small
// file caret still expands connections. Layout changes preserve a visible cell.

import { roleOf, factIndex } from '/shared/analyzer/graph.js';
import { pathFilter } from '/shared/analyzer/pathUtil.js';
import { buildSpecs, layoutMindMap, renderMindMap } from './mindmap.js';
import { pruneTree } from './tree.js';
import { state, focusFile, focusFolder } from './state.js';

// Opening every folder at once on a big repo lays out thousands of cells in one
// frame. Past this many files the button refuses and says why.
const OPEN_ALL_LIMIT = 700;

let host = null;      // #canvasContent
let toggleBtn = null; // #mmToggleBtn — opens every folder
let collapseBtn = null;
let lastLayout = null;
let lastTree = null;
let hooks = {
  onSyncInspector: (..._args: unknown[]) => {},
  onRenderSidebar: (..._args: unknown[]) => {},
  onOpenFile: (..._args: unknown[]) => {},
  onOpenFolder: (..._args: unknown[]) => {},
  onToast: (..._args: unknown[]) => {},
  onFit: (..._args: unknown[]) => {},
  onReanchor: (..._args: unknown[]) => {},
  onGetAnchor: (): string | null => null,
  onFocusCell: (..._args: unknown[]) => {},
  onRendered: (..._args: unknown[]) => {},
};

export function initMap(options) {
  host = options.host;
  toggleBtn = options.toggleBtn;
  collapseBtn = options.collapseBtn;
  hooks = { ...hooks, ...options };

  toggleBtn.addEventListener('click', () => {
    if (state.scan.allFiles.length > OPEN_ALL_LIMIT) {
      return hooks.onToast('Too many files to open at once — open folders as you go.');
    }
    const open = (node) => {
      state.mm.expanded.add('dir:' + node.path);
      for (const d of node.dirs.values()) open(d);
    };
    open(state.treeData);
    renderMap(false);
    hooks.onRenderSidebar();
    hooks.onToast('All folders are open. Drag the canvas to explore, or pick a folder in the sidebar.');
  });
  collapseBtn.addEventListener('click', () => {
    state.mm.expanded = new Set(['dir:']);
    renderMap(false, 'dir:');
    const root = lastLayout.cells.find((cell) => cell.id === 'dir:');
    if (root) hooks.onFocusCell(root);
    hooks.onRenderSidebar();
  });
}

// The filter as the map needs it: a folder whose own name matches keeps its whole
// branch, so searching for a folder shows you what is in it.
function visibleTree() {
  const include = pathFilter(state.filters);
  const needle = state.filters.text.trim().toLowerCase();
  const matchesFolder = needle ? (p) => p.toLowerCase().includes(needle) : null;
  return pruneTree(state.treeData, include, matchesFolder);
}

export function renderMap(fit, anchorId = null) {
  const { scan, facts } = state;
  if (lastTree !== state.treeData) { lastLayout = null; lastTree = state.treeData; }
  const anchor = anchorId || hooks.onGetAnchor() || 'dir:';
  const before = lastLayout?.cells.find((cell) => cell.id === anchor);
  const fileByPath = new Map(scan.files.map((f) => [f.path, f]));

  const rootSpec = buildSpecs({
    root: visibleTree(),
    expanded: state.mm.expanded,
    rootSummary: {
      name: scan.name,
      summary: `${scan.stats.filesParsed} code files · ${scan.stats.edgeCount} connections`,
    },
    folderInfo: (node) => {
      let summary = `${node.files.length} ${node.files.length === 1 ? 'file' : 'files'}`;
      if (node.dirs.size) summary += ` · ${node.dirs.size} ${node.dirs.size === 1 ? 'folder' : 'folders'}`;
      return { summary, cls: '' };
    },
    fileInfo: (path) => {
      const f = fileByPath.get(path);
      // A path with no scan entry was walked but never parsed — listed, greyed,
      // and given no neighbours rather than left out of the map entirely.
      if (!f) return { parsed: false, summary: 'not parsed', neighbors: [] };
      const fin = facts.fanIn[path] || 0;
      const fout = facts.fanOut[path] || 0;
      const role = roleOf(path, facts);
      const cls = [
        role === 'entry' ? 'is-entry' : '',
        role === 'hub' ? 'is-hub' : '',
        factIndex(facts).inCycle.has(path) ? 'is-cycle' : '',
      ].filter(Boolean).join(' ');
      return {
        parsed: true,
        summary: fileSummary(role, fin, fout, f),
        cls,
        neighbors: [
          ...(facts.importsOf[path] || []).map((p) => ({ path: p, relation: 'pulled in' })),
          ...(facts.importers[path] || []).map((p) => ({ path: p, relation: 'leans on it' })),
        ],
      };
    },
  });

  const layout = layoutMindMap(rootSpec, state.mm.expanded);
  renderMindMap(host, layout, state.mm.expanded, {
    onToggle: (cell) => {
      if (state.mm.expanded.has(cell.id)) state.mm.expanded.delete(cell.id);
      else state.mm.expanded.add(cell.id);
      renderMap(false, cell.id);
      peek(cell);
      hooks.onRenderSidebar();
      host.querySelectorAll('[data-cell-id]').forEach((el) => {
        if (el.dataset.cellId === cell.id) el.focus({ preventScroll: true });
      });
    },
    onNavigate: (cell, el) => {
      if (cell.navFolder !== null) hooks.onOpenFolder(cell.navFolder);
      else if (cell.nav) hooks.onOpenFile(cell.nav, el);
    },
  });

  lastLayout = layout;
  hooks.onRendered();
  const after = layout.cells.find((cell) => cell.id === anchor);
  if (!fit && before && after) hooks.onReanchor(before, after);
  toggleBtn.textContent = 'Open all folders';
  collapseBtn.disabled = state.mm.expanded.size <= 1;
  if (fit) hooks.onFit();
}

// Sidebar folder selection reveals its ancestors and brings that branch into view.
export function toggleMapFolder(path, open) {
  const parts = path.split('/');
  state.mm.expanded.add('dir:');
  for (let i = 1; i < parts.length; i++) state.mm.expanded.add('dir:' + parts.slice(0, i).join('/'));
  if (open) state.mm.expanded.add('dir:' + path);
  else state.mm.expanded.delete('dir:' + path);
  renderMap(false, 'dir:' + path);
  const cell = lastLayout.cells.find((cell) => cell.id === 'dir:' + path);
  if (cell) hooks.onFocusCell(cell);
}

// Fills the inspector for a cell without leaving the map.
function peek(cell) {
  if (cell.kind === 'folder' || cell.kind === 'root') {
    focusFolder(cell.id.slice(4)); // strip the `dir:` prefix
    hooks.onSyncInspector();
  } else if (cell.nav) {
    focusFile(cell.nav);
    hooks.onSyncInspector();
    hooks.onRenderSidebar();
  }
}

// The line under a file's name. Each role gets the number that matters for it:
// an entry point is interesting for what it pulls in, a hub for what leans on it.
export function fileSummary(role, fanIn, fanOut, file) {
  switch (role) {
    case 'entry': return `entry point · pulls in ${fanOut}`;
    case 'hub': return `hub · ${fanIn} dependents`;
    case 'leaf': return `leaf · ${fanIn} dependent${fanIn === 1 ? '' : 's'}`;
    case 'test': return 'test file';
    case 'config': return 'configuration';
    default: {
      let s = `${fanOut} out · ${fanIn} in`;
      if (file.functions.length) s += ` · ${file.functions.length} fn`;
      return s;
    }
  }
}
