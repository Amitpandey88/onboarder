/** Small path glob vocabulary: * (one segment), ** (any depth), ? (one character). */
export function matchesReviewPath(path: string, pattern: string): boolean {
  // Dynamic programming avoids exponential regex backtracking on repository input.
  const tokens: string[] = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { tokens.push('directory'); i++; } else tokens.push('all');
    } else tokens.push(pattern[i] === '*' ? 'segment' : pattern[i] === '?' ? 'character' : 'literal:' + pattern[i]);
  }
  let dp = new Uint8Array(path.length + 1); dp[0] = 1;
  for (const token of tokens) {
    const next = new Uint8Array(path.length + 1);
    if (token === 'directory') {
      let started = false;
      for (let j = 0; j <= path.length; j++) {
        if (dp[j]) { next[j] = 1; started = true; }
        if (j > 0 && started && path[j - 1] === '/') next[j] = 1;
      }
    } else if (token === 'all' || token === 'segment') {
      next[0] = dp[0];
      for (let j = 1; j <= path.length; j++) next[j] = dp[j] || (next[j - 1] && (token === 'all' || path[j - 1] !== '/') ? 1 : 0);
    } else {
      for (let j = 0; j < path.length; j++) if (dp[j] && (token === 'character' ? path[j] !== '/' : path[j] === token.slice(8))) next[j + 1] = 1;
    }
    dp = next;
  }
  return Boolean(dp[path.length]);
}
