// Terminal geometry, with no color and no dependencies.
//
// This lives here, under `server/`, because two very different callers need
// identical layout: the CLI (which paints) and the server's own startup banner
// (which must not import `cli/ui.js` — that would invert the dependency, since
// the CLI sits on top of the server). So the *shape* is here and the *color* is
// injected by the caller as a `paint(text, style)` function.
//
// Everything is pure string math on purpose: a layout decision is a thing you
// want to unit-test without spawning a terminal, and the whole reason panels
// used to look broken is that this math was scattered through the callers.

export function width(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '').length;
}

// The terminal we are drawing into, asked at call time rather than cached at
// import: a panel printed after the user resized their window should use the
// new size. Falls back to COLUMNS, then 80, so a pipe or a log file still gets
// sane output instead of `undefined`.
export function termWidth(stream = process.stdout) {
  return stream.columns || Number(process.env.COLUMNS) || 80;
}

// Shorten to fit, with a real ellipsis. The middle is elided rather than the
// tail, because in a path or URL the end is the part that identifies it.
export function fit(text, max, { tail = true } = {}) {
  const value = String(text);
  if (max <= 0) return '';
  if (value.length <= max) return value;
  if (max === 1) return '…';
  if (!tail) return value.slice(0, max - 1) + '…';
  const head = Math.ceil((max - 1) * 0.4);
  const rest = max - 1 - head;
  return (head ? value.slice(0, head) + '…' : '…') + value.slice(value.length - rest);
}

// A titled block of rows that fits the terminal it is printed into. The frame is
// sized from its contents, then clamped to the available width, and every value
// is elided to fit rather than allowed to spill past the border — a panel whose
// right edge is off-screen is what makes output "mess the terminal".
//
// `paint` is injected: `(text, style) => string`, where style is 'label' or
// 'frame'. The default is identity, which is what the server banner and the
// `--no-color` path want.
export function panel(title, rows, { indent = '  ', columns, paint = (t) => String(t) } = {}) {
  // The hard ceiling is the terminal. A floor below it would be a lie: on a 40
  // column terminal a 59-wide panel is exactly the overflow this exists to
  // prevent, so the floor only guards against a nonsensical zero, and short
  // titles/values are handled by the `fit` calls below rather than by a minimum.
  const available = Math.max(24, (columns || termWidth()) - indent.length);
  const labelWidth = Math.min(12, Math.max(...rows.map((r) => width(r.label ?? '')), 0));
  // indent(2) + gap(2) + label + gap(2) + value + right border(2)
  const valueRoom = Math.max(8, available - 2 - labelWidth - 2 - 2);
  const body = rows.map((r) => (r.hint
    ? '  ' + ' '.repeat(labelWidth + 2) + paint(fit(r.hint, valueRoom), 'hint')
    : '  ' + paint(fit(r.label ?? '', labelWidth).padEnd(labelWidth), 'label') + '  ' + fit(r.value ?? '', valueRoom)));

  // Frame width = whatever the body needs, capped to what the terminal has.
  const wanted = Math.max(...body.map(width), 12);
  const inner = Math.max(8, Math.min(available - 2, wanted));
  const shownTitle = fit(title, Math.max(2, inner - 4));
  const top = paint('┌─ ', 'frame') + paint(shownTitle, 'title')
    + ' ' + paint('─'.repeat(Math.max(0, inner - shownTitle.length - 3)) + '┐', 'frame');
  const bottom = paint('└' + '─'.repeat(inner) + '┘', 'frame');
  return [top, ...body, bottom].map((line) => indent + line).join('\n');
}

// A one-line note rendered in the panel's muted voice.
export const hint = (text) => ({ hint: text });

// A label/value row. Values are stringified here so a caller can pass a number.
export const row = (label, value) => ({ label, value: String(value) });