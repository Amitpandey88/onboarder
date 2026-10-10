import type { ScanProgress } from '../shared/contracts.js';
import { abortable, throwIfAborted } from '/shared/analyzer/scanControl.js';
import { eventElement } from '/js/dom.js';
import type { AppElements } from '/js/dom.js';
// Onboarder — bootstrap, routing, and wiring.
//
// Two ways a repo arrives here:
//   1. The server scans it (local path, git URL, or this app's own source)
//      and hands back { scan, facts, manifest } as JSON.
//   2. The user picks a folder and the exact same analyzer runs in this tab.
// After that everything is one code path over plain data.
//
// What is left in this file is the part that has to know about everything else:
// the landing page, `setView`/`renderCanvas` deciding what the stage shows, and
// `syncInspector` keeping the side panel agreeing with it. Each view that is more
// than a diagram call lives in its own module under js/ — mapView, atlas, docsView,
// codeTab, about, aiDraft — and is handed its host element and a set of callbacks
// here. The callbacks are the reason the module graph stays acyclic: a feature
// module never imports back into app.js.

import { scanRepo } from '/shared/analyzer/scan.js';
import { computeFacts, scanIndex } from '/shared/analyzer/graph.js';
import { analyzeStack } from '/shared/analyzer/stack.js';
import { detectManifest } from '/shared/analyzer/services.js';
import { computeLayers, detectPatterns, couplingMatrix } from '/shared/analyzer/patterns.js';
import { explainOverview } from '/shared/analyzer/explainLocal.js';
import { dirOf, pathFilter } from '/shared/analyzer/pathUtil.js';
import {
  overviewDiagram, folderDiagram, fileDetailDiagram, servicesDiagram, emptyDiagram,
  layersDiagram, healthDiagram, securityDiagram, historyDiagram, setDiagramTheme, diagramThemeBlock,
} from '/shared/diagram/mermaid.js';
import { analyzeHealth } from '/shared/analyzer/health.js';
import { summarizeSecurity } from '/shared/analyzer/security.js';
import { escapeHtml } from '/js/html.js';
import {
  scanOnServer, cleanupClone, streamExplain,
  fetchMcpStatus, startMcpServer, stopMcpServer, fetchMcpCommand, fetchHermesStatus,
} from '/js/api.js';
import { canPickFolder, pickDirectory, browserFileSource } from '/js/fileSourceBrowser.js';
import { renderInto, validateDiagram, wireNodeClicks, makePanzoom, downloadSvg } from '/js/diagramPane.js';
import { setViewerTheme } from '/js/codeViewer.js';
import * as llm from '/js/llm.js';
import { buildTree, renderTree, resetOpenState, expandedToDepth } from '/js/tree.js';
import { initMap, renderMap, toggleMapFolder } from '/js/mapView.js';
import { createFileNavigation } from '/js/fileNavigation.js';
import { createConnectionFocus } from '/js/connectionFocus.js';
import { gatherFileContext } from '/js/repoFiles.js';
import * as inspector from '/js/inspector.js';
import { buildTourStops, describeStop } from '/js/tour.js';
import { initAbout, renderAbout } from '/js/about.js';
import { initDocs, renderDocs, openDocTab } from '/js/docsView.js';
import { initCodeTab, renderCode, revealLineInCode } from '/js/codeTab.js';
import { initAnalysisPanel, renderAnalysisPanel, subscribeAnalysis } from '/js/analysisPanel.js';
import { initDeepAnalysis, renderDeepAnalysis } from '/js/deepAnalysisView.js';
import { initAiDraft, updateAiBtn, wireAIClicks, stopAiDraft } from '/js/aiDraft.js';
import { initAtlas, renderAtlasList, openCardDiagram } from '/js/atlas.js';
import { initForceGraph } from '/js/forceGraph.js';
import { initHeatmap } from '/js/heatmap.js';
import { initSearch } from '/js/search.js';
import { withTransition } from '/js/transitions.js';
import { renderInsights } from '/js/insightsView.js';
import { createServerDrawer } from '/js/serverSettings.js';
import { renderDiffView, stopDiff } from '/js/diffView.js';
import { renderReviewView, stopReview } from '/js/reviewView.js';
import { renderWorkflows } from '/js/workflowsView.js';
import { renderSbom } from '/js/sbomView.js';
import { initMobilePanels } from '/js/mobilePanels.js';
import {
  state as appState, isExplorerView, loadRepo, unloadRepo,
  focusFile, focusFolder, clearFocus as clearFocusState, inspectorSubject, aiViewKey,
} from '/js/state.js';

const $ = (id) => document.getElementById(id);

const dom: Partial<AppElements> = {};
[
  'landing', 'landingError', 'landingStatus', 'cancelScanBtn', 'scanProgress', 'pathForm', 'pathInput', 'gitForm', 'gitInput',
  'pickBtn', 'demoBtn', 'explorer', 'viewTabs', 'repoChip', 'newRepoBtn', 'settingsBtn',
  'treeFilter', 'fileTree', 'crumbs', 'copyMermaidBtn', 'svgBtn', 'fitBtn',
  'canvas', 'canvasContent', 'canvasEmpty', 'stageFoot', 'themeBtn', 'aiDrawBtn', 'docView', 'aboutView', 'codeView',
  'mmToggleBtn', 'mmCollapseBtn', 'threadControls', 'threadLockBtn', 'threadStatus', 'stageFilters', 'modeSwitch', 'nodeFilter', 'testsToggle', 'depthSelect',
  'tourbar', 'tourTitle', 'tourCount', 'tourPrev', 'tourNext', 'tourExit',
  'drawerScrim', 'settingsDrawer', 'drawerClose', 'setBaseUrl', 'setApiKey', 'setModel',
  'saveSettings', 'testSettings', 'settingsStatus', 'toast', 'brandNote', 'askBtn', 'askInput',
  'setConnection', 'apiConnection', 'hermesConnection', 'hermesConnectionStatus', 'hermesModel', 'hermesProvider', 'refreshHermes', 'aiConnectionNote',
  'graphView', 'graphCanvas', 'graphControls', 'graphReset', 'graphZoomIn', 'graphZoomOut', 'graphFit', 'graphSearchInput', 'graphTooltip',
  'heatmapView', 'heatmapCanvas', 'heatmapTooltip', 'blameGutter', 'codeTabContainer',
  'insightsView', 'diffView', 'reviewView', 'workflowsView', 'sbomView', 'searchTriggerBtn', 'inspSecurityTools', 'analysisView',
  'mcpBtn', 'mcpBtnLabel', 'mcpDot', 'mcpDrawer', 'mcpScrim', 'mcpClose', 'mcpPanelDot', 'mcpPanelState',
  'mcpStart', 'mcpStop', 'mcpStatus', 'mcpConfig', 'mcpCommandInput', 'mcpCopy', 'mcpTabJson', 'mcpTabToml',
  'mcpConfigBlock', 'mcpToolsHint', 'serverBtn',
].forEach((id) => (dom[id] = $(id)));

let forceGraphCtl = null;
let graphScan = null;
let graphHealth = null;
let heatmapCtl = null;
let searchCtl = null;

const state = appState;

const panzoom = makePanzoom(dom.canvas, dom.canvasContent);
const connectionFocus = createConnectionFocus({ host: dom.canvasContent, controls: dom.threadControls, lockButton: dom.threadLockBtn, status: dom.threadStatus });
const mobilePanels = initMobilePanels();

// ---------------------------------------------------------------- landing --

