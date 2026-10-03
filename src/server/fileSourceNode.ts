import type { FileSource, FileEntry } from '../shared/contracts.js';
// FileSource over node:fs. Paths crossing the boundary are repo-relative
// POSIX style; this adapter is the only place that knows about the real
// filesystem layout.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveInside } from './paths.js';

export function nodeFileSource(rootAbs: string): FileSource {
  const toAbs = (rel: string): string => {
    // `list('')` is how the scanner asks for the top of the repo. Everywhere
    // else an empty path is a caller mistake, which is why resolveInside
    // refuses it rather than quietly meaning "the root".
    if (rel === '' || rel == null) return rootAbs;
    // The scanner only ever produces paths from directory listings, so this
    // should never fire — but it's the same check the HTTP routes use, and a
    // free one.
    const abs = resolveInside(rootAbs, String(rel));
    if (!abs) throw new Error('Path escapes the repository root');
    return abs;
  };

  return {
    kind: 'node',
    root: rootAbs,
    name: path.basename(rootAbs),

    async list(dir: string): Promise<FileEntry[]> {
      const entries = await fs.readdir(toAbs(dir), { withFileTypes: true });
      const out: FileEntry[] = [];
      for (const e of entries) {
        if (e.isSymbolicLink()) continue; // no loops, no surprises
        const rel = dir ? dir + '/' + e.name : e.name;
        out.push({ name: e.name, path: rel, type: e.isDirectory() ? 'dir' : 'file' });
      }
      return out;
    },

    async read(rel: string): Promise<string> {
      return fs.readFile(toAbs(rel), 'utf8');
    },
  };
}
