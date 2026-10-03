// GET /api/diff and GET /api/diff/refs — Git diff and branch endpoints.

import { getGitDiff, getGitRefs, GitDiffError } from './gitDiff.js';
import { sendError, sendJSON } from './http.js';
import { getSession } from './sessions.js';

export async function handleDiffRefs(res, scanId) {
  const session = getSession(scanId);
  if (!session) return sendError(res, 404, 'Scan session not found.');

  const refs = await getGitRefs(session.root);
  sendJSON(res, 200, refs);
}

export async function handleDiff(res, scanId, queryParams: Record<string, any> = {}) {
  const session = getSession(scanId);
  if (!session) return sendError(res, 404, 'Scan session not found.');

  const base = queryParams.get('base') || '';
  const head = queryParams.get('head') || '';
  const file = queryParams.get('file') || '';

  try {
    const diff = await getGitDiff(session.root, { base, head, file });
    sendJSON(res, 200, diff);
  } catch (error) {
    sendError(res, error instanceof GitDiffError ? error.status : 500, error instanceof Error ? error.message : 'Comparison failed.');
  }
}
