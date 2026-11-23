import { showReviewPatch } from './reviewPatch.js';
import { escapeHtml } from './html.js';
import type { ChangeStackFile, ChangeStackGroup, ChangeStackOverlay, ChangeStackResult, ChangeStackSymbolChange } from '../../shared/changeStack/contracts.js';

interface ChangeStackState {
  result: ChangeStackResult | null; base: string; head: string; semantic: boolean;
  error: string; running: boolean; autoRun: boolean; overlay: 'changes' | 'context'; origin: 'triage' | null;
}
interface ChangeStackContext { scanId: string | null; scan: { root: string }; changeStack: ChangeStackState }

let active: AbortController | null = null;
let renderVersion = 0;

/** Stop the in-flight build when the view changes without discarding the last completed stack. */
export function stopChangeStack() { active?.abort(); active = null; renderVersion++; }

async function requestStack(scanId: string, body: Record<string, unknown>, signal: AbortSignal): Promise<ChangeStackResult> {
  const response = await fetch('/api/intelligence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'change-stack', scanId, ...body }), signal });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Change Stack returned no response.');
  let raw = '', bytes = 0; const decoder = new TextDecoder();
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 9 * 1024 * 1024) throw new Error('Change Stack response exceeds 9 MB. Choose a narrower range.');
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  const value = JSON.parse(raw);
  if (!response.ok) throw new Error(value.error || 'Change Stack failed.');
  return value as ChangeStackResult;
}

const statusLabel: Record<ChangeStackFile['status'], string> = {
  added: 'added', deleted: 'deleted', modified: 'modified', renamed: 'renamed', copied: 'copied',
};
function movementLabel(file: ChangeStackFile) {
  return file.movement === 'none' ? statusLabel[file.status] || file.status : file.movement.replace('-', ' + ');
}
function pathLabel(file: ChangeStackFile) {
  return file.oldPath === file.newPath ? file.newPath : file.oldPath + ' → ' + file.newPath;
}
function fileCard(file: ChangeStackFile, groups: ChangeStackGroup[], symbols: Map<string, ChangeStackSymbolChange>, esc: (value: string) => string) {
  const group = groups.find(value => value.id === file.groupId);
  const symbolLinks = file.semanticChangeIds.map(id => symbols.get(id)).filter(Boolean).map(symbol => `<button type="button" class="change-symbol-link" data-symbol-id="${esc(symbol!.id)}">${esc(symbol!.previousName ? symbol!.previousName + ' → ' + symbol!.name : symbol!.name)} <small>${esc(symbol!.confidence)}</small></button>`).join('');
  return `<article class="change-file" id="${esc(file.id)}" tabindex="-1">
    <header><div><span class="change-file-status status-${esc(file.status)}">${esc(movementLabel(file))}</span>${group ? `<span class="change-file-group">${esc(group.title)}</span>` : ''}<h3><code>${esc(pathLabel(file))}</code></h3></div><span class="change-file-lines"><b class="review-add">+${file.additions}</b> <b class="review-del">−${file.deletions}</b></span></header>
    ${file.exportsRemoved.length || file.exportsAdded.length ? `<div class="change-contract">${file.exportsRemoved.length ? `<p><strong>Removed exports</strong></p><ul>${file.exportsRemoved.map(name => `<li><code>${esc(name)}</code></li>`).join('')}</ul>` : ''}${file.exportsAdded.length ? `<p><strong>Added exports</strong></p><ul>${file.exportsAdded.map(name => `<li><code>${esc(name)}</code></li>`).join('')}</ul>` : ''}</div>` : ''}
    ${symbolLinks ? `<div class="change-symbol-links">${symbolLinks}</div>` : ''}
    <footer><button type="button" class="btn btn-ghost btn-sm" data-patch="${esc(file.newPath || file.oldPath)}"${file.patchAvailable ? '' : ' disabled'}>Captured patch</button>${file.patchAvailable ? '' : `<span class="review-small">${esc(file.patchSkipped[0] || 'No readable source hunks for this file.')}</span>`}</footer>
  </article>`;
}