let activeScan: AbortController | null = null;

function landingBusy(message) {
  dom.landingError.hidden = true;
  dom.landing.setAttribute('aria-busy', 'true');
  dom.landingStatus.textContent = message;
  dom.landingStatus.hidden = false;
  for (const btn of dom.landing.querySelectorAll('button')) btn.disabled = true;
  dom.cancelScanBtn.hidden = false;
  dom.cancelScanBtn.disabled = false;
  dom.scanProgress.hidden = false;
  dom.scanProgress.removeAttribute('value');
}

function landingIdle(error?: any) {
  dom.landingStatus.hidden = true;
  dom.cancelScanBtn.hidden = true;
  dom.scanProgress.hidden = true;
  dom.landing.removeAttribute('aria-busy');
  for (const btn of dom.landing.querySelectorAll('button')) btn.disabled = false;
  dom.pickBtn.disabled = !canPickFolder();
  if (error) {
    dom.landingError.textContent = error;
    dom.landingError.hidden = false;
  }
}

function beginScan(message: string): AbortController {
  activeScan?.abort();
  const controller = new AbortController();
  activeScan = controller;
  landingBusy(message);
  return controller;
}

function updateScanProgress(progress: ScanProgress): void {
  if (progress.phase === 'walk') dom.landingStatus.textContent = `Walking the file tree… ${progress.found} files`;
  if (progress.phase === 'parse' || progress.phase === 'resolve') {
    dom.landingStatus.textContent = `${progress.phase === 'parse' ? 'Reading code' : 'Tracing imports'}… ${progress.done} / ${progress.total} files`;
    dom.scanProgress.max = Math.max(1, progress.total);
    dom.scanProgress.value = progress.done;
  }
}

dom.cancelScanBtn.addEventListener('click', () => {
  activeScan?.abort();
  activeScan = null;
  landingIdle();
  dom.landingStatus.hidden = false;
  dom.landingStatus.textContent = 'Scan cancelled. Choose a repository when you’re ready.';
});

async function loadFromServer(payload, busyText) {
  const controller = beginScan(busyText);
  try {
    const result = await scanOnServer(payload, { signal: controller.signal });
    if (activeScan !== controller) return;
    enterExplorer(result, {});
  } catch (err) {
    if (activeScan === controller) landingIdle(err.message);
  } finally {
    if (activeScan === controller) activeScan = null;
  }
}

dom.pathForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const path = dom.pathInput.value.trim();
  if (!path) return landingIdle('Give me a path first — something like ~/work/that-repo.');
  loadFromServer({ path }, 'Walking the file tree…');
});

dom.gitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const gitUrl = dom.gitInput.value.trim();
  if (!gitUrl) return landingIdle('Paste a git URL first.');
  loadFromServer({ gitUrl }, 'Cloning, then scanning. Big repos take a minute…');
});

dom.demoBtn.addEventListener('click', () => {
  loadFromServer({ demo: true }, 'Reading our own source…');
});

dom.pickBtn.addEventListener('click', async () => {
  if (!canPickFolder()) {
    return landingIdle('This browser can’t pick folders. Chrome or Edge can; the other two options work anywhere.');
  }
  let handle;
  try {
    handle = await pickDirectory();
  } catch {
    return; // the picker was dismissed — no news is good news
  }
  const controller = beginScan('Walking the file tree…');
  try {
    const source = browserFileSource(handle);
    const scan = await scanRepo(source, {
      signal: controller.signal,
      onProgress: updateScanProgress,
    });
    dom.landingStatus.textContent = 'Counting connections…';
    const manifest = await abortable(detectManifest(source), controller.signal);
    throwIfAborted(controller.signal);
    if (activeScan !== controller) return;
    const facts = computeFacts(scan, manifest);
    enterExplorer({ scan, facts, manifest }, { browserSource: source });
  } catch (err) {
    if (activeScan === controller) landingIdle(err.message);
  } finally {
    if (activeScan === controller) activeScan = null;
  }
});

if (!canPickFolder()) {
  dom.pickBtn.disabled = true;
  dom.pickBtn.title = 'Folder picking needs Chrome or Edge.';
}

// -------------------------------------------------------------- explorer --

function enterExplorer(payload, opts) {
  stopAiDraft();
  loadRepo(payload, {
    browserSource: opts.browserSource || null,
    history: payload.history || null, // computed server-side; null for browser picks
  });
  state.stack = analyzeStack(state.manifest, state.scan.stats.languages);

  resetOpenState();
  connectionFocus.reset();
  state.treeData = buildTree(state.scan.allFiles);
  state.patterns = buildPatterns(state.scan, state.facts, state.manifest);
  state.health = analyzeHealth(state.scan, state.facts);
  state.security = summarizeSecurity(state.scan);
  dom.nodeFilter.value = '';
  dom.testsToggle.classList.add('is-on');
  dom.depthSelect.value = '0';

  if (searchCtl) {
    searchCtl.updateFiles(state.scan.files, state.scanId);
    searchCtl.hide();
  } else {
    searchCtl = initSearch(state.scan.files, { getScanId: () => state.scanId });
  }

  // Compute everything first, then flip the UI over — a failure here should
  // land on the landing page with the error visible, not a half-dead explorer.
  landingIdle();
  dom.landing.hidden = true;
  dom.explorer.hidden = false;
  dom.viewTabs.hidden = false;
  dom.repoChip.hidden = false;
  dom.newRepoBtn.hidden = false;
  dom.searchTriggerBtn.hidden = false;
  dom.repoChip.innerHTML =
    `<span class="repo-name">${escapeHtml(state.scan.name)}</span>` +
    `<span class="repo-sub">${escapeHtml(repoSubLabel())}</span>`;
  dom.repoChip.title = state.scan.root;
  dom.brandNote.textContent = state.scan.stats.filesParsed + ' files · ' + state.scan.stats.edgeCount + ' connections';

  renderSidebar();
  setView('map');
}

// The big name is the repo's own; the small line says where it actually lives.
function repoSubLabel() {
  if (state.scan.tempId) return state.scan.tempId + ' · temp clone';
  if (state.browserSource) return 'picked in the browser';
  return state.scan.root;
}

function buildPatterns(scan, facts, manifest) {
  const layersInfo = computeLayers(scan, facts);
  return {
    layersInfo,
    findings: detectPatterns(scan, facts, manifest, layersInfo),
    coupling: couplingMatrix(scan, facts),
  };
}

dom.newRepoBtn.addEventListener('click', () => {
  fileNavigation.close();
  stopAiDraft();
  stopReview();
  stopDiff();
  mobilePanels.close();
  if (state.cloneId) cleanupClone(state.cloneId);
  // The graph and heatmap views attach `window` resize listeners when
  // they initialize. The view tab is unmounted by hiding the container,
  // not by removing the listener, so without this call every new repo
  // would attach another listener to the same global and the page would
  // fan out work on every resize. Destroy tears them down before the
  // next `init*` rebuilds them for a new repo.
  if (forceGraphCtl) { forceGraphCtl.destroy(); forceGraphCtl = null; }
  if (heatmapCtl) { heatmapCtl.destroy(); heatmapCtl = null; }
  graphScan = null; graphHealth = null;
  unloadRepo();
  connectionFocus.reset();
  dom.explorer.hidden = true;
  dom.tourbar.hidden = true;
  dom.viewTabs.hidden = true;
  dom.repoChip.hidden = true;
  dom.newRepoBtn.hidden = true;
  dom.brandNote.textContent = 'a map for any codebase';
  dom.landing.hidden = false;
  landingIdle();
});

