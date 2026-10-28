import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DesktopStore } from '../src/store.mjs';

test('credentials are encrypted, optional, removable, and never stored in plaintext', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-vault-'));
  let available = true;
  const crypto = { isAsyncEncryptionAvailable: async () => available, encryptStringAsync: async value => Buffer.from(value.split('').reverse().join('')), decryptStringAsync: async bytes => bytes.toString().split('').reverse().join('') };
  try {
    const store = new DesktopStore(dir, crypto); const endpoint = 'https://provider.example/v1';
    assert.equal(await store.credential('get', endpoint), null);
    await store.credential('set', endpoint, 'private-test-value');
    assert.equal(await store.credential('get', endpoint), 'private-test-value');
    const bytes = await fs.readFile(path.join(dir, 'credentials.json'), 'utf8'); assert.ok(!bytes.includes('private-test-value')); assert.ok(!bytes.includes(endpoint));
    assert.equal((await fs.stat(path.join(dir, 'credentials.json'))).mode & 0o777, 0o600);
    available = false;
    await assert.rejects(store.credential('set', endpoint, 'another-secret'), /Keychain/);
    assert.equal(await fs.readFile(path.join(dir, 'credentials.json'), 'utf8'), bytes);
    await store.credential('delete', endpoint); assert.equal(await store.credential('get', endpoint), null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('simultaneous project updates preserve distinct histories and settings', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-projects-'));
  try {
    const store = new DesktopStore(dir, {});
    await Promise.all(Array.from({ length: 15 }, (_, i) => store.remember('/projects/repo-' + i)));
    const recents = await store.recents(); assert.equal(recents.length, 12); assert.equal(new Set(recents.map(v => v.path)).size, 12);
    await Promise.all([store.update('windows', state => ({ ...state, alpha: { width: 1200 } })), store.update('windows', state => ({ ...state, beta: { width: 1400 } }))]);
    assert.deepEqual(await store.read('windows'), { alpha: { width: 1200 }, beta: { width: 1400 } });
    await store.clearRecents(); assert.deepEqual(await store.recents(), []);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
