import { escapeHtml } from './html.js';

let keyListenerAttached = false;
let activeInstance = null;

function getExtBadge(path) {
  const ext = (path.match(/\.([A-Za-z0-9]+)$/) || [, ''])[1].toUpperCase();
  return ext || 'FILE';
}

function highlightMatch(text, query) {
  if (!query || !text) return escapeHtml(text || '');
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return escapeHtml(text);
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return `${escapeHtml(before)}<mark class="search-match">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
}

export function initSearch(files = [], options) {
  const opts = options || {};
  let fileList = Array.isArray(files) ? files : [];
  let scanIdProvider = opts.getScanId || (() => opts.scanId || null);
  let isShowing = false;
  let overlay = null;
  let input = null;
  let resultsList = null;
  let filterBar = null;
  let selectedIndex = 0;
  let matches = [];
  let activeMode = 'all'; // 'all' | 'files' | 'symbols' | 'code'
  let codeSearchTimeout = null;
  let codeSearchLoading = false;

  function getPath(file) {
    if (!file) return '';
    return typeof file === 'string' ? file : file.path || '';
  }

  function createDOM() {
    overlay = document.getElementById('searchOverlay');
    if (overlay) {
      input = overlay.querySelector('.search-input');
      resultsList = overlay.querySelector('.search-results');
      filterBar = overlay.querySelector('.search-modes');
      return;
    }
    
    overlay = document.createElement('div');
    overlay.id = 'searchOverlay';
    overlay.className = 'search-overlay';
    overlay.hidden = true;
    
    const modal = document.createElement('div');
    modal.className = 'search-modal';
    
    const header = document.createElement('div');
    header.className = 'search-header';

    filterBar = document.createElement('div');
    filterBar.className = 'search-modes';
    filterBar.innerHTML = `
      <button class="search-mode-chip is-active" data-mode="all">All</button>
      <button class="search-mode-chip" data-mode="files">Files</button>
      <button class="search-mode-chip" data-mode="symbols">Symbols</button>
      <button class="search-mode-chip" data-mode="code">Code Content</button>
    `;
    
    input = document.createElement('input');
    input.className = 'search-input';
    input.placeholder = 'Search files, functions, or code content… (↑↓ to navigate, Enter to open)';
    
    header.appendChild(input);
    header.appendChild(filterBar);

    resultsList = document.createElement('div');
    resultsList.className = 'search-results';

    const foot = document.createElement('div');
    foot.className = 'search-footer';
    foot.innerHTML = `
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>↵</kbd> select</span>
      <span><kbd>esc</kbd> close</span>
    `;
    
    modal.appendChild(header);
    modal.appendChild(resultsList);
    modal.appendChild(foot);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    filterBar.addEventListener('click', (e) => {
      const chip = e.target.closest('.search-mode-chip');
      if (!chip) return;
      activeMode = chip.dataset.mode || 'all';
      filterBar.querySelectorAll('.search-mode-chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      search(input.value);
      input.focus();
    });

    input.addEventListener('input', () => {
      search(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (matches.length > 0) {
          selectedIndex = Math.min(selectedIndex + 1, matches.length - 1);
          renderResults();
          scrollSelectedIntoView();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (matches.length > 0) {
          selectedIndex = Math.max(selectedIndex - 1, 0);
          renderResults();
          scrollSelectedIntoView();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (matches[selectedIndex]) {
          select(matches[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        hide();
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hide();
    });
  }

  function scrollSelectedIntoView() {
    if (!resultsList) return;
    const selectedEl = resultsList.querySelector('.search-result.is-selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function scoreFile(query, path) {
    if (!query) return 1;
    const lowerQ = query.toLowerCase();
    const lowerP = path.toLowerCase();
    const base = path.split('/').pop().toLowerCase();
    
    if (base === lowerQ) return 300;
    if (base.startsWith(lowerQ)) return 200;
    if (base.includes(lowerQ)) return 120 - base.indexOf(lowerQ);
    if (lowerP.includes(lowerQ)) return 60 - lowerP.indexOf(lowerQ);
    return 0;
  }

  function search(query) {
    const q = (query || '').trim();
    selectedIndex = 0;
    
    if (!q) {
      matches = fileList.slice(0, 15).map((f) => ({
        type: 'file',
        path: getPath(f),
        file: f,
        score: 1,
      }));
      renderResults();
      return;
    }

    const localMatches = [];
    const lowerQ = q.toLowerCase();

    // 1. Files
    if (activeMode === 'all' || activeMode === 'files') {
      for (const file of fileList) {
        const path = getPath(file);
        const s = scoreFile(q, path);
        if (s > 0) {
          localMatches.push({
            type: 'file',
            path,
            file,
            score: s,
          });
        }
      }
    }

    // 2. Symbols (Functions & Exports)
    if (activeMode === 'all' || activeMode === 'symbols') {
      for (const file of fileList) {
        const path = getPath(file);
        if (typeof file === 'object') {
          for (const fn of file.functions || []) {
            if (fn.name && fn.name.toLowerCase().includes(lowerQ)) {
              localMatches.push({
                type: 'symbol',
                path,
                symbol: fn.name + '()',
                kind: fn.kind || 'function',
                line: fn.line,
                file,
                score: 150 + (fn.name.toLowerCase().startsWith(lowerQ) ? 50 : 0),
              });
            }
          }
          for (const exp of file.exports || []) {
            if (exp.name && exp.name.toLowerCase().includes(lowerQ)) {
              localMatches.push({
                type: 'symbol',
                path,
                symbol: exp.name,
                kind: 'export ' + (exp.kind || ''),
                line: exp.line,
                file,
                score: 140,
              });
            }
          }
        }
      }
    }

    matches = localMatches.sort((a, b) => b.score - a.score).slice(0, 20);
    renderResults();

    // 3. Asynchronous full-text code search (TF-IDF backend)
    if (activeMode === 'code' || (activeMode === 'all' && q.length >= 3)) {
      clearTimeout(codeSearchTimeout);
      const scanId = scanIdProvider();
      if (scanId) {
        codeSearchLoading = true;
        codeSearchTimeout = setTimeout(async () => {
          try {
            const res = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scanId, query: q, limit: 10 }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.results && data.results.length) {
                const codeResults = data.results.map((r) => ({
                  type: 'code',
                  path: r.path,
                  snippet: r.snippet,
                  line: r.line,
                  score: r.score * 50,
                }));
                if (activeMode === 'code') {
                  matches = codeResults;
                } else {
                  // Merge without duplicates
                  const existing = new Set(matches.map((m) => m.path + ':' + (m.line || '')));
                  for (const cr of codeResults) {
                    if (!existing.has(cr.path + ':' + (cr.line || ''))) {
                      matches.push(cr);
                    }
                  }
                  matches.sort((a, b) => b.score - a.score);
                }
              }
            }
          } catch (e) {
            /* ignore search fetch error */
          } finally {
            codeSearchLoading = false;
            renderResults();
          }
        }, 180);
      }
    }
  }

  function renderResults() {
    if (!resultsList) return;
    resultsList.innerHTML = '';
    const q = input?.value?.trim() || '';

    if (!matches.length) {
      resultsList.innerHTML = codeSearchLoading
        ? '<div class="search-empty"><span class="search-spinner"></span> Searching code contents…</div>'
        : '<div class="search-empty">No matching files or symbols found.</div>';
      return;
    }

    matches.forEach((m, i) => {
      const item = document.createElement('div');
      item.className = `search-result is-${m.type} ${i === selectedIndex ? 'is-selected' : ''}`;
      
      const path = m.path;
      const name = path.split('/').pop();
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const badge = getExtBadge(path);

      let contentHtml = '';
      if (m.type === 'file') {
        contentHtml = `
          <div class="search-item-main">
            <span class="search-ext-badge">${badge}</span>
            <div class="search-title">
              <span class="search-name">${highlightMatch(name, q)}</span>
              <span class="search-dir">${escapeHtml(dir)}</span>
            </div>
            <span class="search-type-tag">file</span>
          </div>
        `;
      } else if (m.type === 'symbol') {
        contentHtml = `
          <div class="search-item-main">
            <span class="search-ext-badge is-symbol">SYM</span>
            <div class="search-title">
              <span class="search-name">${highlightMatch(m.symbol, q)}</span>
              <span class="search-dir">${escapeHtml(path)} ${m.line ? '· L' + m.line : ''}</span>
            </div>
            <span class="search-type-tag is-sym">${escapeHtml(m.kind || 'symbol')}</span>
          </div>
        `;
      } else if (m.type === 'code') {
        contentHtml = `
          <div class="search-item-main">
            <span class="search-ext-badge is-code">CODE</span>
            <div class="search-title">
              <span class="search-name">${escapeHtml(name)}</span>
              <span class="search-dir">${escapeHtml(path)} · Line ${m.line}</span>
            </div>
            <span class="search-type-tag is-code">match</span>
          </div>
          ${m.snippet ? `<div class="search-snippet"><code>${highlightMatch(m.snippet, q)}</code></div>` : ''}
        `;
      }

      item.innerHTML = contentHtml;
      item.addEventListener('mouseenter', () => {
        selectedIndex = i;
        renderResults();
      });
      item.addEventListener('click', () => {
        select(m);
      });
      resultsList.appendChild(item);
    });
  }

  function select(match) {
    const path = typeof match === 'string' ? match : match?.path;
    if (path) {
      document.dispatchEvent(new CustomEvent('search-select', { detail: { path, line: match?.line } }));
    }
    hide();
  }

  function show() {
    createDOM();
    overlay.hidden = false;
    input.value = '';
    search('');
    input.focus();
    isShowing = true;
  }

  function hide() {
    if (overlay) overlay.hidden = true;
    isShowing = false;
  }

  function updateFiles(newFiles, newScanId) {
    fileList = Array.isArray(newFiles) ? newFiles : [];
    if (newScanId) scanIdProvider = () => newScanId;
    if (isShowing) search(input?.value || '');
  }

  const controller = { show, hide, updateFiles };
  activeInstance = controller;

  if (!keyListenerAttached) {
    keyListenerAttached = true;
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (activeInstance) {
          isShowing ? activeInstance.hide() : activeInstance.show();
        }
      } else if (e.key === 'Escape' && isShowing) {
        if (activeInstance) activeInstance.hide();
      }
    });
  }

  return controller;
}
