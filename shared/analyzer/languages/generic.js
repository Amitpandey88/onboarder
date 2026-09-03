// Generic analyzer for C/C++, Java, Rust, Ruby and PHP. It only tries to
// catch the include/import/use lines plus the obvious function shapes, which
// is enough to place these files on the map.

import { blankComments, lineCounter, uniqueBy } from '../util.js';
import { dirOf, joinPath, baseName } from '../pathUtil.js';

export const extensions = ['.c', '.h', '.cc', '.cpp', '.hpp', '.rb', '.php'];

const BY_EXT = {
  c: 'c', h: 'c', cc: 'c', cpp: 'c', hpp: 'c',
  java: 'java', rs: 'rust', rb: 'ruby', php: 'php',
};

const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'do', 'else']);

export function analyze(source, path) {
  const family = BY_EXT[path.slice(path.lastIndexOf('.') + 1)] || 'c';
  const clean = blankComments(source, { lineChar: family === 'ruby' ? '#' : '//' });
  const lineAt = lineCounter(clean);

  const imports = [];
  const functions = [];
  const classes = [];

  if (family === 'c') {
    for (const m of clean.matchAll(/^[ \t]*#[ \t]*include[ \t]*"([^"]+)"/gm)) {
      imports.push({ spec: m[1], local: true, line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/^[ \t]*#[ \t]*include[ \t]*<([^>]+)>/gm)) {
      imports.push({ spec: m[1], local: false, line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/^[A-Za-z_][\w\s\*]*?\s+([\w]+)\s*\([^;{}]*\)\s*\{/gm)) {
      if (!CONTROL.has(m[1])) functions.push({ name: m[1], kind: 'function', line: lineAt(m.index) });
    }
  }

  if (family === 'java') {
    for (const m of clean.matchAll(/^[ \t]*import\s+(?:static\s+)?([\w.]+)\s*;/gm)) {
      imports.push({ spec: m[1], kind: 'import', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/\b(?:class|interface|enum|record)\s+([\w]+)/g)) {
      classes.push({ name: m[1], line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/^[ \t]*(?:public|private|protected|static|final|synchronized|abstract|\s)+[\w<>\[\],.?]+\s+([\w]+)\s*\([^;{}]*\)\s*(?:throws[^{]+)?\{/gm)) {
      if (!CONTROL.has(m[1])) functions.push({ name: m[1], kind: 'method', line: lineAt(m.index) });
    }
  }

  if (family === 'rust') {
    for (const m of clean.matchAll(/^[ \t]*use\s+([\w:]+)/gm)) {
      imports.push({ spec: m[1], kind: 'use', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/^[ \t]*mod\s+([\w]+)\s*;/gm)) {
      imports.push({ spec: m[1], kind: 'mod', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/\bfn\s+([\w]+)\s*(?:<[^>]*>)?\s*\(/g)) {
      functions.push({ name: m[1], kind: 'function', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/\b(?:struct|enum|trait)\s+([\w]+)/g)) {
      classes.push({ name: m[1], line: lineAt(m.index) });
    }
  }

  if (family === 'ruby') {
    for (const m of clean.matchAll(/^[ \t]*require_relative\s+['"]([^'"]+)['"]/gm)) {
      imports.push({ spec: m[1], kind: 'require_relative', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/^[ \t]*require\s+['"]([^'"]+)['"]/gm)) {
      imports.push({ spec: m[1], kind: 'require', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/^[ \t]*def\s+([\w!?]+)/gm)) {
      functions.push({ name: m[1], kind: 'function', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/^[ \t]*(?:class|module)\s+([\w:]+)/gm)) {
      classes.push({ name: m[1], line: lineAt(m.index) });
    }
  }

  if (family === 'php') {
    for (const m of clean.matchAll(/\b(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g)) {
      imports.push({ spec: m[1], kind: 'require', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/^[ \t]*use\s+([\w\\]+)\s*;/gm)) {
      imports.push({ spec: m[1], kind: 'use', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/\bfunction\s+([\w]+)\s*\(/g)) {
      functions.push({ name: m[1], kind: 'function', line: lineAt(m.index) });
    }
    for (const m of clean.matchAll(/\bclass\s+([\w]+)/g)) {
      classes.push({ name: m[1], line: lineAt(m.index) });
    }
  }

  return {
    imports: uniqueBy(imports, (i) => i.spec + ':' + (i.kind || '')),
    exports: [],
    functions,
    classes,
    calls: [],
    hasMain: family === 'c' && /\bint\s+main\s*\(/.test(clean),
  };
}

export function packageNameOf(spec) {
  if (spec.endsWith('.h') || spec.endsWith('.hpp')) return spec;
  return spec.split(/[.:/\\]/)[0] || spec;
}

export function resolveImport(spec, fromPath, has, context = {}, meta = {}) {
  const fromDir = dirOf(fromPath);
  const { findByName = () => null } = context;

  // C angle-bracket includes like <stdio.h> are explicitly external
  if (meta.local === false && meta.kind !== 'mod' && meta.kind !== 'use' && meta.kind !== 'import') {
    return { external: packageNameOf(spec) };
  }

  const cleaned = spec.replace(/::/g, '/').replace(/\\/g, '/').replace(/\./g, '/');
  const lastDot = spec.lastIndexOf('.');
  const lastSlash = Math.max(spec.lastIndexOf('/'), spec.lastIndexOf('\\'));
  const lastColon = spec.lastIndexOf('::');
  const lastSep = Math.max(lastDot, lastSlash, lastColon >= 0 ? lastColon + 1 : -1);
  const lastSegment = lastSep >= 0 ? spec.slice(lastSep + 1) : spec;

  const candidates = [
    joinPath(fromDir, spec),
    joinPath(fromDir, cleaned),
    cleaned + '.java',
    joinPath(fromDir, cleaned) + '.java',
    joinPath(fromDir, cleaned) + '.rs',
    joinPath(fromDir, cleaned, 'mod.rs'),
    joinPath(fromDir, spec) + '.rb',
    joinPath(fromDir, cleaned) + '.rb',
    joinPath(fromDir, cleaned) + '.php',
    cleaned + '.php',
    joinPath(fromDir, spec) + '.php',
  ];
  for (const cand of candidates) {
    if (cand && has(cand)) return { path: cand };
  }

  // Match class/file name anywhere in the repo
  if (lastSegment && lastSegment !== '*') {
    const hitJava = findByName(lastSegment + '.java');
    if (hitJava) return { path: hitJava };
    const hitPhp = findByName(lastSegment + '.php');
    if (hitPhp) return { path: hitPhp };
    const hitRs = findByName(lastSegment + '.rs');
    if (hitRs) return { path: hitRs };
  }

  // Last resort for quoted includes: match on the file name anywhere.
  const hit = findByName(baseName(spec));
  if (hit) return { path: hit };

  if (meta.kind === 'use' || meta.kind === 'import' || meta.kind === 'require' || meta.local === false) {
    return { external: packageNameOf(spec) };
  }
  return { unresolved: spec };
}
