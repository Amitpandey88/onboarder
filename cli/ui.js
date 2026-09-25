// Terminal paint: the few ANSI touches the CLI uses, all behind one flag.
//
// Everything goes through `paint` so --no-color, NO_COLOR, and a piped stdout
// all strip styling in one place. Nothing here is load-bearing — every message
// has to read fine as plain text, because that is how logs and CI see it.

export const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;

const CODES = {
  reset: 0, bold: 1, dim: 2, italic: 3,
  red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, gray: 90,
};

export function paint(text, ...styles) {
  if (!supportsColor || !styles.length) return String(text);
  const open = styles.map((s) => `\x1b[${CODES[s]}m`).join('');
  return `${open}${text}\x1b[0m`;
}

export const ok = (s) => paint(s, 'green');
export const warn = (s) => paint(s, 'yellow');
export const bad = (s) => paint(s, 'red');
export const dim = (s) => paint(s, 'gray');
export const bold = (s) => paint(s, 'bold');
export const cyan = (s) => paint(s, 'cyan');

// The wizard's welcome — one screen, says what the tool is and what the wizard
// is about to touch (one file), and how to leave. Modeled on the honesty of a
// good installer: no art, no spinner, no mystery.
export function welcomeBanner(version, configFile) {
  return [
    '',
    bold('  🧭 Onboarder setup') + dim(`  v${version}`),
    dim('  Drop a path. Get a map.'),
    '',
    '  This wizard asks a handful of questions and writes one file:',
    '    ' + cyan(configFile),
    dim('  Nothing is sent anywhere. Ctrl-C at any question cancels without writing.'),
    '',
  ].join('\n');
}

export function section(title) {
  return '\n' + bold(`  ── ${title} ` + '─'.repeat(Math.max(2, 46 - title.length)));
}

// Label/value rows, aligned — the banner, `config show`, and the doctor all
// print in this shape so output greps the same everywhere.
export function kv(label, value) {
  return '  ' + paint((label + ' ').padEnd(12), 'gray') + value;
}

export const tick = ok('  ✓ ');
export const cross = bad('  ✗ ');
export const dash = dim('  – ');

// Visible width, ANSI codes excluded. Padding has to be computed on what the
// terminal *shows*, not on the bytes we wrote, or every colored row grows a
// few columns and the column stops being a column.
export function width(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '').length;
}

// A titled block of rows. The box is drawn from the widest row rather than a
// fixed 80 columns, so it stays aligned in a narrow terminal and does not stretch
// across a wide one.
export function panel(title, rows, { indent = '  ' } = {}) {
  const labelWidth = Math.max(...rows.map((r) => width(r.label ?? '')), 0);
  // Every row starts two columns in; the label column is then as wide as the
  // longest label, so all the values line up regardless of label length.
  const body = rows.map((r) => r.hint
    ? '  ' + ' '.repeat(labelWidth + 4) + dim(r.hint)
    : '  ' + paint((r.label ?? '').padEnd(labelWidth), 'gray') + '  ' + (r.value ?? ''));
  // The frame is sized from its contents: a long path widens the box instead of
  // spilling out of it, and a short one does not stretch to 80 columns.
  const inner = Math.max(title.length + 4, ...body.map(width), 24);
  const top = '┌─ ' + bold(title) + ' ' + '─'.repeat(Math.max(1, inner - title.length - 3)) + '┐';
  const bottom = '└' + '─'.repeat(inner) + '┘';
  return [top, ...body, bottom].map((line) => indent + (line === top || line === bottom ? paint(line, 'gray') : line)).join('\n');
}

// A one-line hint under a row, wrapped in the panel's dim voice.
export const hint = (text) => ({ hint: text });

// Multi-line values (a command, a path list) still align on the first line.
export function row(label, value) {
  return { label, value: String(value) };
}

