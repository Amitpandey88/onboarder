import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberView, rememberedView } from '../public/js/workspacePreferences.js';

test('repository views retain map position and expansion without crossing repositories', () => {
  const original = globalThis.localStorage;
  const values = new Map(); globalThis.localStorage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) || null };
  try {
    const view = { name: 'map', path: 'src/app.ts', filter: 'app', viewport: { scale: 1.2, tx: -230, ty: 80 }, expanded: ['dir:', 'dir:src'] };
    rememberView('/first', view); assert.deepEqual(rememberedView('/first'), view); assert.equal(rememberedView('/second'), null);
    for (const viewport of [{ scale: -1, tx: 0, ty: 0 }, { scale: 1, tx: 1e20, ty: 0 }, { scale: '1', tx: 0, ty: 0 }]) { rememberView('/first', { ...view, viewport }); assert.equal(rememberedView('/first'), null); }
    rememberView('/first', { ...view, expanded: [42] }); assert.equal(rememberedView('/first'), null);
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});
