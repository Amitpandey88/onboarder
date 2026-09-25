import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

import { createLogger, formatEntry, formatMessage, logEntry, SEVERITY } from '../server/logger.js';

// Collects writes so a test can assert on the exact bytes a log line produces.
function capture() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, done) { lines.push(String(chunk)); done(); },
  });
  stream.lines = lines;
  return stream;
}

test('Logger', () => {
  const logger = createLogger('error');
  assert.ok(logger.info);
});

test('a level below the threshold writes nothing at all', () => {
  const out = capture();
  const logger = createLogger('warn', { stdout: out, stderr: out, color: false });
  logger.debug('quiet');
  logger.info('also quiet');
  logger.warn('loud');
  assert.equal(out.lines.length, 1);
  assert.match(out.lines[0], /loud/);
});

test('warn and error go to stderr, everything else to stdout', () => {
  const out = capture();
  const err = capture();
  const logger = createLogger('debug', { stdout: out, stderr: err, color: false });
  logger.info('fine');
  logger.warn('iffy');
  logger.error('broken');
  assert.equal(out.lines.length, 1);
  assert.equal(err.lines.length, 2);
});

test('the JSON face is one parseable object per line, with a local time field', () => {
  const out = capture();
  const logger = createLogger('debug', { stdout: out, stderr: out, format: 'json' });
  logger.http({ method: 'GET', path: '/api/health', status: 200, ms: 3 });
  const entry = JSON.parse(out.lines[0]);
  assert.equal(entry.method, 'GET');
  assert.equal(entry.status, 200);
  // A `time` a human can read, beside the ISO `ts` a machine can parse.
  assert.match(entry.time, /^\d\d:\d\d:\d\d\.\d\d\d$/);
  assert.match(entry.ts, /^\d{4}-\d\d-\d\dT/);
});

test('the pretty face is column-aligned, so lines of different length still line up', () => {
  const info = formatEntry(logEntry('info', 'http', { method: 'GET', path: '/api/health', status: 200, ms: 3 }));
  const error = formatEntry(logEntry('error', 'http', { method: 'DELETE', path: '/api/scan/abcdef012345', status: 500, ms: 1200 }));
  const warn = formatEntry(logEntry('warn', 'config', { reason: 'port busy' }));

  // time(12) + gutter(2) + level(5) + gutter(2) = the message starts at column 21.
  assert.match(info, /^\d\d:\d\d:\d\d\.\d\d\d {2}INFO {3}GET \/api\/health 200 \(3ms\)$/);
  for (const line of [info, error, warn]) {
    assert.equal(line.slice(0, 12).length, 12, 'the time column is a fixed width');
    assert.equal(line.slice(14, 19), line.slice(14, 19).toUpperCase().padEnd(5), 'the level column is a fixed 5');
    assert.equal(line.slice(19, 21), '  ', 'the gutter is a fixed 2');
  }
  // A 3-letter level and a 5-letter level put their messages in the same place.
  assert.equal(info.indexOf('GET'), error.indexOf('DELETE'));
  assert.equal(info.indexOf('GET'), warn.indexOf('config'));
});

test('extra fields are appended as key=value, and envelope keys are not repeated', () => {
  const entry = logEntry('warn', 'could not write the run record', { file: '/tmp/x.json', error: 'EACCES' });
  const message = formatMessage(entry);
  assert.match(message, /^could not write the run record file=\/tmp\/x\.json error="?EACCES"?$/);
  assert.ok(!message.includes('ts='), 'the envelope is not re-printed as data');
  assert.ok(!message.includes('level='));
});

test('a 5xx request logs as an error, a 404 does not', () => {
  const out = capture();
  const err = capture();
  const logger = createLogger('debug', { stdout: out, stderr: err, color: false });
  logger.http({ method: 'GET', path: '/nope', status: 404, ms: 1 });
  logger.http({ method: 'POST', path: '/api/scan', status: 500, ms: 9 });
  assert.match(out.lines[0], /INFO {3}GET \/nope 404/);
  assert.match(err.lines[0], /ERROR {2}POST \/api\/scan 500/);
});

test('severity is ordered worst-first for any summary built from it', () => {
  const order = ['error', 'warn', 'info', 'debug'].sort((a, b) => SEVERITY[a] - SEVERITY[b]);
  assert.deepEqual(order, ['error', 'warn', 'info', 'debug']);
});

test('color is off unless asked for, so a piped or logged line stays plain', () => {
  const entry = logEntry('error', 'broken');
  assert.ok(!formatEntry(entry).includes('\x1b'), 'formatEntry never styles');
  const painted = createLogger('error', { stdout: capture(), stderr: capture(), color: true, format: 'pretty' });
  assert.ok(painted.error, 'the colored logger is constructible');
});