function renderSidebar() {
  renderTree(dom.fileTree, state.treeData, {
    facts: state.facts,
    filter: dom.treeFilter.value,
    selected: state.selected,
    parsedPaths: state.scan.files.map((f) => f.path),
    expanded: state.view === 'map' ? state.mm.expanded : null,
    onFile: openFile,
    onFolder: (folder, open) => {
      focusFolder(folder);
      state.folder = folder;
      state.detail = null;
      if (state.view === 'map') {
        toggleMapFolder(folder, open);
        renderSidebar();
        for (const head of dom.fileTree.querySelectorAll<HTMLElement>('.tree-dir-head')) {
          if (head.dataset.path === folder) head.focus({ preventScroll: true });
        }
      }
      if (state.view === 'files') renderCanvas();
      syncInspector();
    },
  });
}

let sidebarFrame: number | null = null;
dom.treeFilter.addEventListener('input', () => {
  if (sidebarFrame !== null) cancelAnimationFrame(sidebarFrame);
  sidebarFrame = requestAnimationFrame(() => { sidebarFrame = null; if (state.scan) renderSidebar(); });
});

// ------------------------------------------------------------------ views --

dom.viewTabs.addEventListener('click', (event) => {
  const tab = eventElement(event)?.closest<HTMLElement>('.view-tab');
  if (!tab) return;
  const view = tab.dataset.view === 'explorer' ? state.lastExplorer || 'map' : tab.dataset.view;
  if (state.view === view) return;
  withTransition(() => setView(view));
});

// The inspector's single source of truth. Whatever is focused — a file, a
// folder — is shown in every tab; with nothing focused, each view shows its
// own default panel. Every selection path funnels here, so the panel is
// always in step with the canvas, tree, code and docs. Which subject that is
// comes from `inspectorSubject` in state.js, which is pure and tested; this
// function only does the showing.
function syncInspector() {
  const subject = inspectorSubject(state);
  const opts = { ...state, backLabel: subject.backLabel };
  switch (subject.kind) {
    case 'file': return inspector.showFile(subject.path, opts);
    case 'folder': return inspector.showFolder(subject.path, opts);
    case 'patterns': return inspector.showPatterns(state);
    case 'health': return inspector.showHealth(state);
    case 'security': return inspector.showSecurity(state);
    case 'history': return inspector.showHistory(state);
    default: return inspector.showOverview(state);
  }
}

function clearFocus() {
  clearFocusState();
  syncInspector();
}

function setView(view) {
  fileNavigation.close();
  if (view !== 'review') stopReview();
  if (view !== 'diff') stopDiff();
  dom.explorer.classList.toggle('review-workspace', view === 'review');
  state.view = view;
  if (isExplorerView(view)) state.lastExplorer = view;
  for (const tab of dom.viewTabs.querySelectorAll<HTMLElement>('.view-tab')) {
    tab.classList.toggle(
      'is-active',
      tab.dataset.view === view || (tab.dataset.view === 'explorer' && isExplorerView(view))
    );
  }
  for (const chip of dom.modeSwitch.querySelectorAll<HTMLElement>('.mode-chip')) {
    chip.classList.toggle('is-active', chip.dataset.mode === view);
  }
  dom.tourbar.hidden = view !== 'tour';

  if (view === 'tour') {
    state.tour.stops = buildTourStops(state.scan, state.facts);
    state.tour.idx = 0;
    state.selected = null; // the tour drives its own focus
  }

  for (const tab of dom.viewTabs.querySelectorAll<HTMLElement>('.view-tab')) tab.setAttribute('aria-current', tab.classList.contains('is-active') ? 'page' : 'false');
  renderCanvas();

  if (view === 'tour') showTourStop();
  else syncInspector();
  renderSidebar();
}

function openFile(path) {
  focusFile(path);
  state.code.path = path; // the Code tab follows the current file
  if (state.view !== 'files' && state.view !== 'tour' && state.view !== 'code') {
    state.folder = dirOf(path);
    setView('files');
    return;
  }
  if (state.view === 'files') {
    state.folder = dirOf(path);
    state.detail = path;
    renderCanvas();
  }
  if (state.view === 'code') renderCode();
  syncInspector();
  renderSidebar();
}

// The Code tab, optionally at a line. Search results for symbols and content
// hits come through here: the scan already knows where a symbol was declared and
// where a phrase matched, so opening the file at line 1 would throw away the
// only part of the answer the person did not already know.
function openFileInCode(path, line) {
  focusFile(path);
  state.code.path = path;
  if (line) revealLineInCode(line);
  setView('code');
}

function openDeepDive(path) {
  focusFile(path);
  state.folder = dirOf(path);
  state.detail = path;
  setView('files');
  renderSidebar();
}

const fileNavigation = createFileNavigation((path, target) => {
  if (target === 'code') openFileInCode(path, undefined);
  else if (target === 'docs') {
    focusFile(path);
    state.code.path = path;
    setView('docs');
    openDocTab('file', path);
  } else openDeepDive(path);
  renderSidebar();
});

function chooseFileDestination(path, anchor) {
  focusFile(path);
  state.code.path = path;
  syncInspector();
  fileNavigation.show(path, anchor);
  // Keep the source element alive so Escape can return keyboard focus to it.
  for (const row of dom.fileTree.querySelectorAll<HTMLElement>('.tree-file')) {
    row.classList.toggle('is-selected', row.dataset.path === path);
  }
}

function onNodeClick(payload) {
  if (payload.kind === 'folder') {
    state.folder = payload.path;
    state.detail = null;
    focusFolder(payload.path);
    setView('files');
  } else if (payload.kind === 'file') {
    openFile(payload.path);
  }
}

inspector.onInspectorNavigate(openFile);

document.addEventListener('search-select', (event) => {
  const detail = (event as CustomEvent<{ path?: string; target?: string; line?: number }>).detail || {};
  if (!detail.path) return;
  // The palette says where a result belongs. A file's home is the graph; a
  // symbol or a content hit belongs in the Code tab, at its line.
  if (detail.target === 'code') return openFileInCode(detail.path, detail.line);
  return openFile(detail.path);
});

document.addEventListener('file-select', (event) => {
  if ((event as CustomEvent<{ path?: string; target?: string; line?: number }>).detail?.path) openFile((event as CustomEvent<{ path?: string; target?: string; line?: number }>).detail.path);
});

document.addEventListener('graph-node-click', (event) => {
  if ((event as CustomEvent<{ path?: string; target?: string; line?: number }>).detail?.path) openFile((event as CustomEvent<{ path?: string; target?: string; line?: number }>).detail.path);
});

document.addEventListener('heatmap-node-click', (event) => {
  if ((event as CustomEvent<{ path?: string; target?: string; line?: number }>).detail?.path) openFile((event as CustomEvent<{ path?: string; target?: string; line?: number }>).detail.path);
});

