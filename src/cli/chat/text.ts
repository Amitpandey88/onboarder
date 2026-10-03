import { terminalText } from '../agent/process.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function graphemes(value: string): string[] { return [...segmenter.segment(value)].map(s => s.segment); }
export function clusterCells(cluster: string): number {
  if (/^[\p{Mark}\u200d\ufe0f]+$/u.test(cluster)) return 0;
  return /\p{Extended_Pictographic}|[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{1f1e6}-\u{1f1ff}]/u.test(cluster) ? 2 : 1;
}
export function cells(value: string): number {
  return graphemes(terminalText(value)).reduce((total, cluster) => total + clusterCells(cluster), 0);
}
export function clip(value: string, room: number, ellipsis = true): string {
  const safe = terminalText(value).replace(/[\r\n\t]/g, ' ');
  if (cells(safe) <= room) return safe;
  const limit = Math.max(0, room - (ellipsis && room > 0 ? 1 : 0));
  let result = '', used = 0;
  for (const g of graphemes(safe)) { const size = clusterCells(g); if (used + size > limit) break; result += g; used += size; }
  return result + (ellipsis && room > 0 ? '…' : '');
}
