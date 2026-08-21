// Escaping at the boundary — one implementation, used everywhere.
//
// Onboarder renders content it does not control: file and folder names from a
// repository that may have been cloned from an arbitrary git URL, READMEs,
// GitHub API fields, and model output. All of it reaches the DOM as HTML
// strings, and a good deal of it lands inside attributes
// (`title="…"`, `data-path="…"`). So quotes matter as much as angle brackets:
// a file named `x" onmouseover="…` closes the attribute and opens a handler,
// and double quotes are legal in filenames on macOS and Linux.
//
// This used to be five near-copies — four of which escaped only & < > — with
// the attribute call sites quietly relying on the one that didn't. Now there
// is one function and it escapes all five characters.
//
// Single pass, one regex, one lookup per match: strictly cheaper than the
// chain of four .replace() calls it replaces, which matters because the
// syntax highlighter runs this over every token of every file.

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const NEEDS_ESCAPE = /[&<>"']/g;

/**
 * Make a string safe to interpolate into HTML — as text, or inside a
 * double- or single-quoted attribute value.
 */
export function escapeHtml(s) {
  return String(s ?? '').replace(NEEDS_ESCAPE, (c) => ESCAPES[c]);
}

// Whitespace and C0/C1 control characters, which browsers ignore when they
// parse a URL scheme — so `java\tscript:alert(1)` is a live javascript: URL.
const URL_NOISE = /[\s\u0000-\u001F\u007F-\u009F]/g;

/**
 * A URL safe to put in an href. Anything that isn't plainly http(s) comes back
 * empty, which keeps `javascript:`, `data:` and `vbscript:` out of the DOM
 * even when the surrounding markup is assembled by hand.
 */
export function safeUrl(url) {
  const raw = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(raw.replace(URL_NOISE, ''))) return '';
  return escapeHtml(raw);
}
