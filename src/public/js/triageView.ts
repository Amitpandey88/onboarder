import type { TriageExplanation, TriageItem, TriagePage } from '../../shared/triage/contracts.js';
import { filterTriage } from '../../shared/triage/priority.js';
import { escapeHtml as esc } from './html.js';
import { getSettings, isConfigured } from './llm.js';
import { showReviewPatch } from './reviewPatch.js';

interface Preferences { repository: string; state: string; view: string; sort: string; query: string }
interface Workspace { preferences: Preferences; page: TriagePage | null; selected: number | null; explanation: TriageExplanation | null }
const workspaces = new Map<string, Workspace>();
let active: AbortController | null = null, version = 0;
export function stopTriage() { active?.abort(); active = null; version++; }
const queues = { all: 'All PRs', immediate: 'Immediate attention', security: 'Security-sensitive', 'waiting-review': 'Waiting for review', 'waiting-author': 'Waiting for author', 'failing-checks': 'Failing checks', 'human-approval': 'Human approval candidate', stale: 'Stale' };
const sorts = { priority: 'Priority', updated: 'Recently updated', oldest: 'Oldest update', size: 'Changed lines' };
const keyFor = (root: string) => { let h = 0; for (const c of root) h = Math.imul(h, 31) + c.charCodeAt(0) | 0; return 'onboarder.triage.v1.' + h; };
function workspace(root: string) {
  let value = workspaces.get(root); if (value) return value;
  const preferences: Preferences = { repository: '', state: 'open', view: 'all', sort: 'priority', query: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(root)) || '{}');
    if (typeof saved.repository === 'string' && saved.repository.length <= 150) preferences.repository = saved.repository;
    if (['open', 'closed', 'all'].includes(saved.state)) preferences.state = saved.state;
    if (Object.hasOwn(queues, saved.view)) preferences.view = saved.view;
    if (Object.hasOwn(sorts, saved.sort)) preferences.sort = saved.sort;
    if (typeof saved.query === 'string' && saved.query.length <= 200) preferences.query = saved.query;
  } catch { /* Private browsing can use in-memory preferences. */ }
  value = { preferences, page: null, selected: null, explanation: null }; workspaces.set(root, value);
  while (workspaces.size > 4) workspaces.delete(workspaces.keys().next().value!); return value;
}
async function request(body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch('/api/triage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const reader = response.body?.getReader(); if (!reader) throw new Error('Triage returned no response.');
  let raw = '', bytes = 0; const decoder = new TextDecoder();
  try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 9 * 1024 * 1024) throw new Error('Triage response exceeds 9 MB. Narrow the inspection.'); raw += decoder.decode(part.value, { stream: true }); } raw += decoder.decode(); }
  finally { await reader.cancel().catch(() => {}); }
  const value = JSON.parse(raw);
  if (!response.ok) throw new Error((response.status === 403 ? 'Triage requires owner access and permission to read the GitHub repository. ' : '') + (value.error || 'Triage request failed.') + (value.rateLimit?.resetAt ? ' GitHub rate limit resets at ' + value.rateLimit.resetAt + '.' : ''));
  return value;
}
const list = (values: string[]) => values.length ? `<ul>${values.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '<p class="review-small">None observed.</p>';
const badge = (item: TriageItem) => `<span class="triage-priority priority-${item.priority}">${item.priority}${item.provisional ? ' · provisional' : ''}</span>`;
const observationAnchor = (id: string) => /^factor:\d+$/.test(id) ? 'triage-factor-' + id.slice(7) : id.startsWith('finding:') ? 'triage-finding-' + encodeURIComponent(id.slice(8)) : 'triage-' + (['pr', 'priority', 'coverage', 'ci', 'reviews', 'architecture'].includes(id) ? id : 'coverage');
function fileUrl(item: TriageItem, path: string, line?: number) { return `https://github.com/${item.pull.repository}/blob/${item.pull.head}/${path.split('/').map(encodeURIComponent).join('/')}${line ? '#L' + line : ''}`; }
function detail(item: TriageItem, explanation: TriageExplanation | null) {
  return `<header class="triage-detail-heading" id="triage-pr"><div>${badge(item)} <span class="review-small">${esc(item.readiness)} · ${esc(item.freshness)}</span><h2><a href="${esc(item.pull.url)}" target="_blank" rel="noopener noreferrer">#${item.pull.number} ${esc(item.pull.title)}</a></h2><p>@${esc(item.pull.author)} · ${esc(item.pull.state)}${item.pull.draft ? ' · draft' : ''} · updated ${esc(item.pull.updatedAt)}</p></div></header>
    <div class="triage-revisions"><p><strong>Base</strong> ${esc(item.pull.baseBranch)} <code>${esc(item.pull.base)}</code></p><p><strong>Head</strong> ${esc(item.pull.headBranch)} <code>${esc(item.pull.head)}</code></p><p>Observed ${esc(item.observedAt)} · ${item.pull.changedFiles ?? '?'} files · +${item.pull.additions ?? '?'} / −${item.pull.deletions ?? '?'}</p></div>
    ${!item.inspected ? '<p>Inspect this PR to retrieve exact-revision findings, CI, reviewer decisions, ownership and available local architecture.</p>' : ''}
    <div class="triage-actions"><button class="btn btn-ink" data-inspect="${item.pull.number}">${item.inspected ? 'Refresh inspection' : 'Inspect PR'}</button><button class="btn" data-explain ${!item.inspected ? 'disabled' : ''}>Explain priority with AI</button><button class="btn" data-open-review ${!item.report ? 'disabled' : ''}>Open findings in Review</button><button class="btn" data-export>Export JSON</button></div>
    <p class="review-small">AI is optional. Explain sends up to 24 KB of redacted observations to your configured connection. It cannot change priority or perform actions.</p>
    <section id="triage-priority"><h3>Why this priority · score ${item.score}</h3>${item.factors.length ? `<ul>${item.factors.map((f, i) => `<li id="triage-factor-${i}"><strong>+${f.points}</strong> ${esc(f.reason)}${f.paths?.length ? '<p class="review-small">' + f.paths.slice(0, 20).map(esc).join(' · ') + '</p>' : ''}</li>`).join('')}</ul>` : '<p>No elevated factors observed yet. This does not establish safety or readiness.</p>'}<p class="review-small">Policy: ${esc(item.policy.source)} · ${esc(item.policy.revision)}${item.policy.hash ? ' · ' + esc(item.policy.hash) : ''}</p></section>
    ${item.inspected ? `<details><summary>Assign human urgency for this head</summary><label>Minimum priority<select data-urgency><option value="">No escalation</option>${['P0', 'P1', 'P2', 'P3'].map(p => `<option${item.humanUrgency?.priority === p ? ' selected' : ''}>${p}</option>`).join('')}</select></label><label>Reason<input data-urgency-reason maxlength="1000" value="${esc(item.humanUrgency?.reason || '')}"></label><button class="btn" data-save-urgency>Reinspect with urgency</button><p class="review-small">Session-only escalation. Critical findings and policy changes cannot be downgraded.</p></details>` : ''}
    <section id="triage-ci"><h3>Observed checks · ${esc(item.checks.state)}</h3>${list(item.checks.checks.map(c => c.name + ' · ' + c.state + ' (' + c.source + ')'))}${list(item.checks.limitations)}</section>
    <section id="triage-reviews"><h3>Reviews · ${esc(item.reviews.state)}</h3><p>Requested: ${esc(item.pull.requestedReviewers.join(', ') || 'none declared')}<br>Current-head decisions: ${esc(item.reviews.reviewers.join(', ') || 'none observed')}</p>${list(item.reviews.limitations)}</section>
    <section><h3>Suggested reviewers · ${esc(item.owners.status)}</h3><p class="review-small">${esc(item.owners.path || 'CODEOWNERS unavailable')} · target ${esc(item.owners.revision)}</p>${list(item.owners.suggestions.map(s => s.reviewer + ' → ' + s.paths.slice(0, 10).join(', ')))}${list(item.owners.limitations)}</section>
    <section id="triage-architecture"><h3>Architecture impact · ${esc(item.architecture.status)}</h3><p>Dependencies added ${item.architecture.addedDependencies ?? '?'} / removed ${item.architecture.removedDependencies ?? '?'} · new cycles ${item.architecture.newCycles ?? '?'} · new boundary violations ${item.architecture.boundaryViolations ?? '?'}</p><details><summary>Affected callers: ${item.architecture.affectedCallers.length}, tests: ${item.architecture.relevantTests.length} and export candidates</summary>${list(item.architecture.affectedCallers)}${list(item.architecture.relevantTests)}${list(item.architecture.breakingExports)}</details>${list(item.architecture.limitations)}</section>
    <section><h3>Changed files: ${item.files.length}</h3>${item.files.length ? `<ul class="triage-files">${item.files.map(f => `<li><a href="${esc(fileUrl(item, f.path))}" target="_blank" rel="noopener noreferrer">${esc(f.path)}</a> <small>${esc(f.status)} +${f.additions} / −${f.deletions}${f.previousPath ? ' · from ' + esc(f.previousPath) : ''}</small>${item.report?.comparison?.files.some(r => r.newPath === f.path || r.oldPath === f.path) ? `<button class="linklike" data-patch="${esc(f.path)}">Captured patch</button>` : ''}</li>`).join('')}</ul>` : '<p>Changed files not retrieved.</p>'}</section>
    <section><h3>Review findings: ${item.report?.findings.length ?? '?'}</h3>${item.report ? `<p>${esc(item.report.summary)} · coverage ${esc(item.report.coverage.status || 'unspecified')}</p><ul>${item.report.findings.slice(0, 50).map(f => `<li id="triage-finding-${encodeURIComponent(f.id)}">${esc(f.severity)} · <a href="${esc(fileUrl(item, f.path, f.line))}" target="_blank" rel="noopener noreferrer">${esc(f.path)}:${f.line}</a> · ${esc(f.message)}</li>`).join('')}</ul>${item.report.findings.length > 50 ? '<p>Showing the first 50 findings. Open Review or export JSON for all findings.</p>' : ''}` : '<p>Review unavailable. See coverage.</p>'}</section>
    <section id="triage-coverage"><h3>Coverage and missing signals</h3>${list([...item.missingSignals, ...item.limitations, ...(item.report?.coverage.limitations || [])])}<p class="review-small">No repository code or tests were executed. A lack of findings does not establish safety. Human approval candidates still require branch-policy checks and a human decision.</p></section>
    ${explanation ? `<section class="triage-ai"><h3>AI explanation · ${esc(explanation.status)}</h3><p>${esc(explanation.summary)}</p>${explanation.claims.map(c => `<p>${esc(c.text)} <small>[${c.evidenceIds.map(id => `<a href="#${observationAnchor(id)}">${esc(id)}</a>`).join(', ')}]</small></p>`).join('')}<details><summary>Supplied evidence and limitations</summary><pre>${esc(JSON.stringify(explanation.claims.map(c => ({ evidenceIds: c.evidenceIds })), null, 2))}</pre>${list(explanation.limitations)}</details><p class="review-small">${explanation.usage.requests} request · ${explanation.usage.contextBytes} context bytes · ${explanation.usage.durationMs} ms · tokens ${explanation.usage.inputTokens ?? '?'} in / ${explanation.usage.outputTokens ?? '?'} out. Model inference; cited observations do not prove correctness.</p></section>` : ''}`;
}
export function renderTriage(container: HTMLElement, context: { scanId: string | null; scan: { root: string } }) {
  stopTriage(); const generation = version, data = workspace(context.scan.root), p = data.preferences;
  container.innerHTML = `<div class="review-shell triage-shell"><header class="review-heading"><div><div class="workbench-eyebrow">PR TRIAGE</div><h1>Know what needs attention.</h1><p>Inspect real pull requests. Follow the evidence behind each priority.</p></div><span class="review-local-badge">Read-only GitHub access</span></header>
    <form class="review-controls triage-controls" aria-label="GitHub triage settings"><label>GitHub repository<input name="repository" placeholder="owner/repository · blank uses origin" maxlength="150" value="${esc(p.repository)}" autocomplete="off"></label><label>PR state<select name="state">${['open', 'closed', 'all'].map(s => `<option>${s}</option>`).join('')}</select></label><button class="btn btn-ink" type="submit">Load PRs</button><button class="btn" type="button" data-cancel hidden>Cancel</button></form>
    <div class="triage-filters"><label>Queue<select data-view>${Object.entries(queues).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><label>Sort<select data-sort>${Object.entries(sorts).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><label>Search this page<input data-search maxlength="200" value="${esc(p.query)}" placeholder="Title, author, number or inspected path"></label></div>
    <p class="review-small">Uses GITHUB_TOKEN / GH_TOKEN or the server’s configured GitHub App. Public access works without credentials. Team members cannot use the owner’s provider credentials.</p><p role="status" aria-live="polite" data-progress></p><p class="review-error" role="alert" data-error hidden></p><div class="triage-pagination"></div><div class="triage-layout"><div class="triage-queue"></div><article class="triage-detail" aria-label="Selected pull request"></article></div></div>`;
  const form = container.querySelector<HTMLFormElement>('form')!, repo = form.elements.namedItem('repository') as HTMLInputElement, state = form.elements.namedItem('state') as HTMLSelectElement;
  const view = container.querySelector<HTMLSelectElement>('[data-view]')!, sort = container.querySelector<HTMLSelectElement>('[data-sort]')!, search = container.querySelector<HTMLInputElement>('[data-search]')!;
  const feedback = container.querySelector<HTMLElement>('[data-progress]')!, error = container.querySelector<HTMLElement>('[data-error]')!, cancel = container.querySelector<HTMLButtonElement>('[data-cancel]')!;
  state.value = p.state; view.value = p.view; sort.value = p.sort;
  const save = () => { Object.assign(p, { repository: repo.value.trim(), state: state.value, view: view.value, sort: sort.value, query: search.value }); try { localStorage.setItem(keyFor(context.scan.root), JSON.stringify(p)); } catch {} };
  const selected = () => data.page?.items.find(i => i.pull.number === data.selected);
  function draw() {
    const queue = container.querySelector<HTMLElement>('.triage-queue')!, panel = container.querySelector<HTMLElement>('.triage-detail')!, pagination = container.querySelector<HTMLElement>('.triage-pagination')!;
    const page = data.page, items = page ? filterTriage(page.items, { view: p.view, query: p.query, sort: p.sort }) : [];
    pagination.innerHTML = page ? `<button class="btn" data-page="${page.page - 1}"${page.page <= 1 ? ' disabled' : ''}>Previous</button><span>Page ${page.page} · ${items.length}/${page.items.length} visible · ${page.hasNext ? 'more PRs available' : 'last page'}</span><button class="btn" data-page="${page.page + 1}"${!page.hasNext || page.page >= 100 ? ' disabled' : ''}>Next</button><p class="review-small">Filters cover this page only. Uninspected rows have provisional priorities. Selecting a row retains the queue when you open Review.</p>` : '';
    queue.innerHTML = !page ? '<p>Load a repository’s PRs to start. Only the selected PR receives detailed analysis.</p>' : !items.length ? '<p>No pull requests match this page and filter.</p>' : items.map(i => `<button class="triage-row${data.selected === i.pull.number ? ' is-selected' : ''}" data-select="${i.pull.number}" aria-pressed="${data.selected === i.pull.number}">${badge(i)}<strong>#${i.pull.number} ${esc(i.pull.title)}</strong><span>@${esc(i.pull.author)} · ${esc(i.pull.state)} · CI ${esc(i.checks.state)}</span><small>${esc(i.readiness)} · ${i.inspected ? 'inspected' : 'metadata only'} · ${esc(i.pull.updatedAt)}</small></button>`).join('');
    const item = selected(), explanation = item && data.explanation?.repository === item.pull.repository && data.explanation.number === item.pull.number && data.explanation.head === item.pull.head ? data.explanation : null;
    panel.innerHTML = item ? detail(item, explanation) : '<p>Select a PR to inspect its evidence and readiness.</p>';
    queue.querySelectorAll<HTMLButtonElement>('[data-select]').forEach(b => b.onclick = () => { active?.abort(); data.selected = Number(b.dataset.select); data.explanation = null; draw(); container.querySelector<HTMLButtonElement>('[data-inspect]')?.focus(); });
    pagination.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(b => b.onclick = () => { void load(Number(b.dataset.page)); });
    panel.querySelector<HTMLButtonElement>('[data-inspect]')?.addEventListener('click', () => { void inspect(false); });
    panel.querySelector<HTMLButtonElement>('[data-explain]')?.addEventListener('click', () => { void inspect(true); });
    panel.querySelector<HTMLButtonElement>('[data-save-urgency]')?.addEventListener('click', () => { void inspect(false, true); });
    panel.querySelector<HTMLButtonElement>('[data-open-review]')?.addEventListener('click', () => { if (item?.report) window.dispatchEvent(new CustomEvent('triage-review', { detail: { report: item.report } })); });
    panel.querySelectorAll<HTMLButtonElement>('[data-patch]').forEach(b => b.onclick = () => { if (item?.report) showReviewPatch(item.report, b.dataset.patch!); });
    panel.querySelector<HTMLButtonElement>('[data-export]')?.addEventListener('click', () => {
      if (!item) return; const url = URL.createObjectURL(new Blob([JSON.stringify({ item, explanation: data.explanation }, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'onboarder-triage-' + item.pull.number + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function perform(body: Record<string, unknown>, message: string, accept: (value: any) => void) {
    active?.abort(); const abort = new AbortController(); active = abort; error.hidden = true; cancel.hidden = false; feedback.textContent = message;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(125000)]);
    try {
      const value = await request({ ...body, ...(context.scanId ? { scanId: context.scanId } : {}) }, signal);
      if (version !== generation || active !== abort || signal.aborted) return; accept(value); draw(); feedback.textContent = 'Loaded observations. Review coverage and freshness before acting.';
    } catch (e) {
      if (version !== generation || active !== abort) return;
      feedback.textContent = ''; error.textContent = abort.signal.aborted ? 'Triage cancelled. Previous observations remain captured at their reported revisions.' : signal.aborted ? 'Triage timed out. Previous observations remain available.' : (e as Error).message; error.hidden = false;
    } finally { if (active === abort) { active = null; cancel.hidden = true; } }
  }
  async function load(page = 1) { save(); await perform({ action: 'list', repository: p.repository || undefined, state: p.state, page, limit: 10 }, 'Retrieving a bounded GitHub PR page…', value => { data.page = value; data.selected = null; data.explanation = null; }); }
  async function inspect(ai: boolean, urgency = false) {
    const item = selected(); if (!item || !data.page) return;
    if (ai && !isConfigured()) { error.textContent = 'Configure your AI connection in Settings first. Deterministic inspection remains available.'; error.hidden = false; return; }
    const settings = getSettings(false), provider = settings.connection === 'hermes' ? { connection: 'hermes' } : { connection: 'api', baseUrl: settings.baseUrl, model: settings.model, apiKey: settings.apiKey };
    const priority = container.querySelector<HTMLSelectElement>('[data-urgency]')?.value;
    const reason = container.querySelector<HTMLInputElement>('[data-urgency-reason]')?.value;
    if (urgency && priority && !reason?.trim()) { error.textContent = 'Give a reason for this exact-head urgency.'; error.hidden = false; return; }
    const humanUrgency = urgency ? priority ? { priority, head: item.pull.head, reason } : undefined : item.humanUrgency;
    await perform({ action: ai ? 'explain' : 'inspect', repository: data.page.repository, number: item.pull.number, ...(humanUrgency ? { humanUrgency } : {}), ...(ai ? { provider } : {}) }, ai ? 'Refreshing observations and requesting the optional model explanation…' : 'Reading exact-revision review, checks, ownership and available architecture…', value => {
      const result = ai ? value.item : value; data.page!.items = data.page!.items.map(i => i.pull.number === result.pull.number ? result : i); data.explanation = ai ? value.explanation : null;
    });
  }
  form.onsubmit = e => { e.preventDefault(); void load(); };
  cancel.onclick = () => active?.abort();
  view.onchange = sort.onchange = () => { save(); draw(); }; search.oninput = () => { save(); draw(); };
  draw();
}
