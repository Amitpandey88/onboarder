import test from 'node:test';
import assert from 'node:assert';
import { analyze } from '../shared/analyzer/languages/java.js';

test('Java analyzer', () => {
  const source = `
    import java.util.List;
    @Service
    public class UserService {}
  `;
  const result = analyze(source, 'file.java');
  assert.equal(result.imports.length, 1);
  assert.equal(result.classes[0].name, 'UserService');
});