function overlayNodes(overlay: ChangeStackOverlay, side: 'before' | 'after', mode: 'changes' | 'context', esc: (value: string) => string) {
  const nodes = overlay.nodes.filter(node => (mode === 'context' || node.status !== 'unchanged') && (side === 'before' ? node.beforePath : node.afterPath)).slice(0, mode === 'context' ? 80 : 60);
  if (!nodes.length) return '<p class="review-small">No changed files on this side.</p>';
  return `<ol class="change-overlay-nodes">${nodes.map(node => {
    const path = side === 'before' ? node.beforePath : node.afterPath;
    const content = `<span class="change-node-path">${esc(path || '')}</span><span class="change-node-status status-${esc(node.status)}">${esc(node.status.replace('-', ' + '))}</span>`;
    return `<li>${node.fileId ? `<button type="button" class="linklike" data-file-id="${esc(node.fileId)}">${content}</button>` : `<span>${content}</span>`}</li>`;
  }).join('')}</ol>`;
}
function overlayEdges(overlay: ChangeStackOverlay, side: 'before' | 'after', mode: 'changes' | 'context', esc: (value: string) => string) {
  const byId = new Map(overlay.nodes.map(node => [node.id, node]));
  const rows = overlay.edges.filter(edge => (mode === 'context' || edge.status !== 'unchanged') && edge.status !== (side === 'before' ? 'added' : 'removed')).map(edge => {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    const fromPath = from && (side === 'before' ? from.beforePath : from.afterPath), toPath = to && (side === 'before' ? to.beforePath : to.afterPath);
    return fromPath && toPath ? `<li><code>${esc(fromPath)}</code> <span aria-hidden="true">→</span> <code>${esc(toPath)}</code> <small>${esc(edge.status)} ${esc(edge.kind)}</small></li>` : '';
  }).filter(Boolean).slice(0, 60);
  return rows.length ? `<ul class="change-overlay-edges">${rows.join('')}</ul>` : '<p class="review-small">No changed edges on this side.</p>';
}
function overlayMarkup(overlay: ChangeStackOverlay, mode: 'changes' | 'context', esc: (value: string) => string) {
  return `<div class="change-overlay-controls"><div class="mode-switch"><button type="button" class="mode-chip${mode === 'changes' ? ' is-active' : ''}" data-overlay="changes">Changed only</button><button type="button" class="mode-chip${mode === 'context' ? ' is-active' : ''}" data-overlay="context">With direct context</button></div><p class="review-small">Canonical paths keep renamed files in one row. Edges show imports on each side. Showing ${overlay.nodes.length} of ${overlay.totalNodes} nodes and ${overlay.edges.length} of ${overlay.totalEdges} edges.</p></div>
    <div class="change-overlay-grid"><section class="change-overlay-side"><h3>Before</h3>${overlayNodes(overlay, 'before', mode, esc)}<h4>Changed dependencies</h4>${overlayEdges(overlay, 'before', mode, esc)}</section><section class="change-overlay-side"><h3>After</h3>${overlayNodes(overlay, 'after', mode, esc)}<h4>Changed dependencies</h4>${overlayEdges(overlay, 'after', mode, esc)}</section></div>`;
}

