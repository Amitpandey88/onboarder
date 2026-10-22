import type { ReviewFinding, ReviewReport } from '../../shared/review/contracts.js';
import { SEVERITY_RANK } from '../../shared/review/review.js';
import { escapeHtml as esc } from './html.js';

/** Consume bounded progress frames; a disconnected stream is never a successful review. */
export async function requestReview(body: Record<string, unknown>, signal: AbortSignal, progress: (phase: string) => void): Promise<ReviewReport> {
  const response = await fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!response.ok) { const value = await response.json().catch(() => ({})); throw new Error(value.error || 'Review request failed.'); }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
  const reader = response.body?.getReader(); if (!reader) throw new Error('Review returned no progress stream.');
  const decoder = new TextDecoder(); let pending = '', bytes = 0, report: ReviewReport | undefined;
  try {
    for (;;) {
      const value = await reader.read(); if (value.done) break;
      bytes += value.value.byteLength; if (bytes > 16 * 1024 * 1024) throw new Error('Review response exceeds 16 MB. Narrow the comparison.');
      pending = (pending + decoder.decode(value.value, { stream: true })).replace(/\r\n/g, '\n');
      const frames = pending.split('\n\n'); pending = frames.pop()!;
      for (const frame of frames) for (const line of frame.split('\n')) if (line.startsWith('data:')) {
        let item; try { item = JSON.parse(line.slice(5).trim()); } catch { throw new Error('Malformed review progress frame.'); }
        if (item.error) throw new Error(String(item.error));
        if (typeof item.phase === 'string') progress(item.phase);
        if (item.report) { if (report) throw new Error('Review returned duplicate completion frames.'); report = item.report; }
      }
    }
    if (!report) throw new Error('Review disconnected before completing. Run the review again.');
    return report;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function findingGroups(findings: ReviewFinding[], notes: Set<string>): string {
  const groups = new Map<string, ReviewFinding[]>();
  for (const finding of [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.category.localeCompare(b.category))) {
    const key = finding.severity + ' · ' + finding.category;
    groups.set(key, [...(groups.get(key) || []), finding]);
  }
  return [...groups].map(([label, items]) => `<section class="review-finding-group" aria-label="${esc(label)}"><h3>${esc(label)} <small>(${items.length})</small></h3>${items.map(f => {
    const ai = f.source === 'ai';
    return `<article class="review-finding ${notes.has(f.id) ? 'is-acknowledged' : ''}"><div class="review-finding-meta"><span class="review-severity sev-${f.severity}">${f.severity}</span><span>${ai ? 'AI inference' : 'Static pattern'} · ${esc(f.rule)}</span><button class="linklike review-location" data-path="${esc(f.path)}" data-line="${f.line}">${esc(f.path)}:${f.line}</button></div><h4>${esc(f.title || f.message)}</h4><pre>${esc(f.excerpt)}</pre>
      ${ai ? `<p class="review-small">Model confidence: ${esc(f.confidence || 'unspecified')} · cited locations validated · behavior unverified</p><button class="btn btn-ghost" data-explain="${esc(f.id)}" aria-expanded="false">Show AI explanation</button><div class="review-finding-explanation" hidden><p>${esc(f.message)}</p><p><strong>Potential impact:</strong> ${esc(f.impact || '')}</p><p><strong>Confidence basis:</strong> ${esc(f.confidenceReason || '')}</p></div><div class="review-evidence-links">${(f.relatedEvidence || []).map(e => `<button class="linklike" data-evidence="${esc(e.id)}">${esc(e.path)}:${e.startLine}–${e.endLine}</button>`).join('')}</div>` : ''}
      <div class="review-suggestion"><strong>Suggested next step</strong><p>${esc(f.suggestion)}</p></div><button class="btn" data-finding-fix="${esc(f.id)}">Explain & propose fix</button><label class="review-ack"><input type="checkbox" data-ack="${esc(f.id)}"${notes.has(f.id) ? ' checked' : ''}> Acknowledged — a local note, not a verified fix</label></article>`;
  }).join('')}</section>`).join('');
}
