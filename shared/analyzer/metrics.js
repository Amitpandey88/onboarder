import { blankComments } from './util.js';

const DECISIONS = {
  javascript: /\b(if|for|while|case|catch|do|else if)\b/g,
  python: /\b(if|elif|for|while|except)\b/g,
  go: /\b(if|for|case|go|select)\b/g,
};
const GENERIC = /\b(if|elif|for|while|case|catch|except|switch)\b/g;

export function codeStats(source, lang = '') {
  const lines = String(source).split('\n');
  let blank = 0;
  let comment = 0;
  let code = 0;
  let inBlock = false;
  const isHashComment = ['python', 'ruby', 'yaml', 'toml', 'shell', 'bash', 'sh'].includes(lang)
    || (!lang && (source.includes('#!') || /\b(def|import|class)\b/.test(source)));

  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { blank++; continue; }
    if (inBlock) { comment++; if (l.includes('*/')) inBlock = false; continue; }
    if (l.startsWith('//') || (isHashComment && l.startsWith('#'))) { comment++; continue; }
    if (l.startsWith('/*')) { comment++; if (!l.includes('*/')) inBlock = true; continue; }
    code++;
  }
  return { lines: lines.length, code, comment, blank };
}

export function complexityOf(source, lang) {
  const isHash = ['python', 'ruby', 'yaml', 'toml', 'shell'].includes(lang);
  const clean = blankComments(String(source), { lineChar: isHash ? '#' : '//' });
  const rx = DECISIONS[lang] || GENERIC;
  let score = 1;
  const decisions = clean.match(rx);
  score += decisions ? decisions.length : 0;
  const bools = clean.match(/&&|\|\||\?/g); // boolean ops + ternaries
  score += bools ? bools.length : 0;
  return score;
}
