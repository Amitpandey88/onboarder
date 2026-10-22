import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FixRun, FixProposal, FixComparison } from '../shared/review/fixContracts.js';
import type { ReviewFinding } from '../shared/review/contracts.js';
import type { RunManifest } from '../cli/agent/contracts.js';
import type { AIReviewOptions } from './reviewAI.js';
import { applyAIReview } from './reviewAI.js';
import { FixStore } from './fixStore.js';
import { proposalDigest, type SavedProposal, fullFilePatch } from './fixProposal.js';
import { canonicalFixRoot, captureFixSource, privateText } from './fixSource.js';
import { createImplementationWorkspace } from '../cli/agent/workspace.js';
import { runtimePaths } from '../cli/agent/config.js';
import { readAgentFile, writeAgentFile, deleteAgentFile } from '../cli/agent/files.js';
import { createCheckpoint, restoreCheckpoint } from '../cli/agent/checkpoints.js';
import { executeFixCheck, fixCheckPlan } from '../cli/agent/checks.js';
import { runReview } from './review.js';
import { workspaceFor } from './intelligence/workspace.js';
import { runProcess } from '../cli/agent/process.js';
import { safeGitArguments } from '../cli/agent/gitSafety.js';

interface SavedFixRun { owner: string; root: string; run: FixRun; manifest: RunManifest; baselineManifest?: RunManifest }
export interface FixIdentity { root: string; owner: string; store?: FixStore }
const event = (run: FixRun, message: string) => { run.activity.push({ at: new Date().toISOString(), event: message }); };
async function authorize<T extends { root: string; owner: string }>(record: T, identity: FixIdentity) {
  if (record.owner !== identity.owner || record.root !== await canonicalFixRoot(identity.root)) throw new Error('Fix authorization belongs to another session or workspace.');
  return record;
}
async function proposalRecord(identity: FixIdentity, id: string) {
  const record = await authorize(await (identity.store || new FixStore()).read<SavedProposal>('proposal', id), identity);
  if (record.proposal.digest !== proposalDigest(record.proposal)) throw new Error('Proposal was altered; approval is invalid.');
  return record;
}
export async function showFixProposal(identity: FixIdentity, id: string): Promise<FixProposal> { return (await proposalRecord(identity, id)).proposal; }
async function runRecord(identity: FixIdentity, id: string) {
  const record = await authorize(await (identity.store || new FixStore()).read<SavedFixRun>('run', id), identity);
  if (record.run.workspace) {
    const expected = path.join(runtimePaths((identity.store || new FixStore()).home).workspaces, record.manifest.id);
    if (record.manifest.root !== expected || await fs.realpath(record.manifest.root) !== expected || record.manifest.root === record.root) throw new Error('Saved worktree identity changed.');
  }
  return record;
}
export async function fixStatus(identity: FixIdentity, id: string) {
  const run = (await runRecord(identity, id)).run;
  if (run.resultFingerprint && ['applied', 'verified-by-checks', 'accepted'].includes(run.status)) {
    const current = await captureFixSource(run.workspace, { mode: 'working' }).catch(() => null);
    if (current?.fingerprint !== run.resultFingerprint) return { ...run, status: 'stale' as const, message: 'Worktree source no longer matches the captured result. Previous receipts apply only to their recorded source fingerprint.' };
  }
  return run;
}
async function persist(store: FixStore, record: SavedFixRun) {
  await store.write('run', record.run.id, record);
  await fs.writeFile(path.join(path.dirname(record.manifest.auditFile), 'manifest.json'), JSON.stringify(record.manifest, null, 2) + '\n', { mode: 0o600 });
  await fs.appendFile(record.manifest.auditFile, JSON.stringify({ at: new Date().toISOString(), fix: record.run.proposalId, status: record.run.status,
    event: record.run.activity.at(-1)?.event, sourceFingerprint: record.run.resultFingerprint }) + '\n', { mode: 0o600 });
}
async function newManifest(record: SavedProposal, store: FixStore, id: string, signal?: AbortSignal, onCreated?: (manifest: RunManifest) => Promise<void>) {
  const dir = path.join(runtimePaths(store.home).runs, id); await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const manifest: RunManifest = { schemaVersion: 1, id, mode: 'implement', root: record.root, sourceRoot: record.root, repository: null, remote: null, branch: null, baseBranch: null,
    task: 'Apply exact approved finding-linked patch', permissions: { files: true, checks: false, github: false }, startedAt: new Date().toISOString(), timeoutSeconds: 300, maxTurns: 1,
    auditFile: path.join(dir, 'audit.jsonl'), fix: { proposalId: record.proposal.id, proposalDigest: record.proposal.digest, findingId: record.proposal.finding.id,
      sourceRevision: record.proposal.revision, allowedPaths: record.proposal.edits.map(e => e.path), role: id === record.approval?.runId ? 'application' : 'baseline' } };
  await createImplementationWorkspace(manifest, store.home, record.proposal.revision, signal);
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  await onCreated?.(manifest);
  for (const entry of record.overlay) {
    signal?.throwIfAborted(); let before;
    try { before = await readAgentFile(manifest.root, entry.path); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (entry.content === null) { if (before) await deleteAgentFile(manifest.root, entry.path, before.sha256); }
    else {
      await writeAgentFile(manifest.root, entry.path, entry.content, before?.sha256 || 'new');
      if (entry.executable !== undefined && process.platform !== 'win32') await fs.chmod(path.join(manifest.root, entry.path), entry.executable ? 0o755 : 0o644);
    }
  }
  return manifest;
}
export async function rejectFix(identity: FixIdentity, id: string, digest: string) {
  const store = identity.store || new FixStore();
  return store.lock(id, async () => {
    const record = await proposalRecord(identity, id);
    if (record.proposal.status !== 'proposed' || record.proposal.digest !== digest) throw new Error('Only the exact pending proposal can be rejected.');
    record.proposal.status = 'rejected'; await store.write('proposal', id, record); return record.proposal;
  });
}
/** Approval is consumed before mutation; replay never starts a second application. */
export async function applyFix(identity: FixIdentity, id: string, digest: string, signal?: AbortSignal, onProgress?: (run: FixRun) => void) {
  const store = identity.store || new FixStore();
  return store.lock(id, async () => {
    const record = await proposalRecord(identity, id), p = record.proposal;
    if (p.status !== 'proposed' || digest !== p.digest) throw new Error('Explicit approval must match the exact pending proposal digest. Already consumed approvals cannot be replayed.');
    if (p.investigationRequired) throw new Error('This proposal requires human investigation. Reject it and generate a supported proposal after investigation.');
    if (Date.parse(p.expiresAt) <= Date.now() || (await captureFixSource(record.root, record.selector, signal)).fingerprint !== p.sourceFingerprint) {
      p.status = 'stale'; await store.write('proposal', id, record); throw new Error('Proposal is stale. Generate a fresh proposal and approve its new digest.');
    }
    signal?.throwIfAborted(); const runId = randomUUID();
    record.approval = { owner: identity.owner, digest, at: new Date().toISOString(), allowedPaths: p.edits.map(e => e.path), runId };
    p.status = 'approved'; p.runId = runId; await store.write('proposal', id, record);
    return store.lock(runId, async () => {
    // Persist a recovery record before creating a worktree or mutating a file.
    const dir = path.join(runtimePaths(store.home).runs, runId); await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const fallback: RunManifest = { schemaVersion: 1, id: runId, mode: 'implement', root: record.root, sourceRoot: record.root, repository: null, remote: null, branch: null, baseBranch: null,
      task: 'Approved finding-linked fix', permissions: { files: true, checks: false, github: false }, startedAt: new Date().toISOString(), timeoutSeconds: 300, maxTurns: 1, auditFile: path.join(dir, 'audit.jsonl') };
    const run: FixRun = { schemaVersion: 1, id: runId, proposalId: id, proposalDigest: digest, workspaceId: p.workspaceId, status: 'approved', sourceRevision: p.revision,
      sourceFingerprint: p.sourceFingerprint, workspace: '', branch: '', modifiedFiles: [], actualDiff: '', checks: [], restoration: [], activity: [], message: 'Approved. Preparing isolated worktree.' };
    const saved: SavedFixRun = { owner: identity.owner, root: record.root, run, manifest: fallback }; event(run, 'Exact proposal approved'); await persist(store, saved);
    try {
      saved.manifest = await newManifest(record, store, runId, signal, async manifest => {
        saved.manifest = manifest; run.workspace = manifest.root; run.branch = manifest.branch!; event(run, 'Isolated worktree created'); await persist(store, saved);
      }); run.workspace = saved.manifest.root; run.branch = saved.manifest.branch!;
      event(run, 'Source snapshot restored in isolated worktree'); await persist(store, saved);
      if ((await captureFixSource(record.root, record.selector, signal)).fingerprint !== p.sourceFingerprint) throw new Error('Source changed after approval. No proposed edits applied.');
      for (const edit of p.edits) if ((await readAgentFile(run.workspace, edit.path)).sha256 !== edit.beforeHash) throw new Error('Isolated source does not match the approved patch.');
      const patchCheck = await runProcess('git', [...await safeGitArguments(run.workspace, signal), 'apply', '--check', '--whitespace=nowarn', '-'],
        { cwd: run.workspace, input: p.patch, timeoutMs: 15000, maxBytes: 65536, signal });
      if (patchCheck.code) throw new Error('Approved patch failed Git validity checks. No proposed edits applied.');
      event(run, 'Approved patch validity checked');
      const checkpoint = await createCheckpoint(saved.manifest, p.edits.map(e => e.path)); run.checkpointId = checkpoint.id; run.checkpointDigest = checkpoint.digest;
      event(run, 'Checkpoint created before mutation'); await persist(store, saved);
      for (const edit of p.edits) {
        signal?.throwIfAborted();
        await writeAgentFile(run.workspace, edit.path, edit.after, edit.beforeHash);
        run.modifiedFiles.push(edit.path);
        run.actualDiff += fullFilePatch(edit.path, edit.before, (await readAgentFile(run.workspace, edit.path)).content);
        event(run, 'Applied approved file: ' + edit.path); await persist(store, saved);
        onProgress?.(run);
      }
      for (const edit of p.edits) if ((await readAgentFile(run.workspace, edit.path)).sha256 !== edit.afterHash) throw new Error('Result file changed during application. Inspect checkpoint and saved run.');
      run.resultFingerprint = (await captureFixSource(run.workspace, { mode: 'working' }, signal)).fingerprint;
      run.checkPlan = await fixCheckPlan(run.workspace);
      run.comparison = await compareFix(record, saved, undefined, signal);
      run.status = 'applied'; p.status = 'applied'; run.message = 'Approved edits applied in the isolated worktree. Fresh static review recorded. Checks have not run.';
      event(run, 'Fresh deterministic review completed; awaiting check permission');
    } catch (e) {
      run.status = 'inconclusive'; run.message = privateText(signal?.aborted ? 'Application cancelled. Inspect saved files and checkpoint before rollback.' : (e as Error).message);
      event(run, 'Application stopped; recovery required');
    }
    await persist(store, saved); await store.write('proposal', id, record); return run;
    });
  });
}
const findingKey = (f: ReviewFinding) => JSON.stringify([f.path, f.rule, f.excerpt.trim()]);
async function compareFix(proposal: SavedProposal, saved: SavedFixRun, ai?: AIReviewOptions, signal?: AbortSignal): Promise<FixComparison> {
  const before = proposal.report, after = await runReview(saved.run.workspace, { mode: 'working', base: before.base, profile: before.profile, signal });
  if (ai) await applyAIReview(saved.run.workspace, after, { ...ai, mode: 'working', base: before.base, profile: before.profile, signal });
  const old = new Set(before.findings.map(findingKey)), current = new Set(after.findings.map(findingKey));
  const architecture: FixComparison['architecture'] = { before: [], after: [], introduced: [], status: 'unavailable' };
  try {
    // Immutable revision/index analysis uses the same Phase 2 context/architecture engine.
    architecture.before = proposal.architecture;
    architecture.after = (await (await workspaceFor(saved.run.workspace)).refresh({ signal })).snapshot.violations;
    const keys = new Set(architecture.before.map(v => { const r = v as any; return JSON.stringify([r.rule, r.from, r.to]); }));
    architecture.introduced = architecture.after.filter(v => { const r = v as any; return !keys.has(JSON.stringify([r.rule, r.from, r.to])); });
    architecture.status = proposal.architectureComplete ? 'completed' : 'partial';
  } catch { signal?.throwIfAborted(); }
  const modelFinding = before.findings.filter(f => f.source === 'ai' && !current.has(findingKey(f)));
  return { before, after, noLongerDetected: before.findings.filter(f => f.source !== 'ai' && !current.has(findingKey(f))),
    unresolved: [...before.findings.filter(f => current.has(findingKey(f))), ...modelFinding], introduced: after.findings.filter(f => !old.has(findingKey(f))), architecture,
    explanation: 'No longer detected means the static rule did not report the same evidence in this comparison. This does not prove the bug is fixed. Original model inferences remain unresolved by static analysis; passing selected checks proves only those checks passed.' };
}
export async function verifyFix(identity: FixIdentity, id: string, permission: { allowChecks?: boolean; trustWorktree?: boolean; checkDigest?: string; checks?: string[]; timeoutMs?: number; ai?: AIReviewOptions } = {}, signal?: AbortSignal) {
  const store = identity.store || new FixStore();
  return store.lock(id, async () => {
    const saved = await runRecord(identity, id), run = saved.run, proposal = await proposalRecord(identity, run.proposalId);
    if (!run.resultFingerprint || ['rolled-back', 'accepted', 'rejected', 'approved'].includes(run.status)) throw new Error('This run has no applied patch available for verification.');
    if (run.activity.filter(a => a.event === 'Verification started').length >= 5) throw new Error('Five verification attempts reached. Inspect this run and create a new approved proposal if needed.');
    const actual = await captureFixSource(run.workspace, { mode: 'working' }, signal);
    if (actual.fingerprint !== run.resultFingerprint) { run.status = 'stale'; run.message = 'Worktree source changed after application. Generate a new approved proposal; previous check results no longer apply.'; await persist(store, saved); return run; }
    const plan = await fixCheckPlan(run.workspace); run.checkPlan = plan;
    const selected = permission.checks || [];
    if (!Array.isArray(selected) || selected.length > 5 || new Set(selected).size !== selected.length || selected.some(c => !plan.checks.some(p => p.id === c))) throw new Error('Choose at most five checks from the displayed allowlist.');
    const execute = permission.allowChecks === true && permission.trustWorktree === true && selected.length > 0;
    if (permission.timeoutMs !== undefined && (!Number.isInteger(permission.timeoutMs) || permission.timeoutMs < 50 || permission.timeoutMs > 120000)) throw new Error('Check time limit must be 50–120000 ms.');
    if (execute && permission.checkDigest !== plan.digest) throw new Error('Check plan approval is stale or missing. Review the commands and approve the exact check-plan digest.');
    if (execute && proposal.proposal.investigationRequired) throw new Error('The proposal requires human investigation. Inspect it before generating a new actionable proposal.');
    run.status = 'checks-pending'; run.checks = []; event(run, 'Verification started'); await persist(store, saved);
    const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000);
    try {
      if (execute) {
        saved.manifest.permissions.checks = true; await persist(store, saved);
        // Execute the baseline in a separate worktree, never in the original checkout.
        saved.baselineManifest = await newManifest(proposal, store, randomUUID(), boundedSignal, async manifest => {
          saved.baselineManifest = manifest; event(run, 'Baseline worktree created: ' + manifest.root); await persist(store, saved);
        }); await persist(store, saved);
        const baseline = saved.baselineManifest; baseline.permissions.checks = true;
        const baselinePlan = await fixCheckPlan(baseline.root);
        for (const name of selected) {
          const currentCheck = plan.checks.find(c => c.id === name)!;
          const baselineCheck = baselinePlan.checks.find(c => c.id === name);
          if (!baselineCheck || JSON.stringify(baselineCheck) !== JSON.stringify(currentCheck)) throw new Error('The check definition differs from baseline. Review script changes separately before executing them.');
          boundedSignal.throwIfAborted();
          event(run, 'Running baseline check: ' + name); await persist(store, saved);
          run.checks.push(await executeFixCheck(baseline, baselineCheck, 'baseline', { signal: boundedSignal, timeoutMs: permission.timeoutMs })); await persist(store, saved);
          boundedSignal.throwIfAborted();
          if ((await captureFixSource(run.workspace, { mode: 'working' }, boundedSignal)).fingerprint !== run.resultFingerprint) throw new Error('Result source fingerprint changed before check execution.');
          event(run, 'Running result check: ' + name); await persist(store, saved);
          run.checks.push(await executeFixCheck(saved.manifest, currentCheck, 'result', { signal: boundedSignal, timeoutMs: permission.timeoutMs })); await persist(store, saved);
        }
      } else {
        for (const check of plan.checks) run.checks.push({ id: check.id, phase: 'result', status: 'skipped', code: null, output: 'Explicit check execution permission, trusted worktree acknowledgement and a selected check are required.',
          startedAt: new Date().toISOString(), durationMs: 0, sourceBefore: actual.fingerprint, sourceAfter: actual.fingerprint, sourceChanged: false, commandDigest: plan.digest });
      }
      run.comparison = await compareFix(proposal, saved, permission.ai, boundedSignal);
      const results = run.checks.filter(c => c.phase === 'result' && c.status !== 'skipped');
      const introducedHigh = run.comparison.introduced.some(f => ['critical', 'high'].includes(f.severity));
      const unresolvedTarget = run.comparison.unresolved.some(f => f.source !== 'ai' && findingKey(f) === findingKey(proposal.proposal.finding));
      const current = await captureFixSource(run.workspace, { mode: 'working' }, boundedSignal);
      if (current.fingerprint !== run.resultFingerprint || results.some(c => c.sourceBefore !== run.resultFingerprint || c.sourceChanged)) run.status = 'stale';
      else if (results.some(c => c.status !== 'passed') || introducedHigh || unresolvedTarget || run.comparison.architecture.introduced.length) run.status = 'verification-failed';
      else if (!results.length || run.checks.some(c => c.sourceChanged) || actual.unavailable.length || run.comparison.after.coverage.status === 'partial' || run.comparison.architecture.status !== 'completed' || permission.ai && !['completed', 'skipped'].includes(run.comparison.after.ai?.status || '')) run.status = 'inconclusive';
      else run.status = 'verified-by-checks';
      run.message = run.status === 'verified-by-checks' ? 'Selected checks passed against the exact captured result source. This does not prove complete correctness. Final human acceptance is pending.' :
        'Verification is ' + run.status + '. Inspect check receipts, source coverage and before/after findings. No further fix attempt was started.';
      event(run, 'Verification finished: ' + run.status);
    } catch (e) {
      run.status = 'inconclusive'; run.message = boundedSignal.aborted ? 'Verification cancelled or timed out. Saved receipts show which checks ran. Resume with a new explicit verification request.' : privateText((e as Error).message);
      event(run, 'Verification stopped; no assurance');
    } finally { saved.manifest.permissions.checks = false; if (saved.baselineManifest) saved.baselineManifest.permissions.checks = false; await persist(store, saved); }
    return run;
  });
}
export async function rollbackFix(identity: FixIdentity, id: string) {
  const store = identity.store || new FixStore();
  return store.lock(id, async () => {
    const saved = await runRecord(identity, id), run = saved.run, proposal = await proposalRecord(identity, run.proposalId);
    if (!run.checkpointId || run.status === 'rolled-back' || run.status === 'accepted') throw new Error('No rollback is available for this run.');
    const expected: Record<string, string> = {};
    for (const edit of proposal.proposal.edits) {
      const current = await readAgentFile(run.workspace, edit.path).catch(() => null);
      // Recovery also handles a crash between a successful atomic write and its receipt.
      expected[edit.path] = current?.sha256 === edit.beforeHash ? edit.beforeHash : edit.afterHash;
    }
    try {
      const result = await restoreCheckpoint(saved.manifest, run.checkpointId, expected, run.checkpointDigest);
      run.restoration.push({ at: new Date().toISOString(), restored: result.restored, status: 'completed', message: result.note });
      run.status = 'rolled-back'; run.message = 'Checkpoint restored in the isolated worktree. Checks were not rerun; rollback is not verification.';
    } catch (e) {
      run.restoration.push({ at: new Date().toISOString(), restored: (e as Error & { restored?: string[] }).restored || [], status: 'failed', message: privateText((e as Error).message) });
      run.status = 'inconclusive';
      run.message = 'Rollback refused or stopped to preserve conflicting edits. Inspect restoration records and the checkpoint. ' + privateText((e as Error).message);
    }
    event(run, 'Rollback: ' + run.restoration.at(-1)!.status); await persist(store, saved); return run;
  });
}
export async function acceptFix(identity: FixIdentity, id: string, fingerprint: string) {
  const store = identity.store || new FixStore();
  return store.lock(id, async () => {
    const saved = await runRecord(identity, id), run = saved.run;
    if (run.status !== 'verified-by-checks' || fingerprint !== run.resultFingerprint || (await captureFixSource(run.workspace, { mode: 'working' })).fingerprint !== fingerprint) throw new Error('Final acceptance requires current, successfully checked source.');
    run.status = 'accepted'; run.acceptedAt = new Date().toISOString(); run.message = 'Human acceptance recorded. Changes remain uncommitted in the isolated worktree. Transfer them manually after review.';
    event(run, 'Final human acceptance recorded'); await persist(store, saved); return run;
  });
}