function reportMarkup(s: ChangeStackState, esc: (value: string) => string) {
  const report = s.result!;
  const groups = report.groups;
  const symbols = new Map(report.symbolChanges.map(symbol => [symbol.id, symbol]));
  const coverage = 'Coverage ' + report.coverage.status;
  const fileRef = (path: string, line?: number) => {
    const file = report.files.find(value => value.oldPath === path || value.newPath === path);
    return file ? `<button type="button" class="linklike" data-file-path="${esc(path)}">${esc(path)}${line ? ':' + line : ''}</button>` : `<code>${esc(path)}${line ? ':' + line : ''}</code>`;
  };
  return `<section class="change-summary"><div><div class="workbench-eyebrow">CHANGE STACK</div><h2>${report.summary.files} file${report.summary.files === 1 ? '' : 's'} · ${groups.length} review group${groups.length === 1 ? '' : 's'}</h2><p><code>${esc(report.base.slice(0, 12))}</code> → <code>${esc(report.head.slice(0, 12))}</code> · ${esc(new Date(report.generatedAt).toLocaleString())}</p><p class="review-small">${esc(coverage)} · semantic ${esc(report.semantic.status.replace('-', ' '))}${report.semantic.engine ? ' · ' + esc(report.semantic.engine) : ''}</p></div><div class="review-export"><button type="button" class="btn btn-ink" data-action="review">Open Review</button><button type="button" class="btn" data-action="json">Export JSON</button></div></section>
    <div class="review-metrics change-metrics"><article><span>Lines</span><strong>+${report.summary.additions} / −${report.summary.deletions}</strong><small>Across captured files</small></article><article><span>File moves</span><strong>${report.summary.fileMoves}</strong><small>Git or exact content</small></article><article><span>Exported contracts</span><strong>${report.files.filter(file => file.exportsAdded.length || file.exportsRemoved.length).length}</strong><small>Files changing exports</small></article><article><span>Callers + tests</span><strong>${report.summary.affectedCallers} <em>/</em> ${report.summary.relatedTests}</strong><small>Static estimate in head</small></article></div>
    <nav class="change-group-nav" aria-label="Change Stack review order">${groups.map((group, index) => `<button type="button" data-target="change-group-${group.id}"><span>0${index + 1}</span>${esc(group.title)} <small>${group.fileIds.length}</small></button>`).join('')}</nav>
    <div class="change-group-list">${groups.map((group, index) => `<section class="change-group" id="change-group-${group.id}" tabindex="-1"><header><span class="change-group-index">0${index + 1}</span><div><h2>${esc(group.title)}</h2><p>${esc(group.explanation)}</p></div><span class="review-small">${group.fileIds.length} file${group.fileIds.length === 1 ? '' : 's'}</span></header><p class="change-review-focus"><strong>Review focus</strong> ${esc(group.reviewFocus)}</p><div class="change-file-list">${group.fileIds.map(id => report.files.find(file => file.id === id)).filter(Boolean).map(file => fileCard(file!, groups, symbols, esc)).join('')}</div></section>`).join('')}</div>
    <section class="change-symbols" id="change-symbols"><div class="review-section-heading"><div><span class="workbench-eyebrow">SEMANTIC CHANGES</span><h2>Symbol moves and renames</h2><p class="review-small">Compiler-supported moves follow reference retargets. Renames are candidates inferred from matching symbol kinds and caller changes.</p></div><span class="review-small">${report.symbolChanges.length} detected</span></div>${report.symbolChanges.length ? report.symbolChanges.map(symbol => `<article class="change-symbol" id="${esc(symbol.id)}" tabindex="-1"><div><span class="change-confidence confidence-${symbol.confidence === 'compiler-supported' ? 'supported' : 'candidate'}">${esc(symbol.confidence)}</span><h3>${esc(symbol.previousName ? symbol.previousName + ' → ' + symbol.name : symbol.name)} <small>${esc(symbol.symbolKind)} · ${esc(symbol.kind.replace('-', ' + '))}</small></h3></div><p>${esc(symbol.explanation)}</p><p class="review-small">${fileRef(symbol.before.path, symbol.before.line)} → ${fileRef(symbol.after.path, symbol.after.line)}</p>${symbol.references.length ? `<details><summary>${symbol.references.length} caller reference${symbol.references.length === 1 ? '' : 's'}</summary><ul>${symbol.references.slice(0, 30).map(ref => `<li>${fileRef(ref.path, ref.beforeLine)}${ref.afterLine ? ` → ${ref.afterLine}` : ''}</li>`).join('')}</ul></details>` : ''}</article>`).join('') : '<p class="review-small">No symbol-level moves were detected. Enable semantic analysis when building the stack to inspect declarations and references.</p>'}</section>
    <section class="change-overlay" id="change-overlay"><div class="review-section-heading"><div><span class="workbench-eyebrow">BEFORE / AFTER OVERLAY</span><h2>Dependency changes with direct context</h2></div><span class="review-small">Static imports, bounded</span></div>${overlayMarkup(report.overlay, s.overlay, esc)}</section>
    <section class="change-impact"><details><summary>Affected callers and related tests <span>${report.impact.affectedCallers.length} callers · ${report.impact.relatedTests.length} tests</span></summary><div class="change-impact-grid"><div><h3>Callers</h3>${report.impact.affectedCallers.length ? `<ul>${report.impact.affectedCallers.map(path => `<li><code>${esc(path)}</code></li>`).join('')}</ul>` : '<p class="review-small">No callers found in the head snapshot.</p>'}</div><div><h3>Related tests</h3>${report.impact.relatedTests.length ? `<ul>${report.impact.relatedTests.map(path => `<li><code>${esc(path)}</code></li>`).join('')}</ul>` : '<p class="review-small">No related tests found in the head snapshot.</p>'}</div></div></details></section>
    <details class="review-limitations change-limitations"><summary>Evidence boundaries and limitations</summary><p class="review-small">Coverage: ${esc(report.coverage.status)}${report.semantic.reasons.length ? ' · ' + report.semantic.reasons.map(esc).join(' · ') : ''}</p>${report.limitations.map(value => `<p>${esc(value)}</p>`).join('')}${report.coverage.limitations.filter(value => !report.limitations.includes(value)).map(value => `<p>${esc(value)}</p>`).join('')}</details>`;
}

