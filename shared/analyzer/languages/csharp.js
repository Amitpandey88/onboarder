// C# analyzer
import { blankComments, lineCounter, uniqueBy } from '../util.js';

export const extensions = ['.cs'];

export function analyze(source, path) {
  const clean = blankComments(source);
  const lineAt = lineCounter(clean);

  const imports = [];
  for (const m of clean.matchAll(/\busing\s+([a-zA-Z0-9_.]+)\s*;/g)) {
    imports.push({ spec: m[1], line: lineAt(m.index) });
  }

  const classes = [];
  for (const m of clean.matchAll(/(\[[^\]]+\]\s*)*\b(?:public\s+|private\s+|protected\s+|internal\s+)*(?:abstract\s+|sealed\s+)?(?:class|interface|struct|record|enum)\s+([a-zA-Z0-9_]+)/g)) {
    const attributes = [];
    if (m[1]) {
      for (const am of m[1].matchAll(/\[([A-Za-z0-9_]+)/g)) {
        attributes.push(am[1]);
      }
    }
    classes.push({ name: m[2], attributes, line: lineAt(m.index) });
  }

  const hasMain = /static\s+(?:async\s+Task|void|int|async\s+Task<int>)\s+Main\s*\(/.test(clean);

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