async function renderCanvas() {
  updateAiBtn();
  const isDocs = state.view === 'docs';
  const isAbout = state.view === 'about';
  const isCode = state.view === 'code';
  const isGraph = state.view === 'graph';
  const isHeatmap = state.view === 'heatmap';
  const isInsights = state.view === 'insights';
  const isDiff = state.view === 'diff';
  const isReview = state.view === 'review';
  const isWorkflows = state.view === 'workflows';
  const isSbom = state.view === 'sbom';
  const isAnalysis = state.view === 'analysis';
  const isPage = isDocs || isAbout || isCode || isGraph || isHeatmap || isInsights || isDiff || isReview || isWorkflows || isSbom || isAnalysis;
  forceGraphCtl?.setActive(isGraph && !searchCtl?.isShowing());
  const isAtlasList = state.view === 'atlas' && !state.atlasOpen;
  const focusSubject = state.view === 'files' ? state.detail ? 'file:' + state.detail : 'folder:' + state.folder
    : state.view === 'tour' ? state.tour.idx
    : state.view === 'atlas' ? state.atlasOpen?.path || state.atlasOpen?.title || '' : '';
  const focusKey = [state.view, focusSubject, state.aiActiveKey === aiViewKey() ? state.aiActiveKey : ''].join('|');
  connectionFocus.setContext(focusKey, !isPage && !isAtlasList);
  
  dom.canvas.hidden = isPage;
  dom.docView.hidden = !isDocs;
  dom.aboutView.hidden = !isAbout;
  dom.codeView.hidden = !isCode;
  if (dom.codeTabContainer) dom.codeTabContainer.hidden = !isCode;
  if (dom.graphView) dom.graphView.hidden = !isGraph;
  if (dom.heatmapView) dom.heatmapView.hidden = !isHeatmap;
  if (dom.insightsView) dom.insightsView.hidden = !isInsights;
  if (dom.diffView) dom.diffView.hidden = !isDiff;
  if (dom.reviewView) dom.reviewView.hidden = !isReview;
  if (dom.workflowsView) dom.workflowsView.hidden = !isWorkflows;
  if (dom.sbomView) dom.sbomView.hidden = !isSbom;
  if (dom.analysisView) dom.analysisView.hidden = !isAnalysis;
  
  dom.copyMermaidBtn.hidden = isPage || isAtlasList;
  dom.svgBtn.hidden = isPage;
  dom.fitBtn.hidden = isPage || isAtlasList;
  dom.stageFilters.hidden = isPage;
  dom.mmToggleBtn.hidden = isPage || state.view !== 'map';
  dom.mmCollapseBtn.hidden = dom.mmToggleBtn.hidden;
  if (!isAtlasList) dom.canvasContent.classList.remove('atlas-mode');

  if (isPage) {
    dom.aiDrawBtn.hidden = true;
    if (isDocs) renderDocs();
    else if (isCode) renderCode();
    else if (isAbout) renderAbout();
    else if (isInsights) renderInsights(dom.insightsView, state);
    else if (isDiff) renderDiffView(dom.diffView, state);
    else if (isReview) renderReviewView(dom.reviewView, state);
    else if (isWorkflows) renderWorkflows(dom.workflowsView, state);
    else if (isSbom) renderSbom(dom.sbomView, state);
    else if (isAnalysis) renderDeepAnalysis(dom.analysisView, state);
    
    if (isGraph) {
      if (!forceGraphCtl) forceGraphCtl = initForceGraph(dom.graphCanvas);
      forceGraphCtl.setActive(!searchCtl?.isShowing());
      if (graphScan !== state.scan || graphHealth !== state.health) {
      const edges = state.scan.edges || [];
      const facts = state.facts || {};
      const healthMap = new Map<string, { risk: number; complexity?: number }>((state.health?.perFile || []).map(h => [h.path, h]));
      const nodes = state.scan.files.map(f => {
        const h = healthMap.get(f.path);
        return {
          path: f.path,
          fanIn: facts.fanIn?.[f.path] || 0,
          fanOut: facts.fanOut?.[f.path] || 0,
          community: facts.communities?.[f.path] || 0,
          risk: h?.risk || 0,
          complexity: h?.complexity || f.cognitive || 0,
          lang: f.lang || 'unknown',
        };
      });
      forceGraphCtl.update(nodes, edges, facts.communities || {});
      graphScan = state.scan; graphHealth = state.health;
      }
      forceGraphCtl.resize();
    }
    
    if (isHeatmap) {
      const healthByPath = new Map<string, { risk: number }>((state.health?.perFile || []).map(f => [f.path, f]));
      const heatFiles = state.scan.files.map(f => ({
        path: f.path,
        risk: healthByPath.get(f.path)?.risk || 0,
        loc: f.size
      }));
      if (!heatmapCtl) heatmapCtl = initHeatmap(dom.heatmapCanvas, heatFiles);
      else heatmapCtl.update(heatFiles);
    }

    renderCrumbs();
    renderFoot();
    return;
  }

  const { scan, facts, manifest } = state;
  const key = aiViewKey();
  updateAiBtn(key);

  // Tree-map furniture only belongs to the Map; SVG export can't take cells.
  const showingSketch = state.aiActiveKey === key && Boolean(state.aiDiagrams[key]);
  dom.svgBtn.hidden = isPage || isAtlasList || (state.view === 'map' && !showingSketch);
  dom.mmToggleBtn.hidden = state.view !== 'map' || showingSketch;
  dom.mmCollapseBtn.hidden = dom.mmToggleBtn.hidden;
  const filterable = ['map', 'files', 'patterns'].includes(state.view);
  dom.nodeFilter.hidden = showingSketch || (!filterable && state.view !== 'atlas');
  dom.testsToggle.hidden = showingSketch || (!filterable && state.view !== 'atlas');
  dom.depthSelect.hidden = showingSketch || state.view !== 'map';
  if (state.view === 'map' && !showingSketch) {
    // Copy Mermaid still hands over the classic folder overview.
    state.currentDiagram = { source: overviewDiagram(scan, facts).source, nodes: {} };
    renderMap(true);
    renderCrumbs();
    renderFoot();
    return;
  }

  if (isAtlasList) {
    dom.aiDrawBtn.hidden = true;
    dom.canvasEmpty.hidden = true; // the list is its own content; no placeholder
    renderAtlasList();
    renderCrumbs();
    renderFoot();
    return;
  }

  // An active AI draft replaces the static diagram for its exact view.
  if (state.aiActiveKey === key && state.aiDiagrams[key]) {
    const ai = state.aiDiagrams[key];
    const source = diagramThemeBlock() + '\n' + ai.body; // theme follows the toggle
    dom.canvasEmpty.hidden = true;
    try {
      await renderInto(dom.canvasContent, source);
      connectionFocus.bind();
      wireAIClicks();
      requestAnimationFrame(() => panzoom.fit());
    } catch (err) {
      console.error(err);
      delete state.aiDiagrams[key];
      state.aiActiveKey = null;
      toast('That AI sketch would not draw — back to the static map.');
      renderCanvas();
      return;
    }
    state.currentDiagram = { source, nodes: {} };
    renderCrumbs();
    renderFoot(ai.caption);
    return;
  }

  // Honest empty states: better than a sparse, confusing diagram.
  const nothing = nothingToShow();
  if (nothing) {
    dom.canvasContent.innerHTML = '';
    connectionFocus.bind();
    dom.canvasEmpty.textContent = nothing;
    dom.canvasEmpty.hidden = false;
    state.currentDiagram = { source: '', nodes: {} };
    renderCrumbs();
    renderFoot();
    return;
  }

  let d;
  if (state.view === 'patterns') {
    d = layersDiagram(scan, facts, state.patterns.layersInfo, { include: pathFilter(state.filters) });
  } else if (state.view === 'health') {
    d = healthDiagram(scan, facts, state.health, { include: pathFilter(state.filters) });
  } else if (state.view === 'security') {
    d = securityDiagram(scan, facts, state.security, { include: pathFilter(state.filters) });
  } else if (state.view === 'history') {
    d = historyDiagram(scan, facts, state.history);
  } else if (state.view === 'services') {
    d = servicesDiagram(scan, manifest);
  } else if (state.view === 'tour') {
    const stop = state.tour.stops[state.tour.idx];
    d = stop ? fileDetailDiagram(scan, facts, stop.path) : emptyDiagram('No tour stops could be picked from this repo.');
  } else if (state.view === 'atlas' && state.atlasOpen) {
    d = openCardDiagram();
  } else {
    d = state.detail
      ? fileDetailDiagram(scan, facts, state.detail)
      : folderDiagram(scan, facts, state.folder, { include: pathFilter(state.filters) });
  }

  state.currentDiagram = d;
  dom.canvasEmpty.hidden = true;
  try {
    await renderInto(dom.canvasContent, d.source);
    connectionFocus.bind(d.nodes);
    wireNodeClicks(dom.canvasContent, d.nodes, onNodeClick);
    requestAnimationFrame(() => panzoom.fit());
  } catch (err) {
    console.error(err);
    dom.canvasEmpty.textContent = 'That diagram would not draw: ' + err.message;
    dom.canvasEmpty.hidden = false;
  }
  renderCrumbs();
  renderFoot();
}

