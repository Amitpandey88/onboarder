// GET /api/file?scan=…&path=… — one file's text, for the code viewer and for the
// AI explainer's context.
//
// This is the only endpoint that returns the contents of something on the
// person's disk, which makes it the one worth being strict at. Three gates, and
// none of them is authentication: the scan id has to name a live session, the
// path has to resolve inside that session's root, and the file has to be small
// enough that reading it is not itself the problem. The router adds a fourth —
// it is the single GET that the cross-origin check applies to, because a page on
// another site could otherwise read files through the browser.

import { promises as fs } from 'node:fs';

import { sendError, sendText } from './http.js';
import { resolveInside } from './paths.js';
import { getSession } from './sessions.js';
import { boundedSource } from './intelligence/workspace.js';
import { safeRelative, scopedFile } from '../cli/agent/files.js';

// Code, not assets. Past this the viewer would choke anyway, and a 200 MB
// checked-in binary should not be buffered into a response to find that out.
const MAX_FILE_BYTES = 200 * 1024;

export async function handleFile(res, scanId, relPath) {
  const session = getSession(scanId);
  if (!session) return sendError(res, 404, 'That scan is gone. Rescan the repo.');

  try { safeRelative(relPath); } catch { return sendError(res, 400, 'Bad or credential-scoped path.'); }
  try {
    const abs = await scopedFile(session.root, relPath);
    const stat = await fs.lstat(abs);
    if (stat.size > MAX_FILE_BYTES) return sendError(res, 413, 'That file is too large to send around.');
    sendText(res, 200, await boundedSource(session.root, relPath, MAX_FILE_BYTES));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = (error as Error).message;
    sendError(res, code === 'ENOENT' || /not a regular file/.test(message) ? 404 : /symbolic|scope|outside/.test(message) ? 403 : /limit|binary/.test(message) ? 413 : 400, message);
  }
}
