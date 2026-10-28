import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppearance, appearancePatch } from '../src/appearance.mjs';
test('removed glass preferences have no effect and system reduced motion takes priority', () => {
  assert.deepEqual(resolveAppearance({ liquidGlass: true }, {}, true), { motion: 'system', reducedMotion: false });
  assert.equal(resolveAppearance({ motion: 'system' }, { reducedMotion: true }, true).reducedMotion, true);
  assert.equal(resolveAppearance({ motion: 'reduced' }, {}, true).reducedMotion, true);
});
test('UI preferences accept only the intended values', () => {
  assert.deepEqual(appearancePatch({ cloneStorage: 'temporary', motion: 'system' }), { cloneStorage: 'temporary', motion: 'system' });
  for (const value of [null, [], { liquidGlass: 'yes' }, { cloneStorage: '../files' }, { motion: 'always' }, { themeSource: 'anything' }]) assert.throws(() => appearancePatch(value));
});
