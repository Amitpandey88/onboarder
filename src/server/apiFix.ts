import type { ServerResponse } from 'node:http';
import { getSession } from './sessions.js';
import { sendJSON, sendError } from './http.js';
import { runAgent } from '../cli/agent/runner.js';
import { workspaceFor } from './intelligence/workspace.js';
import { runReview } from './review.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function handleFix(res: ServerResponse, body: unknown, execute = runAgent) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(res, 400, 'Provide a fix request.');
  const b = body as Record<string, unknown>;
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
