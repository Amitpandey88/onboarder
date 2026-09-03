// Rust analyzer
import { blankComments, lineCounter, uniqueBy } from '../util.js';

export const extensions = ['.rs'];

export function analyze(source, path) {
  const clean = blankComments(source);
  const lineAt = lineCounter(clean);

  const imports = [];
  for (const m of clean.matchAll(/\b(?:use|mod)\s+([a-zA-Z0-9_:]+)/g)) {
    imports.push({ spec: m[1], line: lineAt(m.index) });
  }

  const functions = [];
  for (const m of clean.matchAll(/\b(pub\s+)?fn\s+([a-zA-Z0-9_]+)/g)) {
    functions.push({ name: m[2], pub: !!m[1], line: lineAt(m.index) });
  }

  const classes = [];
  for (const m of clean.matchAll(/\b(pub\s+)?(?:struct|enum|trait)\s+([a-zA-Z0-9_]+)/g)) {
    classes.push({ name: m[2], pub: !!m[1], line: lineAt(m.index) });
  }

  const exports = [];
  for (const f of functions) if (f.pub) exports.push({ name: f.name, kind: 'function' });
  for (const c of classes) if (c.pub) exports.push({ name: c.name, kind: 'class' });

  const hasMain = /\bfn\s+main\s*\(/.test(clean);

  return {
    imports: uniqueBy(imports, i => i.spec + ':' + i.line),
    exports,
    functions,
    classes,
    hasMain
  };
}

export function resolveImport(spec, fromPath, has, context = {}) {
  return { unresolved: spec };
}
