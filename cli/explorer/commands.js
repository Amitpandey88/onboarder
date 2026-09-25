// The command table.
//
// One list, used three ways: to dispatch what someone typed, to build the `help`
// screen, and to assert in the tests that every command is reachable, has a
// summary, and is wired to a real view. A command that exists in one of those
// places but not the others is the kind of thing nobody notices until a user
// types it, so the table is the only place a command is defined at all.
//
// `run(ctx, args)` returns a string to print, or a marker the app layer acts on
// (`EXIT`, `CLEAR`). `args` is an array of already-parsed words, so quoting is
// handled once, in the tokenizer, and every command sees the same shape.

import * as V from './views.js';

export const EXIT = Symbol('exit');
export const CLEAR = Symbol('clear');

export const COMMANDS = [
  {
    name: 'help', aliases: ['?'], group: 'basics',
    usage: 'help', summary: 'This list.',
    run: (ctx) => ctx.help(),
  },
  {
    name: 'map', aliases: ['overview', 'home'], group: 'basics',
    usage: 'map', summary: 'What this repo is, and where to start.',
    run: (ctx) => V.overview(ctx.repo),
  },
  {
    name: 'tour', aliases: ['start', 'onboarding'], group: 'basics',
    usage: 'tour', summary: 'The reading order a new teammate should follow.',
    run: (ctx) => V.tour(ctx.repo),
  },
  {
    name: 'explain', aliases: ['why', 'what'], group: 'basics',
    usage: 'explain [file|folder]', summary: 'This repo, or one file/folder, in prose. No AI key needed.',
    run: (ctx, args) => V.explain(ctx.repo, { target: args.join(' ') }),
  },
  {
    name: 'tree', aliases: ['ls', 'files'], group: 'navigate',
    usage: 'tree [folder] [depth]', summary: 'The file tree, with entries and hubs marked.',
    run: (ctx, args) => {
      // A lone number is the depth, not a folder called "2". `tree 3` is what
      // everyone types when they want to see more; making them spell
      // `tree . 3` would be pedantry in a tool built to be forgiving.
      const onlyDepth = args.length === 1 && /^\d+$/.test(args[0]);
      return V.tree(ctx.repo, {
        sub: onlyDepth ? '' : (args[0] || ''),
        depth: onlyDepth ? Number(args[0]) : (Number(args[1]) || 2),
      });
    },
  },
  {
    name: 'find', aliases: ['search', 'grep'], group: 'navigate',
    usage: 'find <query>', summary: 'Search. Supports ext:js, -exclude, "phrases", /regex/.',
    run: (ctx, args) => V.find(ctx.repo, { query: args.join(' ') }),
  },
  {
    name: 'show', aliases: ['open', 'cat', 'read'], group: 'navigate',
    usage: 'show <file> [from] [count]', summary: 'Read a file. Name it loosely: `show logger.js` works.',
    run: (ctx, args) => V.show(ctx.repo, { target: args[0] || '', from: Number(args[1]) || 0, count: Number(args[2]) || 0 }),
  },
  {
    name: 'deps', aliases: ['connections', 'graph'], group: 'navigate',
    usage: 'deps <file>', summary: 'What a file imports, and what imports it.',
    run: (ctx, args) => V.deps(ctx.repo, { target: args.join(' ') }),
  },
  {
    name: 'health', aliases: ['grade'], group: 'analyze',
    usage: 'health', summary: 'Health grade, riskiest files, debt.',
    run: (ctx) => V.health(ctx.repo),
  },
  {
    name: 'hubs', aliases: ['core'], group: 'analyze',
    usage: 'hubs', summary: 'The most depended-on files.',
    run: (ctx) => V.hubs(ctx.repo),
  },
  {
    name: 'layers', aliases: ['depth'], group: 'analyze',
    usage: 'layers', summary: 'Import depth, shallowest first.',
    run: (ctx) => V.layers(ctx.repo),
  },
  {
    name: 'patterns', aliases: ['architecture'], group: 'analyze',
    usage: 'patterns', summary: 'What the architecture looks like, in prose.',
    run: (ctx) => V.patterns(ctx.repo),
  },
  {
    name: 'stats', aliases: ['numbers'], group: 'analyze',
    usage: 'stats', summary: 'Languages, biggest folders and files, complexity.',
    run: (ctx) => V.stats(ctx.repo),
  },
  {
    name: 'security', aliases: ['audit'], group: 'analyze',
    usage: 'security', summary: 'Heuristic findings from the built-in rules.',
    run: (ctx) => V.security(ctx.repo),
  },
  {
    name: 'stack', aliases: ['packages'], group: 'analyze',
    usage: 'stack', summary: 'Declared dependencies and frameworks.',
    run: (ctx) => V.stack(ctx.repo),
  },
  {
    name: 'entry', aliases: ['entries'], group: 'analyze',
    usage: 'entry', summary: 'Recognized entry points and how far they reach.',
    run: (ctx) => V.entry(ctx.repo),
  },
  {
    name: 'externals', aliases: ['drift'], group: 'analyze',
    usage: 'externals', summary: 'External packages, plus dependency drift.',
    run: (ctx) => V.externals(ctx.repo),
  },
  {
    name: 'about', aliases: ['version'], group: 'session',
    usage: 'about', summary: 'Version, repo path, and what is indexed.',
    run: (ctx) => V.about(ctx.repo, ctx.version),
  },
  {
    name: 'rescan', aliases: ['reload'], group: 'session',
    usage: 'rescan', summary: 'Re-read the repo from disk.',
    run: (ctx) => ctx.rescan(),
  },
  {
    name: 'cd', aliases: ['open-repo', 'use'], group: 'session',
    usage: 'cd <folder>', summary: 'Load a different repository.',
    run: (ctx, args) => ctx.loadRepo(args.join(' ')),
  },
  {
    name: 'web', aliases: ['site', 'serve'], group: 'session',
    usage: 'web', summary: 'Start the web UI and print its URL.',
    run: (ctx) => ctx.web(),
  },
  {
    name: 'clear', aliases: ['cls'], group: 'session',
    usage: 'clear', summary: 'Clear the screen.',
    run: () => CLEAR,
  },
  {
    name: 'exit', aliases: ['quit', 'q'], group: 'session',
    usage: 'exit', summary: 'Leave. Ctrl-D does the same.',
    run: () => EXIT,
  },
];

