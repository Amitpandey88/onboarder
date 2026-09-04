import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../shared/analyzer/languages/rust.js';

// Migrated here from `tests/generic.test.js` when the Rust block was extracted
// from the generic analyzer.

test('Rust analyzer: use, mod, functions, and structs', () => {
  const source = [
    'mod helpers;',
    'use crate::models::User;',
    'use serde::Serialize;',
    'pub struct App {}',
    'pub fn run() {}',
  ].join('\n');

  const result = analyze(source, 'src/main.rs');
  assert.deepEqual(
    result.imports.map((i) => i.spec).sort(),
    ['crate::models::User', 'helpers', 'serde::Serialize']
  );
  assert.deepEqual(result.classes.map((c) => c.name), ['App']);
  assert.deepEqual(result.functions.map((f) => f.name), ['run']);
  // Only `pub` items count as exports.
  assert.deepEqual(result.exports.map((e) => e.name).sort(), ['App', 'run']);
});

test('Rust analyzer: hasMain is true for fn main', () => {
  const source = 'pub fn main() {}';
  const result = analyze(source, 'main.rs');
  assert.equal(result.hasMain, true);
});

test('Rust analyzer: non-pub items are not exports', () => {
  const source = [
    'fn helper() {}',          // not pub
    'struct Internal {}',       // not pub
  ].join('\n');
  const result = analyze(source, 'lib.rs');
  assert.equal(result.exports.length, 0);
});

