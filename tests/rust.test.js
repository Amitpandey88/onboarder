import test from 'node:test';
import assert from 'node:assert';
import { analyze } from '../shared/analyzer/languages/rust.js';

test('Rust analyzer', () => {
  const source = `
    use std::collections::HashMap;
    mod utils;
    pub fn main() {}
    pub struct User {}
  `;
  const result = analyze(source, 'file.rs');
  assert.equal(result.imports.length, 2);
  assert.equal(result.functions[0].name, 'main');
  assert.equal(result.classes[0].name, 'User');
});