// Returns a message when the current view has nothing worth drawing, else
// null. The inspector still has plenty to say in these cases — this is only
// about the canvas.
function nothingToShow() {
  const { scan, facts } = state;
  const parsed = scan.stats.filesParsed;
  const edges = scan.stats.edgeCount;

  if (state.view === 'patterns') {
    if (!parsed) return 'No code files parsed, so there are no patterns to read.';
    if (!edges) return 'No import connections anywhere — a shape needs edges, and there are none.';
  }

  if (state.view === 'files') {
    if (state.detail) {
      const f = scanIndex(scan).fileAt(state.detail);
      if (!f) return 'That file is not in the scan.';
      const fin = facts.fanIn[state.detail] || 0;
      const fout = facts.fanOut[state.detail] || 0;
      if (!fin && !fout) {
        return f.functions.length
          ? `${f.name} stands alone — nothing imports it and it imports nothing.`
          : `${f.name} stands alone — nothing imports it, it imports nothing, and no functions to chart.`;
      }
    } else {
      const here = scanIndex(scan).filesIn(state.folder);
      if (!here.length) return 'Nothing parsed in this folder.';
      const localSet = new Set(here.map((x) => x.path));
      const touched = scan.edges.some((e) => localSet.has(e.from) || localSet.has(e.to));
      if (!touched) return 'The files here import nothing we can see, and nothing imports them.';
    }
  }

  if (state.view === 'services') {
    if (!state.manifest?.services?.length) {
      return 'No services detected — no docker-compose, Procfile, or workspace setup we recognize.';
    }
  }

  return null;
}

// ------------------------------------------------------- filters & routing --

// Typing re-renders, so it is debounced; the toggles are single clicks and are
// not. The Map redraws in place, everything else goes through the canvas router.
let filterTimer = null;
function applyFilters() {
  if (state.view === 'map' && state.aiActiveKey !== aiViewKey()) renderMap(false);
  else renderCanvas();
}
function applyFiltersSoon() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(applyFilters, 160);
}

dom.modeSwitch.addEventListener('click', (event) => {
  const chip = eventElement(event)?.closest<HTMLElement>('.mode-chip');
  if (chip) setView(chip.dataset.mode);
});
dom.nodeFilter.addEventListener('input', () => {
  state.filters.text = dom.nodeFilter.value;
  applyFiltersSoon();
});
dom.testsToggle.addEventListener('click', () => {
  state.filters.showTests = !state.filters.showTests;
  dom.testsToggle.classList.toggle('is-on', state.filters.showTests);
  applyFilters();
});
dom.depthSelect.addEventListener('change', () => {
  state.filters.depth = Number(dom.depthSelect.value);
  if (state.filters.depth > 0) state.mm.expanded = expandedToDepth(state.treeData, state.filters.depth);
  if (state.view === 'map') { renderMap(false); renderSidebar(); }
});

// ---------------------------------------------------------- crumbs & foot --

function renderCrumbs() {
  const parts = [];
  parts.push(`<button data-go="map">${escapeHtml(state.scan.name)}</button>`);

  if (state.view === 'files' || state.view === 'tour') {
    const folder = state.view === 'tour' ? dirOf(state.tour.stops[state.tour.idx]?.path || '') : state.folder;
    if (folder) {
      const segs = folder.split('/');
      segs.forEach((seg, i) => {
        parts.push(`<button data-folder="${escapeHtml(segs.slice(0, i + 1).join('/'))}">${escapeHtml(seg)}</button>`);
      });
    }
    const detail = state.view === 'tour' ? state.tour.stops[state.tour.idx]?.path : state.detail;
    if (detail) parts.push(`<span>${escapeHtml(detail.split('/').pop())}</span>`);
  } else if (state.view === 'services') {
    parts.push('<span>services</span>');
  } else if (state.view === 'atlas') {
    parts.push('<button data-atlas="list">atlas</button>');
    if (state.atlasOpen) {
      const t = state.atlasOpen.title;
      parts.push(`<span>${escapeHtml(t.length > 34 ? '…' + t.slice(-33) : t)}</span>`);
    }
  } else if (state.view === 'about') {
    parts.push('<span>about</span>');
  } else if (state.view === 'docs') {
    parts.push('<span>docs</span>');
  } else if (state.view === 'patterns') {
    parts.push('<span>patterns</span>');
  } else if (state.view === 'history') {
    parts.push('<span>history</span>');
  }

  dom.crumbs.innerHTML = parts.join('<span class="sep">/</span>');
  for (const b of dom.crumbs.querySelectorAll('button')) {
    b.addEventListener('click', () => {
      if (b.dataset.atlas) {
        state.atlasOpen = null;
        renderCanvas();
        return;
      }
      if (b.dataset.go === 'map') return setView('map');
      state.folder = b.dataset.folder || '';
      state.detail = null;
      setView('files');
    });
  }
}

function renderFoot(aiCaption?: any) {
  const s = state.scan.stats;
  const f = state.facts;
  const langList = Object.entries(s.languages).map(([k, v]) => `${v} ${k}`).join(', ');
  dom.stageFoot.innerHTML = [
    aiCaption ? `<span class="ai-cap" title="${escapeHtml(aiCaption)}">“${escapeHtml(aiCaption)}”</span>` : '',
    `<span class="foot-stats">
       <b>${s.filesParsed}</b> files ·
       <b>${s.edgeCount}</b> connections ·
       <b>${f.entries.length}</b> entries ·
       <b>${f.hubs.length}</b> hubs ·
       <b>${f.orphans.length}</b> unconnected
       ${f.cycles.length ? ` · <b class="warn">${f.cycles.length}</b> circular` : ''}
     </span>`,
    `<span class="foot-right">
       ${langList ? `<span class="langs" title="${escapeHtml(langList)}">${escapeHtml(langList)}</span>` : ''}
       <span>scanned in <b>${s.tookMs}</b> ms</span>
     </span>`,
  ].filter(Boolean).join('');
}

// ------------------------------------------------------------------- tour --

function showTourStop() {
  const { stops, idx } = state.tour;
  const stop = stops[idx];
  if (!stop) {
    dom.tourTitle.textContent = 'No stops could be picked from this repo.';
    dom.tourCount.textContent = '0 / 0';
    inspector.showOverview(state);
    return;
  }
  dom.tourTitle.textContent = stop.path;
  dom.tourTitle.title = stop.why;
  dom.tourCount.textContent = describeStop(stop, idx, stops.length).count;
  focusFile(stop.path);
  syncInspector();
  renderSidebar();
}

