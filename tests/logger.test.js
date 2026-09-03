import test from 'node:test';
import assert from 'node:assert';
import { createLogger } from '../server/logger.js';

test('Logger', () => {
  const logger = createLogger('error');
  assert.ok(logger.info);
});
