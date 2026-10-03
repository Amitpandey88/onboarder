import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanRepo } from '../shared/analyzer/scan.js';
import { abortable, normalizeScanOptions, utf8ByteLength } from '../shared/analyzer/scanControl.js';
import { memSource } from './helpers.js';

const repository = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [
  `file${String(i).padStart(2, '0')}.ts`,
  i ? `import { value } from './file00.js'; export const v${i} = value;` : 'export const value = 1;',
]));

test('invalid scan limits fail before reading the repository', async () => {
  let reads = 0;
  const source = { ...memSource(repository), async read() { reads++; return ''; } };
  for (const value of [0, -1, 1.5, NaN, Infinity, '4']) {
    await assert.rejects(scanRepo(source, { maxFiles: value }), /maxFiles must be a whole number/);
  }
  await assert.rejects(scanRepo(source, { readConcurrency: 33 }), /readConcurrency/);
  await assert.rejects(scanRepo(source, { maxFileSize: 10 * 1024 * 1024 + 1 }), /maxFileSize/);
  assert.equal(reads, 0);
  assert.equal(normalizeScanOptions({}).readConcurrency, 8);
});

test('an already cancelled scan does no filesystem work', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const source = { ...memSource(repository), async read() { calls++; return ''; }, async list() { calls++; return []; } };
  await assert.rejects(scanRepo(source, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('cancellation interrupts a pending directory read promptly', async () => {
  const controller = new AbortController();
  let started;
  const waiting = new Promise((resolve) => { started = resolve; });
  const source = { ...memSource(repository), async list() { started(); return new Promise(() => {}); } };
  const scanning = scanRepo(source, { signal: controller.signal });
  await waiting;
  controller.abort();
  await assert.rejects(scanning, { name: 'AbortError' });
});

test('cancellation interrupts pending file reads and stops scheduling more', async () => {
  const controller = new AbortController();
  const original = memSource(repository);
  let reads = 0;
  let started;
  const waiting = new Promise((resolve) => { started = resolve; });
  const source = { ...original, async read(path) {
    if (!path.endsWith('.ts')) return original.read(path);
    reads++;
    started();
    return new Promise(() => {});
  } };
  const scanning = scanRepo(source, { signal: controller.signal, readConcurrency: 2 });
  await waiting;
  controller.abort();
  await assert.rejects(scanning, { name: 'AbortError' });
  assert.ok(reads <= 2, `Only the read window should start; got ${reads}`);
});

test('late read failures remain observed after cancellation', async () => {
  const controller = new AbortController();
  let rejectRead;
  const pending = new Promise((_, reject) => { rejectRead = reject; });
  const waiting = abortable(pending, controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  rejectRead(new Error('late I/O error'));
  await new Promise((resolve) => setImmediate(resolve));
});

test('read concurrency is bounded and results are deterministic', async () => {
  const original = memSource(repository);
  let active = 0;
  let peak = 0;
  const source = { ...original, async read(path) {
    if (!path.endsWith('.ts')) return original.read(path);
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, path.includes('01') ? 5 : 1));
    active--;
    return original.read(path);
  } };
  const sequential = await scanRepo(original, { readConcurrency: 1 });
  const concurrent = await scanRepo(source, { readConcurrency: 3 });
  assert.ok(peak <= 3);
  assert.ok(peak > 1);
  assert.deepEqual(concurrent.files, sequential.files);
  assert.deepEqual(concurrent.edges, sequential.edges);
  assert.deepEqual(concurrent.stats.skips, sequential.stats.skips);
  assert.deepEqual(concurrent.stats.imports, sequential.stats.imports);
});

test('Unicode source sizes and limits use UTF-8 bytes', async () => {
  for (const text of ['', 'ascii', 'é漢字', '😀', '\ud800', '\udc00', '\ud800x']) {
    assert.equal(utf8ByteLength(text), Buffer.byteLength(text, 'utf8'));
  }
  const text = 'export const greeting = "नमस्ते 🌍";';
  const tooSmall = await scanRepo(memSource({ 'hello.ts': text }), { maxFileSize: text.length });
  assert.equal(tooSmall.files.length, 0);
  assert.equal(tooSmall.stats.skips.tooLarge, 1);
  const exact = await scanRepo(memSource({ 'hello.ts': text }), { maxFileSize: Buffer.byteLength(text) });
  assert.equal(exact.files[0].size, Buffer.byteLength(text));
});

test('progress ends with completion and includes the parse total', async () => {
  const events = [];
  const scan = await scanRepo(memSource(repository), { onProgress: (event) => events.push(event) });
  assert.ok(events.some((event) => event.phase === 'parse' && event.total === 20));
  assert.ok(events.some((event) => event.phase === 'resolve'));
  assert.deepEqual(events.at(-1), { phase: 'complete', files: 20, edges: scan.edges.length });
});