dom.tourPrev.addEventListener('click', () => {
  if (state.tour.idx > 0) {
    state.tour.idx--;
    renderCanvas();
    showTourStop();
  }
});
dom.tourNext.addEventListener('click', () => {
  if (state.tour.idx < state.tour.stops.length - 1) {
    state.tour.idx++;
    renderCanvas();
    showTourStop();
  }
});
dom.tourExit.addEventListener('click', () => setView('map'));

// ---------------------------------------------------------- stage actions --

dom.copyMermaidBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.currentDiagram.source);
    toast('Mermaid source copied.');
  } catch {
    toast('The clipboard said no.');
  }
});

dom.svgBtn.addEventListener('click', () => {
  const name = (state.scan?.name || 'codebase') + '-' + state.view + '.svg';
  if (downloadSvg(dom.canvasContent, name)) toast('SVG saved.');
});

dom.fitBtn.addEventListener('click', () => panzoom.fit());
dom.searchTriggerBtn.addEventListener('click', () => searchCtl?.show(dom.searchTriggerBtn));
document.addEventListener('search-visibility', () => forceGraphCtl?.setActive(state.view === 'graph' && !searchCtl?.isShowing()));
dom.graphSearchInput?.addEventListener('input', (e) => forceGraphCtl?.search((e.currentTarget as HTMLInputElement).value));
dom.graphFit?.addEventListener('click', () => forceGraphCtl?.fit());

// ------------------------------------------------------------- AI explain --

inspector.initInspector({
  onAskAI: askAI,
  onClearFocus: clearFocus,
  // The inspector's "Code" button means the Code tab, not the Explorer —
  // openFile would drop the person back on the map they came from.
  onOpenCode: openFileInCode,
  onDeepDive: openDeepDive,
  onToast: toast,
});

// The About view owns its own rendering; it borrows these three from the shell.
initAbout({
  host: dom.aboutView,
  onToast: toast,
  onOpenSettings: openSettings,
  repoOverview,
});

initDocs({
  host: dom.docView,
  onToast: toast,
  onOpenSettings: openSettings,
  onOpenFile: openFile,
  repoOverview,
});

initCodeTab({
  host: dom.codeView,
  blameGutter: dom.blameGutter,
  onSyncInspector: syncInspector,
  onRenderSidebar: renderSidebar,
  onOpenFile: openFile,
  onDeepDive: openDeepDive,
  onToast: toast,
  getTheme,
});

// The deep-analysis panel lives in the security view's inspector. It runs the
// external engines through the server, then merges what they find back into the
// scan so the grade and the finding list update to include them.
initAnalysisPanel({
  host: dom.inspSecurityTools,
  onToast: toast,
  onOpenFile: openFileInCode,
});

// The full-page Deep Analysis view. Same store, same run, more room: the whole
// report with file links and an AI explainer.
initDeepAnalysis({
  host: dom.analysisView,
  onToast: toast,
  onOpenFile: openFileInCode,
  onOpenSettings: openSettings,
  repoOverview,
});

// A run started from either surface changes the scan's findings, so whatever
// panel is on screen has to be told. The merge itself happens in the store.
subscribeAnalysis(() => {
  if (state.scan) syncInspector();
});

initAiDraft({
  host: dom.aiDrawBtn,
  statusEl: dom.canvasEmpty,  // the placeholder doubles as the progress line
  nodeHost: dom.canvasContent,
  onRender: renderCanvas,
  onValidate: source => validateDiagram(diagramThemeBlock() + '\n' + source),
  onOpenFile: openFile,
  onOpenSettings: openSettings,
  onToast: toast,
});

initAtlas({
  host: dom.canvasContent,
  canvas: dom.canvas,
  onSyncInspector: syncInspector,
  onRender: renderCanvas,
  onHome: () => panzoom.home(),
});

initMap({
  host: dom.canvasContent,
  toggleBtn: dom.mmToggleBtn,
  collapseBtn: dom.mmCollapseBtn,
  onSyncInspector: syncInspector,
  onRenderSidebar: renderSidebar,
  onOpenFile: chooseFileDestination,
  onOpenFolder: (folder) => {
    state.folder = folder;
    state.detail = null;
    setView('files');
  },
  onToast: toast,
  onFit: () => requestAnimationFrame(() => panzoom.fit()),
  onReanchor: panzoom.reanchor,
  onGetAnchor: panzoom.visibleAnchor,
  onFocusCell: panzoom.focusPoint,
  onRendered: () => connectionFocus.bind(),
});

