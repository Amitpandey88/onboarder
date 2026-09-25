// Word-wrap plain text to the terminal, preserving the indent on continuation
// lines.
//
// This lives in its own module because two callers need it: the views, which
// wrap the engine's long prose, and the command table, which fits its help
// screen. Both must agree on the same edge behavior, or the same string comes
// out two different widths depending on who printed it.
//
// Applied *before* painting, so the wrap never has to understand ANSI: the
// styled string is built from already-wrapped plain text.
//
// `room` is clamped to at least one cell. Without that floor, a terminal
// narrower than the indent drives `room` to zero or below, the hard-split loop
// slices a word to the empty string and re-reads the same word forever, and the
// session hangs instead of printing. A tool that reads code should degrade on a
// tiny terminal, never wedge on one.

import { termWidth } from '../ui.js';

export function wrapText(text, indent = '  ', room = termWidth() - indent.length) {
  const cell = Math.max(1, Math.floor(room));
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!line) {
        line = word;
      } else if (line.length + 1 + word.length <= cell) {
        line += ' ' + word;
      } else {
        out.push(indent + line);
        line = word;
      }
      // A single word longer than the room is hard-split rather than allowed to
      // overflow — a long import specifier is exactly the case that shows up.
      // `cell >= 1` guarantees each pass consumes a character and terminates.
      while (line.length > cell) {
        out.push(indent + line.slice(0, cell));
        line = line.slice(cell);
      }
    }
    out.push(indent + line);
  }
  return out.join('\n');
}
