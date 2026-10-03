import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserFileSource } from '../public/js/fileSourceBrowser.js';
import { scanRepo } from '../shared/analyzer/scan.js';

function fileHandle(name, text) {
  return { kind: 'file', name, async getFile() { return { size: Buffer.byteLength(text), async text() { return text; } }; } };
}

test('browser file source distinguishes directory and file handles', async () => {
  const root = { kind: 'directory', name: 'repo', async *entries() { yield ['a.ts', fileHandle('a.ts', 'export const a = 1;')]; } };
  const source = browserFileSource(root);
  assert.deepEqual(await source.list(''), [{ name: 'a.ts', path: 'a.ts', type: 'file' }]);
  assert.equal(await source.read('a.ts'), 'export const a = 1;');
  await assert.rejects(source.read(''), /No file handle/);
  await assert.rejects(source.list('a.ts'), /No directory handle/);
});

test('browser permission failures are counted instead of appearing as empty folders', async () => {
  const restricted = { kind: 'directory', name: 'restricted', async *entries() { throw new Error('Permission denied'); } };
  const root = { kind: 'directory', name: 'repo', async *entries() {
    yield ['a.ts', fileHandle('a.ts', 'export const a = 1;')];
    yield ['restricted', restricted];
  } };
  const scan = await scanRepo(browserFileSource(root));
  assert.equal(scan.files.length, 1);
  assert.equal(scan.stats.skips.listFailed, 1);
});
