// POST /api/search — runs a TF-IDF query against the index built at scan
// time. The work that used to live here (re-listing the tree, re-reading
// every file, parsing its tokens) now lives in `searchIndex.js`, which
// `apiScan.js` invokes once when the scan finishes. What is left in this
// module is the request shape: validate, look up the session, score, send.
//
// The pure scoring functions (`buildTfIdfIndex` for one-off in-memory
// indexes used by tests, and `searchIndex` for the score-and-snippet pass)
// are still exported so the front end and tests can construct indexes
// directly when they need to.

import { getSession } from './sessions.js';
import { sendError, sendJSON } from './http.js';

export function buildTfIdfIndex(documents) {
  // documents: [{ path, content }]
  const index = new Map();
  const docCounts = new Map();
  let totalDocs = 0;

  for (const doc of documents) {
    if (!doc.content || typeof doc.content !== 'string') continue;
    const tokens = doc.content.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
    if (!tokens.length) continue;
    totalDocs++;

    const tf = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    for (const t of tf.keys()) {
      docCounts.set(t, (docCounts.get(t) || 0) + 1);
    }
    index.set(doc.path, { tf, content: doc.content, tokenCount: tokens.length });
  }

  return { index, docCounts, totalDocs };
}

export function searchIndex(indexData, queryString, limit = 10) {
  if (!indexData || !queryString) return [];
  const terms = queryString.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (!terms.length) return [];

  const { index, docCounts, totalDocs } = indexData;
  if (!totalDocs) return [];

  const idf = new Map();
  for (const t of terms) {
    const df = docCounts.get(t) || 0;
    idf.set(t, df === 0 ? 0 : Math.log(1 + totalDocs / df));
  }

  const results = [];
  for (const [docPath, data] of index.entries()) {
    let score = 0;
    let matchCount = 0;
    for (const t of terms) {
      const tf = data.tf.get(t) || 0;
      if (tf > 0) {
        matchCount++;
        // Normalized TF * IDF
        score += (tf / Math.sqrt(data.tokenCount)) * (idf.get(t) || 1);
      }
    }

    if (score > 0) {
      // Find best snippet
      const lowerContent = data.content.toLowerCase();
      let bestIdx = -1;
      for (const t of terms) {
        const idx = lowerContent.indexOf(t);
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
          bestIdx = idx;
        }
      }

      let snippet = '';
      let line = 1;
      if (bestIdx !== -1) {
        const linesBefore = data.content.slice(0, bestIdx).split('\n');
        line = linesBefore.length;
        const allLines = data.content.split('\n');
        const targetLine = (allLines[line - 1] || '').trim();
        snippet = targetLine.length > 120 ? targetLine.slice(0, 117) + '…' : targetLine;
      }

      results.push({
        path: docPath,
        score: score * (matchCount / terms.length), // Boost docs containing all terms
        snippet,
        line,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export async function handleSearch(res, body) {
  const { scanId, query, limit = 15 } = body || {};
  if (!scanId) return sendError(res, 400, 'Missing scanId.');
  const session = getSession(scanId);
  if (!session) return sendError(res, 404, 'Scan not found.');

  const q = (query || '').trim();
  if (!q) return sendJSON(res, 200, { results: [] });

  // No index means the scan was opened before this change shipped, or the
  // caller is using a session that was never given a scan-time index. The
  // honest answer is "no results" rather than rebuilding the whole thing on
  // the request thread.
  if (!session.searchIndex || session.searchIndex.totalDocs === 0) {
    return sendJSON(res, 200, { results: [], indexed: session.searchIndex?.totalDocs ?? 0 });
  }

  try {
    const results = searchIndex(session.searchIndex, q, limit);
    return sendJSON(res, 200, { results, indexed: session.searchIndex.totalDocs });
  } catch (err) {
    return sendError(res, 500, 'Search failed: ' + err.message);
  }
}

