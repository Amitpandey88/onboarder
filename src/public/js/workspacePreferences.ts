const hashString = (value: string) => { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return (result >>> 0).toString(16); };

export interface Viewpoint { name: string; path: string; filter: string; viewport?: { scale: number; tx: number; ty: number }; expanded?: string[] }
const views = new Set(['map', 'files', 'patterns', 'health', 'security', 'history', 'services', 'tour', 'atlas', 'analysis', 'review', 'graph', 'heatmap', 'insights', 'diff', 'workflows', 'sbom', 'code', 'docs', 'about', 'intelligence', 'triage']);
const key = (root: string) => 'onboarder.view.v1.' + hashString(root);
export function rememberView(root: string, view: Viewpoint) {
  try { localStorage.setItem(key(root), JSON.stringify(view)); } catch { /* Browsing remains available without storage. */ }
}
export function rememberedView(root: string): Viewpoint | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(root)) || 'null');
    return value && views.has(value.name) && typeof value.path === 'string' && value.path.length <= 500 && typeof value.filter === 'string' && value.filter.length <= 500 ? value : null;
  } catch { return null; }
}
export function savedBookmarks(root: string): (Viewpoint & { title: string })[] {
  try {
    const values = JSON.parse(localStorage.getItem(key(root) + '.bookmarks') || '[]');
    if (!Array.isArray(values) || values.length > 20) return [];
    return values.filter(v => v && typeof v.title === 'string' && v.title.length <= 100 && views.has(v.name) && typeof v.path === 'string' && v.path.length <= 500 && typeof v.filter === 'string' && v.filter.length <= 500 &&
      (!v.viewport || ['scale', 'tx', 'ty'].every(k => typeof v.viewport[k] === 'number' && Number.isFinite(v.viewport[k]) && Math.abs(v.viewport[k]) < 10000000)) &&
      (!v.expanded || Array.isArray(v.expanded) && v.expanded.length <= 1000 && v.expanded.every((s: unknown) => typeof s === 'string' && s.length <= 500)));
  } catch { return []; }
}
export function saveBookmark(root: string, title: string, viewpoint: Viewpoint) {
  if (!title.trim() || title.length > 100) throw new Error('Use a bookmark name under 100 characters.');
  const values = [{ ...viewpoint, title }, ...savedBookmarks(root).filter(v => v.title !== title)].slice(0, 20);
  localStorage.setItem(key(root) + '.bookmarks', JSON.stringify(values));
}
