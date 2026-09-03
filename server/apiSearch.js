import { promises as fs } from 'node:fs';
import { getSession } from './sessions.js';
import { resolveInside } from './paths.js';
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

  try {
    if (!session.searchIndex) {
      const allFiles = [];
      async function walk(dir) {
        const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const e of ents) {
          if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build' || e.name.startsWith('.')) continue;
          const resPath = resolveInside(dir, e.name);
          if (e.isDirectory()) {
            await walk(resPath);
          } else {
            allFiles.push(resPath);
          }
        }
      }
      await walk(session.root);

      const docs = [];
      for (const absFile of allFiles) {
        const stat = await fs.stat(absFile).catch(() => null);
        if (stat && stat.size < 1024 * 1024) { // Cap at 1MB per file
          const content = await fs.readFile(absFile, 'utf8').catch(() => '');
          if (content && !content.slice(0, 1000).includes('\0')) {
            let rel = absFile;
            if (absFile.startsWith(session.root)) {
              rel = absFile.slice(session.root.length).replace(/^\//, '');
            }
            docs.push({ path: rel, content });
          }
        }
      }
      session.searchIndex = buildTfIdfIndex(docs);
    }

    const results = searchIndex(session.searchIndex, q, limit);
    return sendJSON(res, 200, { results });
  } catch (err) {
    return sendError(res, 500, 'Search failed: ' + err.message);
  }
}