export function renderChangeStack(container: HTMLElement, context: ChangeStackContext) {
  stopChangeStack();
  const version = renderVersion;
  const s = context.changeStack;
  s.running = false;
  const esc = escapeHtml;
  const paint = () => {
    if (version !== renderVersion) return;
    container.innerHTML = `<div class="review-shell change-stack-shell">
      <header class="review-heading"><div><div class="workbench-eyebrow"><span class="review-dot"></span> CHANGE STACK</div><h1>Review changes in layers.</h1><p>Follow contracts, dependencies and implementation in a deliberate order. Every file keeps its captured evidence.</p></div><span class="review-local-badge">Exact Git revisions · read only</span></header>
      <form class="review-controls change-stack-controls" aria-label="Change Stack settings">
        <label>Base reference<input name="base" value="${esc(s.base)}" maxlength="200" spellcheck="false" autocomplete="off" required></label>
        <label>Head reference<input name="head" value="${esc(s.head)}" maxlength="200" spellcheck="false" autocomplete="off" required></label>
        <label class="change-semantic-toggle"><input name="semantic" type="checkbox"${s.semantic ? ' checked' : ''}> Semantic symbol analysis</label>
        <button type="submit" class="btn btn-ink"${s.running ? ' disabled' : ''}>${s.running ? 'Building stack…' : 'Build change stack'}</button>
        <button type="button" class="btn change-cancel" data-action="cancel"${s.running ? '' : ' hidden'}>Cancel</button>
      </form>
      <p class="review-comparison-note">${s.origin === 'triage' ? 'Loaded the exact base and head from PR Triage. ' : ''}Uses the merge base and exact head commit. Semantic analysis is optional, bounded, and sends nothing to an AI provider. No source or tests are executed.</p>
      <p class="review-error" role="alert"${s.error ? '' : ' hidden'}>${esc(s.error)}</p>
      <p class="review-small" role="status" aria-live="polite" data-stack-status>${s.running ? 'Reading the exact range, comparing graph snapshots and grouping changed files…' : ''}</p>
      <div class="change-stack-results">${s.result ? reportMarkup(s, esc) : s.running ? '' : '<section class="review-welcome"><div class="review-welcome-icon" aria-hidden="true">⇄</div><h2>A review order, not another diff.</h2><p>Change Stack turns an exact range into coherent layers: exported contracts first, then dependency and boundary changes, implementation, tests, documentation and configuration. It includes before/after dependency overlays and optional symbol moves.</p><div class="review-preview-grid"><div><span>01</span><h3>Start at contracts</h3><p>Find removed exports and caller references before reading implementation detail.</p></div><div><span>02</span><h3>Follow the graph</h3><p>Toggle before and after dependency context without losing renamed files.</p></div><div><span>03</span><h3>Open the exact evidence</h3><p>Captured patches and Review findings come from the same immutable comparison.</p></div></div></section>'}</div>
    </div>`;
    const form = container.querySelector<HTMLFormElement>('form')!;
    const error = container.querySelector<HTMLElement>('.review-error')!;
    const results = container.querySelector<HTMLElement>('.change-stack-results')!;
    const base = form.elements.namedItem('base') as HTMLInputElement, head = form.elements.namedItem('head') as HTMLInputElement, semantic = form.elements.namedItem('semantic') as HTMLInputElement;
    if (!context.scanId) { form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled = true; error.textContent = 'Change Stack needs a server-side repository scan. Open the project by local path or Git URL.'; error.hidden = false; }
    if (s.autoRun && context.scanId) { s.autoRun = false; queueMicrotask(() => form.requestSubmit()); }
    base.addEventListener('input', () => { s.origin = null; });
    head.addEventListener('input', () => { s.origin = null; });
    form.onsubmit = event => {
      event.preventDefault();
      if (!context.scanId || s.running) return;
      s.base = base.value.trim(); s.head = head.value.trim(); s.semantic = semantic.checked;
      if (!s.base || !s.head) { s.error = 'Choose a base and head Git reference.'; paint(); return; }
      void run();
    };
    async function run() {
      active?.abort();
      const controller = new AbortController(); active = controller;
      s.running = true; s.error = ''; s.result = null; paint();
      try {
        const result = await requestStack(context.scanId!, { base: s.base, head: s.head, semantic: s.semantic }, controller.signal);
        if (version !== renderVersion || active !== controller) return;
        s.result = result; s.error = '';
      } catch (errorValue) {
        if (version !== renderVersion || active !== controller) return;
        if (controller.signal.aborted) s.error = 'Change Stack build canceled.';
        else s.error = errorValue instanceof Error ? errorValue.message : 'Change Stack failed.';
      } finally {
        if (version === renderVersion && active === controller) {
          s.running = false; active = null; paint();
        }
      }
    }
    container.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener('click', () => active?.abort());
    container.querySelector<HTMLButtonElement>('[data-action="json"]')?.addEventListener('click', () => {
      if (!s.result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(s.result, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'onboarder-change-stack.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    container.querySelector<HTMLButtonElement>('[data-action="review"]')?.addEventListener('click', () => { if (s.result?.review) window.dispatchEvent(new CustomEvent('change-stack-review', { detail: { result: s.result } })); });
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-overlay]')) button.onclick = () => { s.overlay = button.dataset.overlay === 'context' ? 'context' : 'changes'; paint(); };
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-target]')) button.onclick = () => { const target = document.getElementById(button.dataset.target!); target?.scrollIntoView({ block: 'start', behavior: 'smooth' }); target?.focus({ preventScroll: true }); };
    const goFile = (id: string) => { const target = document.getElementById(id); target?.scrollIntoView({ block: 'start', behavior: 'smooth' }); target?.focus({ preventScroll: true }); };
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-symbol-id]')) button.onclick = () => goFile(button.dataset.symbolId!);
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-file-id]')) button.onclick = () => goFile(button.dataset.fileId!);
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-file-path]')) button.onclick = () => {
      const path = button.dataset.filePath!; const file = s.result?.files.find(value => value.oldPath === path || value.newPath === path); if (file) goFile(file.id);
    };
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-patch]')) button.onclick = () => { if (s.result?.review) showReviewPatch(s.result.review, button.dataset.patch!); };
    results.querySelectorAll<HTMLButtonElement>('[data-action="review"]').forEach(button => { button.onclick = () => { if (s.result?.review) window.dispatchEvent(new CustomEvent('change-stack-review', { detail: { result: s.result } })); }; });
  };
  paint();
}
