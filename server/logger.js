// Every line Onboarder writes, in two faces.
//
// The entry itself is data — `{ ts, time, level, msg, ...fields }` — and the
// renderer decides how it looks. JSON goes to pipes, log files and anything
// parsing us; the aligned human line goes to a terminal. Picking the face once,
// here, is what keeps a log file readable *and* machine-parseable instead of
// half one thing.
//
// A `time` field (local HH:MM:SS.mmm) rides along with the ISO `ts` on purpose:
// tailing a file gives you the string, not a Date, and a reader wants their own
// clock, not UTC.

const levels = { debug: 0, info: 1, warn: 2, error: 3 };

// Worst first — the order any summary or sort should use.
export const SEVERITY = { error: 0, warn: 1, info: 2, debug: 3 };

const CODES = { red: 31, green: 32, yellow: 33, cyan: 36, gray: 90 };
const LEVEL_COLOR = { debug: 'gray', info: 'cyan', warn: 'yellow', error: 'red' };

// The server sits *under* the CLI, so it cannot import `cli/ui.js` without
// inverting the dependency. These three lines of ANSI are the whole price.
function paint(text, color, enabled) {
  return enabled && color ? `\x1b[${CODES[color]}m${text}\x1b[0m` : String(text);
}

// Fields that are part of the envelope or already rendered into the message.
const ENVELOPE = new Set(['ts', 'time', 'level', 'msg', 'method', 'path', 'status', 'ms', 'line', 'scope']);

// One line, no styling: what a log file holds and what a test asserts on.
export function formatMessage(entry) {
  if (entry.line) return `${entry.msg ?? ''} ${entry.line}`.trim();
  if (entry.method) {
    const status = entry.status === undefined ? '' : ` ${entry.status}`;
    const took = entry.ms === undefined ? '' : ` (${entry.ms}ms)`;
    return `${entry.method} ${entry.path}${status}${took}`;
  }
  const extra = Object.entries(entry)
    .filter(([key, value]) => !ENVELOPE.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
  return [entry.msg ?? '', ...extra].filter(Boolean).join(' ');
}

// Every log line is `time  LEVEL  message`, with the level in a fixed 5-wide
// column so the messages of an `INFO` and a `ERROR` line start at the same
// offset. That alignment is the entire point: a wall of request logs is only
// scannable if the eye can find the message column without reading.
const LEVEL_WIDTH = 5;
const GUTTER = '  ';

export function formatEntry(entry) {
  const time = String(entry.time || String(entry.ts || '').slice(11, 23));
  const level = String(entry.level || 'info').toUpperCase().padEnd(LEVEL_WIDTH);
  return `${time}${GUTTER}${level}${GUTTER}${formatMessage(entry)}`;
}

export function renderEntry(entry, { color = false } = {}) {
  const time = String(entry.time || String(entry.ts || '').slice(11, 19));
  const level = String(entry.level || 'info').toUpperCase().padEnd(LEVEL_WIDTH);
  return paint(time, 'gray', color) + GUTTER + paint(level, LEVEL_COLOR[entry.level] || 'gray', color) + GUTTER + formatMessage(entry);
}

export function logEntry(level, msg, extra = {}) {
  const now = new Date();
  return {
    ts: now.toISOString(),
    // Built from the local parts, not `toTimeString()`: that carries a timezone
    // abbreviation whose width changes (`GMT` vs ` PDT`), which is exactly what
    // makes a log column ragged. Always 12 characters, always the reader's clock.
    time: [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((part) => String(part).padStart(2, '0'))
      .join(':') + '.' + String(now.getMilliseconds()).padStart(3, '0'),
    level,
    msg,
    ...extra,
  };
}

export function createLogger(level = process.env.LOG_LEVEL || 'info', options = {}) {
  const minLevel = levels[level] ?? levels.info;
  // `pretty` is the default for a terminal *and* for a log file (aligned text is
  // what a person reads at 2am); `ONBOARDER_LOG=json` is the machine escape
  // hatch, and so is a non-TTY consumer that parses stdout.
  const format = options.format || process.env.ONBOARDER_LOG || 'pretty';
  const color = options.color ?? (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
  const out = options.stdout || process.stdout;
  const err = options.stderr || process.stderr;

  function write(entry) {
    if (format === 'json') {
      const line = JSON.stringify(entry) + '\n';
      (entry.level === 'warn' || entry.level === 'error' ? err : out).write(line);
      return;
    }
    (entry.level === 'warn' || entry.level === 'error' ? err : out).write(renderEntry(entry, { color }) + '\n');
  }

  function log(lvl, msg, extra = {}) {
    if (levels[lvl] < minLevel) return;
    write(logEntry(lvl, msg, extra));
  }

  return {
    debug: (msg, extra) => log('debug', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    http: (req) => log(req.status >= 500 ? 'error' : 'info', 'http', req),
  };
}
