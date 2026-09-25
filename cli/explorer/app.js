// The interactive session.
//
// This is a prompt, not a full-screen TUI, and that is a deliberate choice.
// A curses app takes the scrollback, the selection, and copy-paste away, and it
// behaves badly over SSH and inside a tmux pane — which is exactly where people
// read a codebase. A readline session keeps all of that, prints scrollable
// output you can select, and degrades to something scriptable. The research
// agrees: a CLI is a conversation, and a TUI earns its cost only when you are
// manipulating state with the keyboard rather than reading.
//
// Two rules from the design research are load-bearing here:
//   * TTY detection. A session that needs a terminal must never be started by a
//     pipe, a cron job, or CI — so `runExplore` refuses and explains instead of
//     hanging forever waiting for input nobody is there to type.
//   * Flags → env → config precedence. `NO_COLOR` and `COLUMNS` are honored
//     before anything is drawn, so a redirect gets plain, fitted text.

import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

import { openRepo } from './session.js';
import { CLEAR, EXIT, commandNames, helpText, lookup, tokenize } from './commands.js';
import { overview } from './views.js';
import { bold, cyan, dim, ok, bad, paint } from '../ui.js';
import { configPath, readSettings, serverUrls } from '../../server/config.js';
import { readPidFile, pidIsAlive } from '../../server/pidfile.js';

const VERSION = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

// The one-time note. `onboarder` used to start a web server; now it opens this.
// Someone who upgrades and has muscle memory for the old thing deserves to be
// told once where the server went, and then never again.
const HINT_MARKER = 'explorer-hint-v1';

export async function runExplore({ target = '.', flags = {}, out = console.log, err = console.error, version = VERSION } = {}) {
  // The guard. `stdin` matters as much as `stdout`: a session with no input
  // source is a hang, and a hang in CI is worse than any error.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    out('');
    out('  The terminal explorer needs an interactive terminal.');
    out(dim('    In a script or a pipe, use these instead:'));
    out(dim('      onboarder start              start the web UI'));
    out(dim('      onboarder start background   start it detached'));
    out(dim('      onboarder status | stop      manage a running one'));
    out(dim('      onboarder --help             everything else'));
    out('');
    return 0;
  }

  let repo;
  try {
    repo = await openRepo(target, { onProgress: progressReporter(out) });
  } catch (e) {
    err('  ' + bad((e.message || String(e))));
    err(dim('    Point it at a folder: onboarder explore /path/to/repo'));
    return 1;
  }

  out('');
  out(overview(repo));
  out('');
  if (await shouldShowHint(flags)) {
    out(dim('  Note: `onboarder` used to start the web server. That is now `onboarder start`'));
    out(dim('        (or the `web` command here) — this session reads the repo directly,'));
    out(dim('        so it needs no server and works offline.'));
    out('');
  }
  return session({ repo, flags, out, err, version });
}

// Scanning a large monorepo is the one genuinely slow thing this does, so it
// says so. A silent eight seconds is indistinguishable from a hang.
function progressReporter(out) {
  let last = 0;
  return ({ phase, done }) => {
    if (!process.stdout.isTTY) return;
    const now = Date.now();
    if (phase === 'parse' && done && now - last > 400) {
      last = now;
      out(dim(`\r  scanning… ${done} files`));
    }
  };
}

async function shouldShowHint(flags) {
  if (process.env.ONBOARDER_NO_HINT) return false;
  try {
    const marker = path.join(path.dirname(flags.config || configPath()), HINT_MARKER);
    const seen = await fs.promises.stat(marker).then(() => true).catch(() => false);
    if (seen) return false;
    await fs.promises.mkdir(path.dirname(marker), { recursive: true });
    await fs.promises.writeFile(marker, 'shown\n');
    return true;
  } catch {
    // A read-only config home is not a reason to nag on every launch.
    return false;
  }
}

