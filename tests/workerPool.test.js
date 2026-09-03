import test from 'node:test';
import assert from 'node:assert';
import { createPool } from '../server/workerPool.js';

test('Worker Pool', async () => {
  const pool = createPool('./server/scanWorker.js', 1);
  // This will fail because scanWorker is a real file but it expects source etc.
  try {
    const res = await pool.exec({ source: 'let x = 1;', path: 'test.js', langId: 'javascript' });
    assert.ok(res.complexity !== undefined);
  } finally {
    pool.terminate();
  }
});
