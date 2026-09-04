import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../shared/analyzer/languages/java.js';

// Migrated here from `tests/generic.test.js` when the Java block was extracted
// from the generic analyzer. The dedicated module is a slimmer pass — it
// captures imports, classes, and annotations, but it does not yet extract
// method signatures; that is tracked separately.

test('Java analyzer: imports and classes', () => {
  const source = [
    'import java.util.List;',
    'import com.example.service.UserService;',
    'import com.example.model.User;',
    'import static org.junit.Assert.assertEquals;',
    'public class AppController {}',
  ].join('\n');

  const result = analyze(source, 'src/main/java/com/example/app/AppController.java');
  const specs = result.imports.map((i) => i.spec).sort();
  assert.deepEqual(specs, [
    'com.example.model.User',
    'com.example.service.UserService',
    'java.util.List',
    'org.junit.Assert.assertEquals',
  ]);
  assert.deepEqual(result.classes.map((c) => c.name), ['AppController']);
});

test('Java analyzer: annotations on classes', () => {
  const source = [
    'import java.util.List;',
    '@Service',
    'public class UserService {}',
  ].join('\n');
  const result = analyze(source, 'UserService.java');
  assert.equal(result.imports.length, 1);
  assert.equal(result.classes[0].name, 'UserService');
  assert.deepEqual(result.classes[0].annotations, ['Service']);
});

test('Java analyzer: hasMain is true for a main method', () => {
  const source = [
    'public class Hello {',
    '  public static void main(String[] args) { System.out.println("hi"); }',
    '}',
  ].join('\n');
  const result = analyze(source, 'Hello.java');
  assert.equal(result.hasMain, true);
});

