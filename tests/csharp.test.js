import test from 'node:test';
import assert from 'node:assert';
import { analyze } from '../shared/analyzer/languages/csharp.js';

test('C# analyzer', () => {
  const source = `
    using System;
    [ApiController]
    public class MyController {}
  `;
  const result = analyze(source, 'file.cs');
  assert.equal(result.imports.length, 1);
  assert.equal(result.classes[0].name, 'MyController');
});