function repoOverview() {
  return explainOverview(state.scan, state.facts, state.manifest).replace(/[*`]/g, '');
}

async function askAI() {
  if (!llm.isConfigured()) {
    openSettings();
    toast('Choose Hermes or an endpoint in AI connection first.');
    return;
  }
  if (!state.selected) return;

  const settings = llm.getSettings();
  const ctx = await gatherFileContext(state.selected);
  const messages = llm.fileMessages({
    repoName: state.scan.name,
    overview: repoOverview(),
    ...ctx,
  });

  const writer = inspector.explainStreamWriter();
  try {
    // Reasoning models (like the bundled Nemotron default) think before they
    // write, so the budget needs room for both the thinking and the answer.
    for await (const delta of streamExplain({ ...settings, messages, maxTokens: 1600 })) {
      writer.push(delta);
    }
    writer.finish(`Written by ${settings.model}, from the real source and the import graph.`);
  } catch (err) {
    writer.fail(err.message + ' Check the AI connection drawer, top right.');
  }
}

// Free-form questions. The selected file's context rides along when there is
// one; otherwise the model reasons from the repo overview alone.
async function askCustom() {
  const question = dom.askInput.value.trim();
  if (!question) return toast('Type a question first.');
  if (!state.scan) return;
  if (!llm.isConfigured()) {
    openSettings();
    toast('Choose Hermes or an endpoint in AI connection first.');
    return;
  }

  const settings = llm.getSettings();
  const file = state.selected ? await gatherFileContext(state.selected) : null;
  const messages = llm.questionMessages({
    repoName: state.scan.name,
    overview: repoOverview(),
    question,
    file,
  });

  dom.askBtn.disabled = true;
  dom.askBtn.textContent = '…';
  const writer = inspector.explainStreamWriter(`<p class="ask-q">“${escapeHtml(question)}”</p>`);
  try {
    for await (const delta of streamExplain({ ...settings, messages, maxTokens: 1600 })) {
      writer.push(delta);
    }
    writer.finish(`Answered by ${settings.model}.`);
  } catch (err) {
    writer.fail(err.message + ' Check the AI connection drawer, top right.');
  } finally {
    dom.askBtn.disabled = false;
    dom.askBtn.textContent = 'Ask';
  }
}

dom.askBtn.addEventListener('click', askCustom);
dom.askInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') askCustom();
});

// ---------------------------------------------------------- settings bits --

let hermesInfo = null;
let connectionCheck: AbortController | null = null;
let connectionTest: AbortController | null = null;

async function refreshHermes() {
  connectionCheck?.abort();
  const controller = connectionCheck = new AbortController();
  hermesInfo = null;
  dom.hermesConnectionStatus.textContent = 'Checking your Hermes configuration…';
  dom.hermesModel.textContent = dom.hermesProvider.textContent = '—';
  dom.saveSettings.disabled = dom.testSettings.disabled = true;
  dom.refreshHermes.disabled = true;
  try {
    const info = await fetchHermesStatus(controller.signal);
    if (controller.signal.aborted) return;
    hermesInfo = info;
    dom.hermesConnectionStatus.textContent = info.message;
    dom.hermesModel.textContent = info.model || 'Choose in your terminal';
    dom.hermesProvider.textContent = info.provider || 'Not configured';
    dom.saveSettings.disabled = dom.testSettings.disabled = !info.available || !info.configured;
  } catch (err) {
    if (!controller.signal.aborted) dom.hermesConnectionStatus.textContent = err.message;
  } finally {
    if (connectionCheck === controller) dom.refreshHermes.disabled = false;
  }
}

function syncAIConnection() {
  connectionCheck?.abort(); connectionTest?.abort();
  const hermes = dom.setConnection.value === 'hermes';
  dom.apiConnection.hidden = hermes;
  dom.hermesConnection.hidden = !hermes;
  dom.saveSettings.disabled = dom.testSettings.disabled = false;
  dom.settingsStatus.textContent = '';
  dom.aiConnectionNote.textContent = hermes
    ? 'Hermes keeps your login on the server. Only the connection choice is saved in this browser. AI features send the displayed repository context to your Hermes provider.'
    : 'Endpoint settings are saved in this browser. The key is forwarded through your server and never written to its disk or logs.';
  if (hermes) void refreshHermes();
}

function readAISettings() {
  return { connection: dom.setConnection.value, hermesModel: hermesInfo?.model || '',
    baseUrl: dom.setBaseUrl.value.trim().replace(/\/+$/, ''), apiKey: dom.setApiKey.value, model: dom.setModel.value.trim() };
}

dom.setConnection.addEventListener('change', syncAIConnection);
dom.refreshHermes.addEventListener('click', () => { void refreshHermes(); });

function openSettings() {
  // Same reason the MCP drawer closes settings: one scrim at a time.
  if (!dom.mcpDrawer.hidden) closeMcp();
  serverDrawer.close();
  const s = llm.getSettings(false);
  dom.setConnection.value = s.connection;
  dom.setBaseUrl.value = s.baseUrl;
  dom.setApiKey.value = s.apiKey;
  dom.setModel.value = s.model;
  dom.settingsStatus.textContent = '';
  dom.settingsDrawer.hidden = false;
  dom.drawerScrim.hidden = false;
  syncAIConnection();
}

function closeSettings() {
  connectionCheck?.abort(); connectionTest?.abort();
  dom.settingsDrawer.hidden = true;
  dom.drawerScrim.hidden = true;
}

dom.settingsBtn.addEventListener('click', openSettings);
dom.drawerClose.addEventListener('click', closeSettings);

// ------------------------------------------------------------- server bits --

// The third drawer. Its content and round-trips live in js/serverSettings.js;
// what stays here is the choreography it shares with the other two drawers —
// one scrim at a time, Escape to dismiss.
const serverDrawer = createServerDrawer({ toast });

function openServer() {
  closeSettings();
  if (!dom.mcpDrawer.hidden) closeMcp();
  serverDrawer.open();
}

dom.serverBtn.addEventListener('click', () => (serverDrawer.isOpen() ? serverDrawer.close() : openServer()));

// ------------------------------------------------------------------- mcp --

// The topbar button, the drawer, and the polling behind them.
//
// The shape is deliberately the same as the settings drawer above — one scrim,
// one panel, a Close button, Escape to dismiss — because the person who learned
// one has already learned the other. What differs is the content: this panel has
// a live status, two actions, and a config block, so it polls. Polling continues
// while closed, slowly, because the dot on the button has to stay truthful when
// the drawer is not there to explain it.

let mcpPoll = null;
let mcpBusy = false;
let mcpCommand = null; // fetched once; the command does not change while it runs

// The dot's three states, and the copy that goes with each. `starting` is
// separate from `running` because the handshake takes a beat, and claiming
// success before it is known would be a lie the person acts on.
function mcpDotClass(state) {
  if (state === 'running') return 'is-running';
  if (state === 'starting' || state === 'stopping') return 'is-starting';
  if (state === 'error' || state === 'unavailable') return 'is-error';
  return '';
}

function mcpStateLabel(data) {
  switch (data.state) {
    case 'running': return `Running · ${data.toolCount} tools`;
    case 'starting': return 'Starting…';
    case 'stopping': return 'Stopping…';
    case 'error': return 'Failed to start';
    case 'unavailable': return 'Not available';
    default: return 'Stopped';
  }
}

function formatUptime(ms) {
  if (!ms && ms !== 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function renderMcpStatus(data) {
  if (!data) {
    // No server answered. The button is still there — it always is — but it says
    // so rather than showing a confident "stopped" for a process we cannot see.
    dom.mcpDot.className = 'mcp-dot is-error';
    dom.mcpBtnLabel.textContent = 'MCP';
    dom.mcpPanelDot.className = 'mcp-dot mcp-dot-lg is-error';
    dom.mcpPanelState.textContent = 'The server did not answer.';
    dom.mcpStart.disabled = true;
    dom.mcpStop.disabled = true;
    dom.mcpStatus.textContent = 'Is the Onboarder server running?';
    return;
  }

  const cls = mcpDotClass(data.state);
  dom.mcpDot.className = 'mcp-dot ' + cls;
  dom.mcpPanelDot.className = 'mcp-dot mcp-dot-lg ' + cls;
  dom.mcpBtnLabel.textContent = data.running ? 'MCP on' : 'MCP';
  dom.mcpBtn.title = data.running
    ? `MCP server running · ${data.toolCount} tools · pid ${data.pid}`
    : 'Start the MCP server so AI agents can read this repository';
  dom.mcpPanelState.textContent = mcpStateLabel(data);

  // Both buttons stay visible and swap roles through `disabled`, so the panel
  // does not reflow as the state changes underneath it.
  const busy = data.state === 'starting' || data.state === 'stopping';
  dom.mcpStart.disabled = busy || data.state === 'unavailable' || data.running;
  dom.mcpStop.disabled = busy || data.state === 'unavailable' || !data.running;

  const bits = [];
  if (data.running) {
    bits.push(`pid ${data.pid}`);
    bits.push(`up ${formatUptime(data.uptimeMs)}`);
  }
  if (data.lastError) bits.push(data.lastError);
  dom.mcpStatus.textContent = bits.join(' · ');

  // The config only appears once there is a server to configure against. Shown
  // earlier, it would be a command for a process that is not running.
  dom.mcpConfig.hidden = !data.running;
  if (data.running) {
    dom.mcpToolsHint.textContent = `${data.toolCount} tools: ${(data.tools || []).join(', ')}`;
  }
}

function scheduleMcpPoll(ms) {
  clearTimeout(mcpPoll);
  mcpPoll = setTimeout(pollMcp, ms);
}

async function pollMcp() {
  renderMcpStatus(await fetchMcpStatus());
  // Closed: a slow heartbeat, so the dot is right when the person comes back
  // without the tab asking the server anything it does not need to answer.
  scheduleMcpPoll(dom.mcpDrawer.hidden ? 8000 : 2500);
}

async function loadMcpCommand() {
  if (mcpCommand) return mcpCommand;
  mcpCommand = await fetchMcpCommand();
  if (mcpCommand) {
    dom.mcpCommandInput.value = mcpCommand.command;
    renderMcpConfigBlock();
  }
  return mcpCommand;
}

async function openMcp() {
  // Two drawers over one page would stack their scrims, and the top one would win
  // every click. Closing settings first keeps the invariant the Escape handler
  // assumes, and matches what the person was doing — switching panels.
  closeSettings();
  serverDrawer.close();
  dom.mcpDrawer.hidden = false;
  dom.mcpScrim.hidden = false;
  await pollMcp();
  await loadMcpCommand();
  scheduleMcpPoll(2500);
}

function closeMcp() {
  dom.mcpDrawer.hidden = true;
  dom.mcpScrim.hidden = true;
  scheduleMcpPoll(8000);
}

// The two config shapes a client is most likely to want: JSON for the harnesses
// that read a config file, TOML for the ones that do not. Both are built from
// what the server reported, so neither can drift from the command that actually
// starts it.
function renderMcpConfigBlock() {
  const ex = mcpCommand?.examples?.[0];
  if (!ex) return;
  const command = shortCommand(ex.command);
  const json = { mcpServers: { onboarder: { command, args: ex.args } } };
  const toml = [
    '[mcp_servers.onboarder]',
    `command = ${JSON.stringify(command)}`,
    `args = [${ex.args.map((a) => JSON.stringify(a)).join(', ')}]`,
  ].join('\n');
  dom.mcpConfigBlock.textContent = dom.mcpTabToml.classList.contains('is-on')
    ? toml
    : JSON.stringify(json, null, 2);
}

// The server reports its own `process.execPath` so the config works even where
// the harness's PATH has no node. But an absolute path is noise in a snippet
// people read, so the common case is shown short and the input above keeps the
// exact one.
function shortCommand(cmd) {
  return typeof cmd === 'string' && cmd.endsWith('/node') ? 'node' : cmd;
}

function pickMcpTab(toml) {
  dom.mcpTabJson.classList.toggle('is-on', !toml);
  dom.mcpTabToml.classList.toggle('is-on', toml);
  dom.mcpTabJson.setAttribute('aria-selected', String(!toml));
  dom.mcpTabToml.setAttribute('aria-selected', String(toml));
  renderMcpConfigBlock();
}

dom.mcpTabJson.addEventListener('click', () => pickMcpTab(false));
dom.mcpTabToml.addEventListener('click', () => pickMcpTab(true));
dom.mcpBtn.addEventListener('click', () => (dom.mcpDrawer.hidden ? openMcp() : closeMcp()));
dom.mcpClose.addEventListener('click', closeMcp);
dom.mcpScrim.addEventListener('click', closeMcp);

dom.mcpCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(dom.mcpConfigBlock.textContent);
    toast('Config copied');
  } catch {
    // Clipboard access can be refused outright; selecting the text is the one
    // fallback that always works, so the person can copy it themselves.
    dom.mcpCommandInput.select();
  }
});

async function setMcpState(action) {
  if (mcpBusy) return;
  mcpBusy = true;
  // Optimistic: the dot goes amber immediately rather than after a round-trip
  // during which the button would still read "stopped" and invite a second click.
  renderMcpStatus({ state: action === 'start' ? 'starting' : 'stopping', running: action === 'stop', toolCount: 0, tools: [] });
  try {
    const data = action === 'start' ? await startMcpServer() : await stopMcpServer();
    renderMcpStatus(data);
    if (action === 'start') await loadMcpCommand();
  } catch (err) {
    renderMcpStatus({ state: 'error', running: action === 'stop', lastError: err.message, tools: [] });
    toast(err.message);
  } finally {
    mcpBusy = false;
    scheduleMcpPoll(1500);
  }
}

dom.mcpStart.addEventListener('click', () => setMcpState('start'));
dom.mcpStop.addEventListener('click', () => setMcpState('stop'));

// One heartbeat at load. This first fetch is also what decides whether the button
// already reads "MCP on" for a server that was left running from before.
scheduleMcpPoll(0);


dom.drawerScrim.addEventListener('click', closeSettings);

dom.saveSettings.addEventListener('click', () => {
  stopAiDraft();
  llm.saveSettings(readAISettings());
  dom.settingsStatus.className = 'drawer-status ok';
  dom.settingsStatus.textContent = dom.setConnection.value === 'hermes' ? 'Hermes connected. Your AI features now use its configured login.' : 'Saved in this browser.';
  updateAiBtn();
  if (state.scan) { syncInspector(); void renderCanvas(); }
});

dom.testSettings.addEventListener('click', async () => {
  const settings = readAISettings();
  if (settings.connection !== 'hermes' && (!settings.baseUrl || !settings.model)) {
    dom.settingsStatus.className = 'drawer-status err';
    dom.settingsStatus.textContent = 'Base URL and model are both needed.';
    return;
  }
  dom.settingsStatus.className = 'drawer-status';
  dom.settingsStatus.textContent = settings.connection === 'hermes' ? 'Asking Hermes… first response may take a moment.' : 'Asking the endpoint…';
  const controller = connectionTest = new AbortController();
  dom.testSettings.disabled = true;
  try {
    let heard = '';
    for await (const delta of streamExplain({
      ...settings,
      signal: controller.signal,
      maxTokens: 64,
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    })) {
      heard += delta;
    }
    if (controller.signal.aborted) return;
    dom.settingsStatus.className = 'drawer-status ok';
    dom.settingsStatus.textContent = heard
      ? `Connected — ${settings.connection === 'hermes' ? 'Hermes · ' + settings.hermesModel : settings.model} answered. Save to use this connection.`
      : `Connected. It answered with silence, but that is a thinking model spending its whole token budget on thought — explanations use a bigger one.`;
  } catch (err) {
    if (controller.signal.aborted) return;
    dom.settingsStatus.className = 'drawer-status err';
    dom.settingsStatus.textContent = err.message;
  } finally {
    if (connectionTest === controller && !controller.signal.aborted) dom.testSettings.disabled = false;
  }
});

// ------------------------------------------------------------------- misc --

let toastTimer = null;
function toast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (dom.toast.hidden = true), 2600);
}

document.addEventListener('keydown', (event) => {
  if (eventElement(event)?.matches('input, textarea, select')) return;
  // Escape closes whichever drawer is open. The three are kept mutually
  // exclusive when they open, so at most one is ever showing — but checking
  // each here means the behavior does not depend on that invariant holding.
  if (event.key === 'Escape') {
    if (!dom.mcpDrawer.hidden) return closeMcp();
    if (serverDrawer.isOpen()) return serverDrawer.close();
    return closeSettings();
  }
  if (!state.scan) return;
  if (event.key === '1') setView(state.lastExplorer || 'map');
  if (event.key === '2') setView('code');
  if (event.key === '3') setView('docs');
  if (event.key === '4') setView('about');
  if (event.key === '/') {
    event.preventDefault();
    dom.treeFilter.focus();
  }
  if (state.view === 'tour') {
    if (event.key === ']') dom.tourNext.click();
    if (event.key === '[') dom.tourPrev.click();
  }
});

// ------------------------------------------------------------------ theme --

const THEME_KEY = 'onboarder.theme';

function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  setDiagramTheme(theme);
  setViewerTheme(theme);
  dom.themeBtn.textContent = theme === 'dark' ? 'Light' : 'Dark';
  dom.themeBtn.title = theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme';
}

dom.themeBtn.addEventListener('click', () => {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  if (state.scan && (isExplorerView(state.view) || state.view === 'graph' || state.view === 'heatmap')) renderCanvas(); // Only canvas/diagram views need a theme redraw.
});

applyTheme(getTheme());
