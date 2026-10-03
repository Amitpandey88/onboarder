import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScanRequest } from '../server/scanRequest.js';
import { scanOptionsFromFlags } from '../cli/scanOptions.js';

test('scan requests validate their source before any I/O', () => {
  for (const body of [null, [], 'repo', {}, { path: 42 }, { path: '' }, { gitUrl: [] }, { demo: 'yes' }, { path: '.', demo: true }]) {
    assert.throws(() => parseScanRequest(body), TypeError);
  }
  assert.deepEqual(parseScanRequest({ path: ' ~/repo ' }), { path: '~/repo', options: {} });
  assert.deepEqual(parseScanRequest({ demo: true, options: { maxFiles: 12, readConcurrency: 2 } }), {
    demo: true, options: { maxFiles: 12, readConcurrency: 2 },
  });
});

test('HTTP scan options reject malformed values and do not accept callbacks', () => {
  for (const options of [[], false, { maxFiles: '100' }, { maxFiles: 0 }, { maxFileSize: null }, { readConcurrency: 33 }]) {
    assert.throws(() => parseScanRequest({ path: '.', options }));
  }
  const request = parseScanRequest({ path: '.', options: { signal: {}, onProgress: 'code', maxFiles: 2 } });
  assert.deepEqual(request.options, { maxFiles: 2 });
});

test('CLI scan flags become validated numeric options', () => {
  assert.deepEqual(scanOptionsFromFlags({ maxFiles: '10', maxFileSize: '4096', readConcurrency: '2', json: true }), {
    maxFiles: 10, maxFileSize: 4096, readConcurrency: 2,
  });
  for (const value of ['not-a-number', '', '0', '1.5']) {
    assert.throws(() => scanOptionsFromFlags({ maxFiles: value }), /maxFiles/);
  }
});
