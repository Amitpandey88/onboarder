// Java analyzer
import { blankComments, lineCounter, uniqueBy } from '../util.js';

export const extensions = ['.java'];

export function analyze(source, path) {
  const clean = blankComments(source);
  const lineAt = lineCounter(clean);

  const imports = [];
  for (const m of clean.matchAll(/\bimport\s+(static\s+)?([a-zA-Z0-9_.]+)/g)) {
    imports.push({ spec: m[2], static: !!m[1], line: lineAt(m.index) });
  }

  const classes = [];
  for (const m of clean.matchAll(/(@[A-Za-z0-9_]+\s*)*\b(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?(?:class|interface|enum|record|@interface)\s+([a-zA-Z0-9_]+)/g)) {
    const annotations = [];
    if (m[1]) {
      for (const am of m[1].matchAll(/@([A-Za-z0-9_]+)/g)) {
        annotations.push(am[1]);
      }
    }
    classes.push({ name: m[2], annotations, line: lineAt(m.index) });
  }

  const hasMain = /public\s+static\s+void\s+main\s*\(/.test(clean);

  return {
    imports,
    exports: classes.map(c => ({ name: c.name, kind: 'class' })),
    functions: [],
    classes,
    hasMain
  };
}

export function resolveImport(spec, fromPath, has, context = {}) {
  return { unresolved: spec };
}