// One lookup for every spelling a person might type, built once at import.
const BY_NAME = new Map();
for (const cmd of COMMANDS) {
  BY_NAME.set(cmd.name, cmd);
  for (const a of cmd.aliases) BY_NAME.set(a, cmd);
}

export function lookup(word) {
  return BY_NAME.get(String(word || '').toLowerCase());
}

// Every canonical name, for "did you mean" matching. Aliases are deliberately
// excluded: suggesting `open` when someone typed `sho` is less useful than
// suggesting `show`, which is the word they were reaching for.
export function commandNames() {
  return COMMANDS.map((c) => c.name);
}

// `help <command>` answers about one command; bare `help` lists them, grouped so
// the shape of the tool is visible rather than alphabetical.
export function helpText(ctx, topic = '') {
  if (topic) {
    const cmd = lookup(topic);
    if (!cmd) return `  No command called "${topic}". Try \`help\`.`;
    const also = cmd.aliases.length ? `  (also: ${cmd.aliases.join(', ')})` : '';
    return ['  ' + cmd.usage + also, '    ' + cmd.summary].join('\n');
  }
  const groups = new Map();
  for (const cmd of COMMANDS) {
    if (!groups.has(cmd.group)) groups.set(cmd.group, []);
    groups.get(cmd.group).push(cmd);
  }
  const room = Math.max(...COMMANDS.map((c) => c.usage.length));
  const out = [];
  for (const [group, list] of groups) {
    out.push('  ' + group.toUpperCase());
    for (const c of list) out.push('    ' + c.usage.padEnd(room) + '  ' + c.summary);
  }
  out.push('');
  out.push('  ' + (ctx?.repo ? ctx.repo.name : 'onboarder') + ' · Ctrl-D or `exit` to leave · Ctrl-C twice to quit');
  return out.join('\n');
}

// Split a typed line into words, honoring quotes so `find "exact phrase"` and
// `show "my file.js"` arrive as one argument each. Done once, here, so no
// command has to re-implement it.
export function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(line || '')))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
