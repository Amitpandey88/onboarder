import type { ServerResponse } from 'node:http';
import { getSession } from './sessions.js';
import { sendError, sendJSON } from './http.js';
import { GitDiffError } from './gitDiff.js';
import { runReview } from './review.js';
import { reviewProfile } from '../shared/review/review.js';
import type { ReviewMode, ReviewProfile } from '../shared/review/contracts.js';
import { applyAIReview } from './reviewAI.js';
import type { AIReviewOptions, ReviewProvider } from './reviewAI.js';
import { reviewLimits } from './reviewContext.js';

export async function handleReview(res: ServerResponse, body: unknown, integrations: Pick<AIReviewOptions, 'complete'> = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(res, 400, 'Provide a review request object.');
  const b = body as Record<string, unknown>;
  if (typeof b.scanId !== 'string') return sendError(res, 400, 'Choose a scanned repository.');
  const session = getSession(b.scanId);
  if (!session) return sendError(res, 404, 'Scan session expired. Scan this repository again.');
  if (b.mode !== undefined && !['working', 'staged', 'range'].includes(b.mode as string)) return sendError(res, 400, 'Choose working, staged, or range review.');
  if (b.ai !== undefined && typeof b.ai !== 'boolean') return sendError(res, 400, 'AI review must be explicitly true or false.');
  let provider: ReviewProvider | undefined, limits;
  if (b.ai === true) {
    try {
      limits = reviewLimits(b.limits);
      if (b.provider !== undefined) {
        if (!b.provider || typeof b.provider !== 'object' || Array.isArray(b.provider)) throw new Error('Provide AI connection settings.');
        const value = b.provider as Record<string, unknown>;
        if (value.connection !== undefined && !['api', 'hermes'].includes(value.connection as string)) throw new Error('Choose the API or Hermes connection.');
        for (const key of ['baseUrl', 'model', 'apiKey']) if (value[key] !== undefined && (typeof value[key] !== 'string' || (value[key] as string).length > 4096)) throw new Error('Invalid AI connection settings.');
        provider = value.connection === 'hermes' ? { connection: 'hermes' } : { connection: 'api', baseUrl: value.baseUrl as string, model: value.model as string, apiKey: value.apiKey as string };
      }
    } catch (error) { return sendError(res, 400, (error as Error).message); }
  }
  for (const key of ['base', 'head']) if (b[key] !== undefined && (typeof b[key] !== 'string' || (b[key] as string).length > 200)) return sendError(res, 400, 'References must be strings of at most 200 characters.');
  let profile: ReviewProfile | undefined;
  try { if (b.profile !== undefined) profile = reviewProfile(b.profile); }
  catch (error) { return sendError(res, 400, (error as Error).message); }
  const abort = new AbortController();
  const close = () => { if (!res.writableEnded) abort.abort(); };
  res.once('close', close);
  const stream = b.ai === true && b.stream === true;
  const emit = (value: unknown) => { if (!abort.signal.aborted) { if (res.writableLength > 512 * 1024) throw new Error('Review client is receiving output too slowly.'); res.write('data: ' + JSON.stringify(value) + '\n\n'); } };
  try {
    if (stream) { res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' }); res.flushHeaders(); emit({ phase: 'Reading the selected Git comparison' }); }
    const options = { base: b.base as string || 'HEAD', head: b.head as string || '', mode: b.mode as ReviewMode || 'working', profile, signal: abort.signal };
    const report = await runReview(session.root, options);
    if (b.ai === true) await applyAIReview(session.root, report, { ...options, provider, limits, ...integrations, onProgress: phase => { if (stream) emit({ phase }); } });
    if (!abort.signal.aborted) { if (stream) { emit({ report }); res.end(); } else sendJSON(res, 200, report); }
  } catch (error) {
    if (!abort.signal.aborted) { const message = error instanceof Error ? error.message : 'Review failed.';
      if (stream) { emit({ error: message }); res.end(); } else sendError(res, error instanceof GitDiffError ? error.status : 500, message); }
  } finally { res.off('close', close); }
}
