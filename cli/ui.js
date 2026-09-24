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
