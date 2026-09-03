import test from 'node:test';
import assert from 'node:assert';
import { analyzeChurn } from '../shared/analyzer/churn.js';

test('Churn Analysis', () => {
  const commits = [{ date: Date.now(), author: 'me', changes: [{path: 'a'}] }];
  const result = analyzeChurn(commits, { files: [{path: 'a', complexity: 25}] });
  assert.ok(result.fileChurn.has('a'));
  // High churn because 1 commit in 90 days scales to a lot? Wait, commitsIn90Days is 1.
});
