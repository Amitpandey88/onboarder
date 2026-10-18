import type { ReviewReport } from '../../shared/review/contracts.js';
import { escapeHtml as esc } from './html.js';

/** Render only the retained comparison; never fetch current source as evidence. */
export function showReviewPatch(report: ReviewReport, path: string, target = 1) {
  const comparison = report.comparison;
  const file = comparison?.files.find(f => f.newPath === path || f.oldPath === path);
  if (!comparison || !file) return false;
  const dialog = document.createElement('dialog'); dialog.className = 'review-patch-dialog';
  dialog.setAttribute('aria-label', 'Compared patch for ' + path);
  const rows = file.hunks.map(hunk => {
    let oldLine = hunk.oldStart; let newLine = hunk.newStart;
    return '<h3>' + esc(hunk.header) + '</h3>' + hunk.lines.map(line => {
      const left = line.type === 'add' ? '' : String(oldLine++);
      const right = line.type === 'del' ? '' : String(newLine++);
      return '<div class="review-patch-line ' + line.type + (right === String(target) ? ' is-target' : '') + '"><span>' + left + '</span><span>' + right + '</span><pre>' + esc((line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' ') + line.text) + '</pre></div>';
    }).join('');
  }).join('');
  dialog.innerHTML = '<header><div><h2>' + esc(path) + '</h2><p>' + esc(comparison.mode) + ' · base ' + esc(comparison.base) + ' · head ' + esc(comparison.head || 'captured index / working tree') + '</p><small>Report ' + esc(report.fingerprint.slice(0, 16)) + ' · ' + esc(report.generatedAt) + '</small></div><button class="btn" type="button">Close</button></header>' +
    (rows || '<p>' + esc(file.skipReason || (file.binary ? 'Binary content is not displayed.' : 'No text hunks in this change.')) + '</p>');
  const origin = document.activeElement;
  const close = () => { dialog.close(); dialog.remove(); if (origin instanceof HTMLElement) origin.focus(); };
  dialog.querySelector('button')!.onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector('.is-target')?.scrollIntoView({ block: 'center' });
  return true;
}
