import { escapeHtml as esc } from './html.js';
import { getSettings, isConfigured } from './llm.js';
import { eventElement } from './dom.js';
let stopPanel = null;
let fallbackToken = '';
function freshToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
function ownerToken() {
    try {
        const key = 'onboarder.fix.session';
        let token = sessionStorage.getItem(key);
        if (!token) {
            token = freshToken();
            sessionStorage.setItem(key, token);
        }
        return token;
    }
    catch {
        return fallbackToken ||= freshToken();
    }
}
export function stopFixPanel() { stopPanel?.(); }
export function showFixPanel(scanId, report, findingId, limits) {
    stopFixPanel();
    const origin = document.activeElement, token = ownerToken();
    const dialog = document.createElement('dialog');
    dialog.className = 'review-patch-dialog review-fix-dialog';
    dialog.setAttribute('aria-label', 'Fix proposal and verification');
    const finding = report?.findings.find(f => f.id === findingId);
    let proposal = null, run = null, busy = false, message = '', errorText = false, active = null;
    let trust = false, aiReview = false, selected = new Set(), selectedFile = '', monaco = null, models = [];
    let timer = null;
    const lifetime = new AbortController();
    const disposeEditor = () => { monaco?.dispose(); monaco = null; models.forEach(m => m.dispose()); models = []; };
    const close = () => { active?.abort(); lifetime.abort(); if (timer)
        clearInterval(timer); disposeEditor(); dialog.close(); dialog.remove(); stopPanel = null; if (origin instanceof HTMLElement)
        origin.focus(); };
    stopPanel = close;
    async function request(action, data = {}, signal = active?.signal) {
        const response = await fetch('/api/intelligence/fix', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scanId, ownerToken: token, action, ...data }) });
        const value = await response.json();
        if (!response.ok)
            throw new Error(value.error || 'Fix request failed.');
        return value;
    }
    const paragraphs = (label, items) => `<h3>${label}</h3>${items.length ? '<ul>' + items.map(s => `<li>${esc(s)}</li>`).join('') + '</ul>' : '<p>None stated by the model.</p>'}`;
    function draw() {
        const focused = document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement) ? document.activeElement.closest('button')?.dataset : undefined;
        const scrollTop = dialog.scrollTop;
        disposeEditor();
        dialog.setAttribute('aria-busy', String(busy));
        const status = run?.status || proposal?.status || 'not proposed';
        const pending = proposal?.status === 'proposed' && !run;
        const checkable = run && ['applied', 'inconclusive', 'verification-failed', 'verified-by-checks', 'checks-pending'].includes(run.status);
        const file = proposal?.edits.find(e => e.path === selectedFile) || proposal?.edits[0];
        if (file)
            selectedFile = file.path;
        dialog.innerHTML = `<header><div><h2>Fix & verification</h2><p class="fix-state" data-state="${esc(status)}">${esc(status)}</p></div><button class="btn" data-fix="close">Close</button></header>
      <div class="review-fix-body"><div class="${errorText ? 'review-error' : 'review-feedback'}" role="${errorText ? 'alert' : 'status'}" aria-live="${errorText ? 'assertive' : 'polite'}">${esc(message || run?.message || 'Explain the finding, then request a read-only proposal. Applying and running checks are separate actions.')}</div>
      ${finding ? `<section><h3>${esc(finding.title || finding.message)}</h3><p>${esc(finding.path)}:${finding.line} · ${esc(finding.severity)} · ${finding.source === 'ai' ? 'model inference' : 'static pattern'}</p><p>${esc(finding.message)}</p><p><strong>Suggested remediation:</strong> ${esc(finding.suggestion)}</p></section>` : ''}
      ${!proposal && !run ? `<p>A proposal sends bounded, redacted source to the configured connection. No repository files change.</p><button class="btn btn-ink" data-fix="propose"${busy || !finding || !isConfigured() ? ' disabled' : ''}>Generate proposed fix</button>${!isConfigured() ? '<p>Configure an optional AI connection to generate proposals.</p>' : ''}` : ''}
      <details${!finding ? ' open' : ''}><summary>Resume a saved proposal or run</summary><label>Identifier<input class="text-input" name="savedId" spellcheck="false" maxlength="36"></label><label>Record<select name="savedKind"><option value="show">Proposal</option><option value="status">Run</option></select></label><button class="btn" data-fix="resume"${busy ? ' disabled' : ''}>Load saved record</button><p>Use the same browser session and repository. Saved run IDs also appear below.</p></details>
      ${proposal ? `<section><h3>Proposal ${esc(proposal.id)}</h3><p>Revision <code>${esc(proposal.revision)}</code></p><p class="review-small fix-hash">Source SHA-256: ${esc(proposal.sourceFingerprint)}</p><p>Estimated risk: <strong>${esc(proposal.risk)}</strong>${proposal.investigationRequired ? ' · further human investigation required' : ''}</p><p>${esc(proposal.rationale)}</p>
      ${paragraphs('Affected dependencies', proposal.affectedDependencies)}${paragraphs('Potential breaking changes', proposal.breakingChanges)}${paragraphs('Potential side effects', proposal.sideEffects)}${paragraphs('Recommended tests (not executed)', proposal.tests)}
      <nav class="fix-file-nav" aria-label="Proposed changed files">${proposal.edits.map(e => `<button class="btn" data-file="${esc(e.path)}" aria-pressed="${e.path === selectedFile}">${esc(e.path)}</button>`).join('')}</nav>
      ${file ? `<h3>${esc(file.path)} · before / after</h3><div class="fix-monaco" hidden></div><div class="fix-source-pair"><section><h4>Before</h4><pre>${esc(file.before)}</pre></section><section><h4>Proposed</h4><pre>${esc(file.after)}</pre></section></div>` : ''}
      <details open><summary>Complete unified patch</summary><pre class="fix-patch">${esc(proposal.patch)}</pre></details>
      <p class="review-small fix-hash">Approval digest: ${esc(proposal.digest)}</p>${proposal.limitations.map(l => `<p class="review-small">${esc(l)}</p>`).join('')}
      ${pending ? `<p>Approve only after inspecting every changed file. Approval binds this exact patch, source revision and browser session. Changes will remain in a separate worktree.</p><div class="fix-actions"><button class="btn btn-ink" data-fix="apply"${busy || proposal.investigationRequired ? ' disabled' : ''}>Approve exact patch & apply in worktree</button><button class="btn" data-fix="reject"${busy ? ' disabled' : ''}>Reject proposal</button></div>` : ''}</section>` : ''}
      ${run ? `<section><h3>Run ${esc(run.id)}</h3><p>Workspace <code>${esc(run.workspace || 'not created')}</code></p><p>Checkpoint: <code>${esc(run.checkpointId || 'not created')}</code></p><p class="review-small fix-hash">Result fingerprint: ${esc(run.resultFingerprint || 'unavailable')}</p><details open><summary>Actual applied diff</summary><pre class="fix-patch">${esc(run.actualDiff || 'No file edits recorded.')}</pre></details>
      ${run.checkPlan ? `<h3>Authorized check allowlist</h3><p>${esc(run.checkPlan.notice)}</p><div class="fix-checks">${run.checkPlan.checks.map(c => `<label><input type="checkbox" data-check="${esc(c.id)}"${selected.has(c.id) ? ' checked' : ''}${busy ? ' disabled' : ''}> ${esc(c.id)}<pre>${esc(c.command + ' ' + c.args.join(' '))}${c.script ? '\nScript: ' + esc(c.script) : ''}</pre></label>`).join('') || '<p>No supported checks found. Verification will remain inconclusive.</p>'}</div><label><input type="checkbox" name="trust"${trust ? ' checked' : ''}${busy ? ' disabled' : ''}> I authorize these selected commands and trust this repository in the current execution environment. A worktree does not sandbox code.</label><label><input type="checkbox" name="aiReview"${aiReview ? ' checked' : ''}${busy || !isConfigured() ? ' disabled' : ''}> Also send bounded context for an optional AI re-review</label>` : ''}
      ${checkable ? `<div class="fix-actions"><button class="btn" data-fix="static"${busy ? ' disabled' : ''}>Re-review without executing checks</button><button class="btn btn-ink" data-fix="verify"${busy || !trust || !selected.size ? ' disabled' : ''}>Run selected checks & re-review</button></div>` : ''}
      <h3>Check results</h3>${run.checks.length ? run.checks.map(c => `<details><summary>${esc(c.phase)} · ${esc(c.id)} · <strong>${esc(c.status)}</strong> · ${c.durationMs}ms</summary><pre>${esc(c.output)}</pre><p class="review-small fix-hash">Source before: ${esc(c.sourceBefore)}<br>Source after: ${esc(c.sourceAfter || 'unavailable')}</p></details>`).join('') : '<p>No checks executed.</p>'}
      ${run.comparison ? `<h3>Fresh review comparison</h3><p>${run.comparison.noLongerDetected.length} static findings no longer detected · ${run.comparison.unresolved.length} unresolved · ${run.comparison.introduced.length} new findings</p><p>${esc(run.comparison.explanation)}</p>${['noLongerDetected', 'unresolved', 'introduced'].map(key => `<details><summary>${esc(key)}</summary>${run.comparison[key].map(f => `<p>${esc(f.severity)} · ${esc(f.path)}:${f.line} · ${esc(f.message)}</p>`).join('') || '<p>None reported.</p>'}</details>`).join('')}<p>Architecture check: ${esc(run.comparison.architecture.status)} · ${run.comparison.architecture.introduced.length} new boundary findings</p>${run.comparison.after.ai ? `<p>Optional AI re-review: ${esc(run.comparison.after.ai.status)} · ${esc(run.comparison.after.ai.message)}</p>` : ''}` : ''}
      <h3>Agent activity and receipts</h3><pre data-activity aria-live="polite">${esc(run.activity.map(a => a.at + ' ' + a.event).join('\n'))}</pre><details><summary>Checkpoint restoration history</summary>${run.restoration.map(r => `<p>${esc(r.at)} · ${esc(r.status)} · ${esc(r.message)} · ${r.restored.map(esc).join(', ')}</p>`).join('') || '<p>No rollback attempted.</p>'}</details>
      <div class="fix-actions">${run.checkpointId && !['accepted', 'rolled-back'].includes(run.status) ? `<button class="btn" data-fix="rollback"${busy ? ' disabled' : ''}>Rollback to checkpoint</button>` : ''}${run.status === 'verified-by-checks' ? `<button class="btn btn-ink" data-fix="accept"${busy ? ' disabled' : ''}>Accept checked result</button>` : ''}<button class="btn" data-fix="refresh"${busy ? ' disabled' : ''}>Refresh saved status</button><button class="btn" data-fix="export">Export fix record</button></div></section>` : ''}
      <button class="btn" data-fix="cancel"${busy ? '' : ' hidden'}>Cancel active operation</button><p class="review-small">Final acceptance records your decision. Nothing commits, merges, pushes, deploys or copies code into the original checkout.</p></div>`;
        if (file && window.monaco?.editor?.createDiffEditor) {
            try {
                const api = window.monaco, host = dialog.querySelector('.fix-monaco');
                host.hidden = false;
                monaco = api.editor.createDiffEditor(host, { readOnly: true, automaticLayout: true, minimap: { enabled: false }, renderSideBySide: window.innerWidth > 700 });
                models = [api.editor.createModel(file.before), api.editor.createModel(file.after)];
                monaco.setModel({ original: models[0], modified: models[1] });
                dialog.querySelector('.fix-source-pair').hidden = true;
            }
            catch {
                disposeEditor();
            }
        }
        dialog.scrollTop = scrollTop;
        const focusTarget = focused?.file ? dialog.querySelector(`[data-file="${CSS.escape(focused.file)}"]`) : focused?.fix ? dialog.querySelector(`[data-fix="${CSS.escape(focused.fix)}"]`) : null;
        if (focusTarget && !focusTarget.disabled && !focusTarget.hidden)
            focusTarget.focus({ preventScroll: true });
        else if (busy)
            dialog.querySelector('[data-fix="cancel"]')?.focus({ preventScroll: true });
    }
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.onchange = event => {
        const target = event.target;
        if (target.dataset.check) {
            if (target.checked)
                selected.add(target.dataset.check);
            else
                selected.delete(target.dataset.check);
        }
        if (target.name === 'trust')
            trust = target.checked;
        if (target.name === 'aiReview')
            aiReview = target.checked;
        const button = dialog.querySelector('[data-fix="verify"]');
        if (button)
            button.disabled = busy || !trust || !selected.size || selected.size > 5;
    };
    dialog.onclick = async (event) => {
        const target = eventElement(event), button = target?.closest('button');
        if (!button)
            return;
        if (button.dataset.file) {
            selectedFile = button.dataset.file;
            draw();
            return;
        }
        const action = button.dataset.fix;
        if (action === 'close') {
            close();
            return;
        }
        if (action === 'cancel') {
            active?.abort();
            return;
        }
        if (busy || !action)
            return;
        if (action === 'export') {
            const url = URL.createObjectURL(new Blob([JSON.stringify({ proposal, run }, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'onboarder-fix-' + run.id + '.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
        }
        const resumeId = dialog.querySelector('[name="savedId"]').value;
        const resumeKind = dialog.querySelector('[name="savedKind"]').value;
        active = new AbortController();
        busy = true;
        errorText = false;
        message = action === 'propose' ? 'Generating a read-only proposal…' : 'Saving operation and inspecting the isolated worktree…';
        draw();
        if (run && ['verify', 'static'].includes(action))
            timer = setInterval(() => {
                void request('status', { runId: run.id, compact: true }, lifetime.signal).then(value => {
                    const output = dialog.querySelector('[data-activity]');
                    if (output)
                        output.textContent = value.run.activity.map(a => a.at + ' ' + a.event).join('\n');
                }).catch(() => { });
            }, 2000);
        try {
            let value;
            switch (action) {
                case 'propose':
                    value = await request('propose', { ai: true, report, findingId, provider: getSettings(false), limits });
                    break;
                case 'resume':
                    value = await request(resumeKind, resumeKind === 'show' ? { proposalId: resumeId } : { runId: resumeId });
                    break;
                case 'apply':
                case 'reject':
                    value = await request(action, { proposalId: proposal.id, approvalDigest: proposal.digest });
                    break;
                case 'verify':
                case 'static':
                    value = await request('verify', { runId: run.id, allowChecks: action === 'verify', trustWorktree: action === 'verify' && trust,
                        checks: action === 'verify' ? [...selected] : [], checkDigest: run.checkPlan?.digest, ai: aiReview, ...(aiReview ? { provider: getSettings(false), limits } : {}) });
                    break;
                case 'rollback':
                case 'accept':
                case 'refresh':
                    value = await request(action === 'refresh' ? 'status' : action, { runId: run.id, sourceFingerprint: run.resultFingerprint });
                    break;
            }
            if (value?.proposal) {
                proposal = value.proposal;
                if (action === 'resume')
                    run = null;
            }
            if (value?.run) {
                run = value.run;
                proposal = (await request('show', { proposalId: run.proposalId })).proposal;
            }
            message = run?.message || (proposal ? 'Proposal ' + proposal.status + '. Inspect the complete patch and rationale.' : 'Record loaded.');
        }
        catch (e) {
            errorText = !active.signal.aborted;
            message = active.signal.aborted ? 'Operation cancelled. Saved run receipts remain available. Refresh or resume before taking another action.' : e.message;
            if (proposal && action === 'apply') {
                try {
                    proposal = (await request('show', { proposalId: proposal.id }, lifetime.signal)).proposal;
                    if (proposal.runId)
                        run = (await request('status', { runId: proposal.runId }, lifetime.signal)).run;
                }
                catch { /* Resume exposes persisted recovery records. */ }
            }
        }
        finally {
            if (timer)
                clearInterval(timer);
            timer = null;
            busy = false;
            active = null;
            if (!lifetime.signal.aborted)
                draw();
        }
    };
    draw();
    document.body.append(dialog);
    dialog.showModal();
}
//# sourceMappingURL=reviewFix.js.map