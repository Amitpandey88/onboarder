import type { ServerResponse } from 'node:http';
import { getSession } from './sessions.js';
import { sendError, sendJSON } from './http.js';
import { GitDiffError } from './gitDiff.js';
import { runReview } from './review.js';
import { reviewProfile } from '../shared/review/review.js';
import type { ReviewMode, ReviewProfile } from '../shared/review/contracts.js';

export async function handleReview(res: ServerResponse, body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(res, 400, 'Provide a review request object.');
  const b = body as Record<string, unknown>;
  if (typeof b.scanId !== 'string') return sendError(res, 400, 'Choose a scanned repository.');
  const session = getSession(b.scanId);
  if (!session) return sendError(res, 404, 'Scan session expired. Scan this repository again.');
  if (b.mode !== undefined && !['working', 'staged', 'range'].includes(b.mode as string)) return sendError(res, 400, 'Choose working, staged, or range review.');
  for (const key of ['base', 'head']) if (b[key] !== undefined && (typeof b[key] !== 'string' || (b[key] as string).length > 200)) return sendError(res, 400, 'References must be strings of at most 200 characters.');
  let profile: ReviewProfile | undefined;
  try { if (b.profile !== undefined) profile = reviewProfile(b.profile); }
  catch (error) { return sendError(res, 400, (error as Error).message); }
  const abort = new AbortController();
  const close = () => { if (!res.writableEnded) abort.abort(); };
  res.once('close', close);
  try {
    const report = await runReview(session.root, { base: b.base as string || 'HEAD', head: b.head as string || '', mode: b.mode as ReviewMode || 'working', profile, signal: abort.signal });
    if (!abort.signal.aborted) sendJSON(res, 200, report);
  } catch (error) {
    if (!abort.signal.aborted) sendError(res, error instanceof GitDiffError ? error.status : 500, error instanceof Error ? error.message : 'Review failed.');
  } finally { res.off('close', close); }
}
