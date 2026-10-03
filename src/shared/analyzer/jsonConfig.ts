/** Parse TypeScript's JSON-with-comments configs without altering quoted paths. */
export function parseJsonConfig(text: string): unknown {
  const characters = text.split('');
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character === '\\') i++;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') characters[i++] = ' ';
    } else if (character === '/' && text[i + 1] === '*') {
      characters[i++] = ' ';
      characters[i++] = ' ';
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] !== '\n' && text[i] !== '\r') characters[i] = ' ';
        i++;
      }
      if (i >= text.length) throw new SyntaxError('Unterminated config comment.');
      characters[i++] = ' ';
      characters[i] = ' ';
    }
  }
  // JSONC also accepts trailing commas. Handle them only outside strings.
  quoted = false;
  for (let i = 0; i < characters.length; i++) {
    const character = characters[i];
    if (quoted) {
      if (character === '\\') i++;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character !== ',') continue;
    let next = i + 1;
    while (next < characters.length && /\s/.test(characters[next])) next++;
    if (characters[next] === '}' || characters[next] === ']') characters[i] = ' ';
  }
  return JSON.parse(characters.join('')) as unknown;
}
