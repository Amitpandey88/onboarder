import type { ServerResponse } from 'node:http';
import { getSession } from './sessions.js';
import { sendJSON, sendError } from './http.js';
import { runAgent } from '../cli/agent/runner.js';
import { workspaceFor } from './intelligence/workspace.js';
import { runReview } from './review.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hash } from './intelligence/workspace.js';
import { proposeFix } from './fixProposal.js';
import { showFixProposal, applyFix, verifyFix, rejectFix, rollbackFix, acceptFix, fixStatus } from './fixEngine.js';
import { FixStore } from './fixStore.js';
import { reviewLimits } from './reviewContext.js';
import type { AIReviewOptions, ReviewProvider } from './reviewAI.js';
import type { ReviewReport } from '../shared/review/contracts.js';

export async function handleFix(res: ServerResponse, body: unknown, execute = runAgent, integrations: { owner?: string; store?: FixStore; complete?: AIReviewOptions['complete'] } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(res, 400, 'Provide a fix request.');
  const b = body as Record<string, unknown>;
  if (b.action !== undefined) return handleFindingFix(res, b, integrations);
  if (typeof b.scanId !== 'string' || typeof b.task !== 'string' || !b.task.trim() || b.task.length > 4000 || b.allowChecks !== undefined && typeof b.allowChecks !== 'boolean') return sendError(res, 400, 'Choose a repository and describe the fix in under 4,000 characters.');
  const session = getSession(b.scanId);
  if (!session) return sendError(res, 404, 'Repository session expired.');
  const abort = new AbortController();
  const close = () => { if (!res.writableEnded) abort.abort(); };
  res.once('close', close);
  try {
    const result = await execute({ mode: 'implement', root: session.root, task: b.task,
      allowChecks: b.allowChecks === true, allowGithubWrites: false, timeoutSeconds: 180, maxTurns: 16 }, { signal: abort.signal });
    if (abort.signal.aborted) return;
    if ('dryRun' in result) return sendError(res, 500, 'Implementation did not execute.');
    const workspace = await workspaceFor(result.workspace);
    const analysis = await workspace.refresh({ signal: abort.signal });
    const review = await runReview(result.workspace, { mode: 'working', base: 'HEAD', signal: abort.signal });
    const receiptsFile = path.join(path.dirname(result.auditFile), 'checks.jsonl');
    let checks: unknown[] = [];
    const receiptStat = await fs.lstat(receiptsFile).catch(() => null);
    if (receiptStat?.isFile() && !receiptStat.isSymbolicLink() && receiptStat.size <= 256000) checks = (await fs.readFile(receiptsFile, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    sendJSON(res, 200, { run: result, review, checks, snapshot: analysis.snapshot,
      verification: 'The run status describes agent completion. Review and analysis inspect the resulting source; executed checks are recorded separately in the run audit and check receipts.' });
  } catch (error) { if (!abort.signal.aborted) sendError(res, 400, error instanceof Error ? error.message : 'Fix failed.'); }
  finally { res.off('close', close); }
}

/** Same owner-only endpoint as the existing implementation harness; never accepts a root override. */
async function handleFindingFix(res: ServerResponse, b: Record<string, unknown>, integrations: { owner?: string; store?: FixStore; complete?: AIReviewOptions['complete'] }) {
  if (typeof b.scanId !== 'string' || typeof b.ownerToken !== 'string' || !/^[a-f\d-]{36}$/.test(b.ownerToken)) return sendError(res, 400, 'A repository and browser fix session are required.');
  const session = getSession(b.scanId); if (!session) return sendError(res, 404, 'Repository session expired. Scan again to resume.');
  const abort = new AbortController(), close = () => { if (!res.writableEnded) abort.abort(); }; res.once('close', close);
  const identity = { root: session.root, owner: hash((integrations.owner || 'local-owner') + ':' + b.ownerToken), store: integrations.store };
  try {
    for (const field of ['allowChecks', 'trustWorktree', 'ai']) if (b[field] !== undefined && typeof b[field] !== 'boolean') throw new Error('Execution and AI permissions must be explicit booleans.');
    let provider: ReviewProvider | undefined;
    if (b.action === 'propose' || b.ai === true) {
      if (b.ai !== true) throw new Error('Proposal generation requires explicit AI opt-in.');
      const p = b.provider as Record<string, unknown> | undefined;
      if (p) {
        if (typeof p !== 'object' || Array.isArray(p) || p.connection !== undefined && !['api', 'hermes'].includes(p.connection as string)) throw new Error('Choose a configured API or Hermes connection.');
        for (const key of ['baseUrl', 'model', 'apiKey']) if (p[key] !== undefined && (typeof p[key] !== 'string' || (p[key] as string).length > 4096)) throw new Error('Invalid provider settings.');
        provider = { connection: p.connection as 'api' | 'hermes', baseUrl: p.baseUrl as string, model: p.model as string, apiKey: p.apiKey as string };
      }
    }
    const options: AIReviewOptions = { provider, limits: reviewLimits(b.limits), signal: abort.signal, complete: integrations.complete };
    let result;
    switch (b.action) {
      case 'propose':
        if (typeof b.findingId !== 'string' || b.findingId.length > 1000) throw new Error('Choose a finding identifier.');
        result = { proposal: await proposeFix(session.root, identity.owner, b.report as ReviewReport, b.findingId, { ...options, store: integrations.store }) }; break;
      case 'show': result = { proposal: await showFixProposal(identity, b.proposalId as string) }; break;
      case 'apply': result = { run: await applyFix(identity, b.proposalId as string, b.approvalDigest as string, abort.signal) }; break;
      case 'reject': result = { proposal: await rejectFix(identity, b.proposalId as string, b.approvalDigest as string) }; break;
      case 'status': { const run = await fixStatus(identity, b.runId as string); result = { run: b.compact === true ? { id: run.id, status: run.status, activity: run.activity.slice(-12) } : run }; break; }
      case 'verify': result = { run: await verifyFix(identity, b.runId as string, { allowChecks: b.allowChecks === true, trustWorktree: b.trustWorktree === true,
        checkDigest: b.checkDigest as string, checks: b.checks as string[], ai: b.ai === true ? options : undefined }, abort.signal) }; break;
      case 'rollback': result = { run: await rollbackFix(identity, b.runId as string) }; break;
      case 'accept': result = { run: await acceptFix(identity, b.runId as string, b.sourceFingerprint as string) }; break;
      default: throw new Error('Choose propose, show, apply, reject, status, verify, rollback or accept.');
    }
    if (!abort.signal.aborted) sendJSON(res, 200, result);
  } catch (e) { if (!abort.signal.aborted) sendError(res, 400, (e as Error).message); }
  finally { res.off('close', close); }
}