// The read loop. Commands are queued rather than awaited inline, because
// readline emits the next line while a slow command is still running and two
// interleaved `cd`s would leave the session pointing at a repo nobody asked
// for.
function session({ repo, flags, out, err, version }) {
  const ctx = {
    repo,
    version,
    flags,
    help: (topic) => helpText(ctx, topic),
    rescan: () => reload(ctx, ctx.repo.root),
    loadRepo: (where) => reload(ctx, where),
    web: () => startWeb(ctx),
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptFor(repo),
    terminal: true,
    historySize: 200,
  });

  let queue = Promise.resolve();
  let closed = false;
  let interrupts = 0;

  rl.on('line', (line) => {
    queue = queue.then(() => handleLine(ctx, line, rl, out, err));
  });

  // Ctrl-D on an empty line is the universal "I'm done". On a line with text,
  // readline handles it itself; this only sees the empty-line case.
  //
  // Closing does NOT end the session. A piped or fast-typed sequence of commands
  // can already be queued when the last line arrives, and resolving here would
  // throw those away mid-flight — which is exactly what happens to `tour` when
  // its input is followed immediately by `exit`. The exit waits on the queue.
  rl.on('close', () => {
    closed = true;
    process.stdout.off('resize', onResize);
  });

  // Ctrl-C twice leaves. Once clears the line, which is what readline already
  // does, and matches every other REPL people use.
  rl.on('SIGINT', () => {
    if (closed) return;
    interrupts++;
    if (interrupts >= 2) {
      rl.close();
      return;
    }
    out(dim('\n  Ctrl-C again to leave.'));
    rl.setPrompt(promptFor(ctx.repo));
    rl.prompt();
  });

  // A resize redraws rather than leaving the prompt stranded mid-wrap.
  const onResize = () => {
    if (!closed) rl.write(null, { ctrl: true, name: 'l' });
  };
  process.stdout.on('resize', onResize);

  queue = queue.then(() => rl.prompt());

  return new Promise((resolve) => {
    const poll = setInterval(() => {
      if (!closed) return;
      clearInterval(poll);
      // Drain whatever is still running, then say goodbye. A command that throws
      // has already been caught in `handleLine`, so this cannot reject.
      queue.then(() => {
        out('');
        out(dim('  bye.'));
        resolve(0);
      });
    }, 20);
  });
}

function promptFor(repo) {
  return paint('  ', 'cyan') + bold(repo.name.slice(0, 24)) + paint(' > ', 'gray');
}

async function handleLine(ctx, line, rl, out, err) {
  const words = tokenize(line);
  if (!words.length) {
    rl.prompt();
    return;
  }
  const [name, ...args] = words;
  const cmd = lookup(name);

  if (!cmd) {
    // The nearest command by edit distance is almost always what was meant, and
    // a one-line "did you mean" beats a paragraph about `help`.
    const near = nearest(name);
    err('  ' + bad('Unknown command: ' + name) + (near ? dim('  did you mean `' + near + '`?') : dim('  try `help`')));
    rl.prompt();
    return;
  }

  try {
    const result = await cmd.run(ctx, args);
    if (result === EXIT) {
      rl.close();
      return;
    }
    if (result === CLEAR) {
      out('\x1b[2J\x1b[3J\x1b[H');
    } else if (result) {
      out(result);
    }
  } catch (e) {
    err('  ' + bad((e.message || String(e))));
  }
  // The prompt carries the repo name, and `cd` can change which repo that is.
  // Re-reading it after every command is cheaper than tracking which commands
  // swap the repo, and it cannot go stale.
  rl.setPrompt(promptFor(ctx.repo));
  rl.prompt();
}

// Swap the loaded repo. Used by `cd` and `rescan`; the scan is the slow part,
// so the new name reaches the prompt only after it succeeds.
async function reload(ctx, where) {
  const target = String(where || '').trim();
  if (!target) return '  cd needs a folder — `cd ../other-repo`.';
  const next = await openRepo(target, { onProgress: () => {} });
  ctx.repo = next;
  return '\n' + overview(next);
}

// The bridge between the two surfaces. If the server is already up this just
// prints where it is; if not, it starts it detached, so the person keeps their
// session. The URL is the same one `onboarder start` would print, because it
// comes from the same `serverUrls` the CLI and the banner use.
async function startWeb(ctx) {
  const file = ctx.flags.config || configPath();
  const settings = await readSettings(file).catch(() => null);
  const urls = serverUrls(settings || undefined);
  const recorded = readPidFile(file);

  if (recorded && pidIsAlive(recorded)) {
    return ['  ' + ok('Already running.') + dim(`  PID ${recorded.pid}`), '    ' + cyan(urls.local)].join('\n');
  }

  const { runStartBackground } = await import('../commands.js');
  const code = await runStartBackground({
    flags: { ...ctx.flags, json: true },
    out: () => {},
    err: () => {},
  });
  if (code !== 0) return '  ' + bad('Could not start the web UI.') + dim('  Try `onboarder doctor`.');
  return [
    '  ' + ok('Web UI started in the background.'),
    '    ' + cyan(urls.local),
    dim('    onboarder logs -f to watch it · onboarder stop to shut it down'),
  ].join('\n');
}

// Cheap "did you mean": plain Levenshtein over the command names, with a
// distance cap of 2 so a wildly misspelled word gets "try `help`" instead of a
// confident wrong suggestion. A wrong suggestion is worse than none.
function nearest(word) {
  const w = String(word).toLowerCase();
  let best = null;
  let bestScore = Infinity;
  for (const name of commandNames()) {
    const d = distance(w, name);
    if (d < bestScore) {
      bestScore = d;
      best = name;
    }
  }
  return bestScore <= 2 ? best : null;
}

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}
