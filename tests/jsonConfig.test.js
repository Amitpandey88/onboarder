import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonConfig } from '../shared/analyzer/jsonConfig.js';
import { scanRepo } from '../shared/analyzer/scan.js';
import { memSource } from './helpers.js';

test('JSONC preserves glob paths and quoted comment markers', () => {
  const parsed = parseJsonConfig(`{
    // real comment
    "paths": { "/js/*": ["src/public/js/*"], },
    "include": ["src/**/*.ts",],
    "url": "https://example.com/a//b",
    "quoted": "escaped \\\" // still a string",
    /* block comment */ "enabled": true,
  }`);
  assert.deepEqual(parsed.paths, { '/js/*': ['src/public/js/*'] });
  assert.equal(parsed.url, 'https://example.com/a//b');
  assert.deepEqual(parsed.include, ['src/**/*.ts']);
  assert.equal(parsed.quoted, 'escaped " // still a string');
  assert.throws(() => parseJsonConfig('{ /* never closed'), SyntaxError);
});

test('slash aliases resolve to TypeScript source through JSONC configs', async () => {
  const source = memSource({
    'tsconfig.json': '{ "compilerOptions": { "paths": { "/js/*": ["src/public/js/*"], }, }, "include": ["src/**/*.ts"], }',
    'src/public/app.ts': "import { value } from '/js/value.js'; export const app = value;",
    'src/public/js/value.ts': 'export const value = 1;',
  });
  const scan = await scanRepo(source);
  assert.deepEqual(scan.edges.map(({ from, to }) => [from, to]), [['src/public/app.ts', 'src/public/js/value.ts']]);
  assert.equal(scan.stats.imports.confidence, 100);
});

for (const outputRoot of ['.', 'dist']) {
  test(`runtime imports map back to source when outDir is ${outputRoot}`, async () => {
    const prefix = outputRoot === '.' ? '' : 'dist/';
    const scan = await scanRepo(memSource({
      'tsconfig.json': JSON.stringify({ compilerOptions: { rootDir: 'src', outDir: outputRoot } }),
      'src/shared/value.ts': 'export const value = 1;',
      'tests/value.test.js': `import { value } from '../${prefix}shared/value.js'; console.log(value);`,
    }));
    assert.deepEqual(scan.edges.map(({ from, to }) => [from, to]), [['tests/value.test.js', 'src/shared/value.ts']]);
    assert.equal(scan.stats.imports.confidence, 100);
  });
}
