import { AGENT_MODES } from '../agent/contracts.js';

export const CHAT_COMMANDS = [
  ['help', '[command]', 'Show commands and examples'],
  ['ask', '<question>', 'Ask about this repository'],
  ['review', '[PR number] [task]', 'Review local changes or a GitHub PR'],
  ['triage', '[issue number] [task]', 'Investigate issues and suggest fixes'],
  ['implement', '<task>', 'Make changes in an isolated Git workspace'],
  ['pr', '<task>', 'Prepare a draft PR; publish when GitHub writes are enabled'],
  ['github', '<task>', 'Work with GitHub issues, reviews, labels, and CI'],
  ['mode', '[ask|review|triage|implement|pr|github]', 'Choose the workflow for following messages'],
  ['permissions', '[checks|github] [on|off]', 'Control test execution and GitHub writes'],
  ['model', '[name] [provider]', 'Open the provider/model picker; configure opens full Hermes setup'],
  ['limits', '[seconds] [turns]', 'Set the run timeout and tool-turn budget'],
  ['repo', '[folder|GitHub URL]', 'Show or switch the repository; clone GitHub URLs'],
  ['clone', '<GitHub URL>', 'Clone a repository into a saved local checkout'],
  ['pull', '', 'Update the saved checkout without overwriting local changes'],
  ['new', '', 'Start a fresh conversation'],
  ['history', '', 'List saved conversations for this repository'],
  ['resume', '<conversation ID>', 'Continue a saved conversation'],
  ['status', '', 'Show model, permissions, workspace, and last run'],
  ['paste', '', 'Enter a multiline message; finish with /send or /discard'],
  ['cancel', '', 'Stop the active task (Ctrl-C also works)'],
  ['map', '', 'Repository overview, available offline'],
  ['tree', '[folder] [depth]', 'Browse repository files'],
  ['find', '<query>', 'Search files, symbols, and contents'],
  ['show', '<file> [from] [count]', 'Read a file'],
  ['diff', '[base] [head] [file]', 'Inspect changes in the current workspace'],
  ['health', '', 'Inspect repository health'],
  ['rescan', '', 'Refresh the cached repository analysis'],
  ['tour', '', 'Find the best reading order for this codebase'],
  ['explain', '[file|folder]', 'Explain a module using local analysis'],
  ['deps', '<file>', 'Trace imports and reverse dependencies'],
  ['inspect', '<file>', 'Inspect role, complexity, exports, and findings'],
  ['graph', '<file> [depth]', 'Explore the dependency graph'],
  ['blast', '<file>', 'Show the impact of changing a file'],
  ['symbols', '<file>', 'List functions, classes, and exports'],
  ['hubs', '', 'Find the most depended-on modules'],
  ['layers', '', 'Inspect architecture layers'],
  ['patterns', '', 'Discover architecture patterns'],
  ['stats', '', 'Inspect language and complexity statistics'],
  ['security', '', 'Show local security findings'],
  ['stack', '', 'Inspect frameworks and dependencies'],
  ['entry', '', 'Locate application entry points'],
  ['externals', '', 'Inspect external dependencies and drift'],
  ['coupling', '', 'Explore traffic between folders'],
  ['clusters', '', 'Find groups of related modules'],
  ['risks', '', 'Inspect code and architecture risks'],
  ['log', '[count]', 'Read recent Git commits'],
  ['hotspots', '[count]', 'Find frequently changed complex files'],
  ['blame', '<file>', 'Read line authorship'],
  ['diagram', '[file|folder]', 'Generate Mermaid diagram source'],
  ['layers-diagram', '', 'Generate an architecture layer diagram'],
  ['atlas', '', 'Browse available diagrams'],
  ['docs', '[file|folder] [--write]', 'Read or explicitly generate repository documentation'],
  ['workflows', '', 'Inspect GitHub Actions workflows'],
  ['sbom', '[package]', 'Inspect dependencies and licenses'],
  ['engines', '', 'Show available optional analyzers'],
  ['deep', '<engine|all>', 'Run an optional analyzer when checks are enabled'],
  ['web', '', 'Open the repository in the web interface'],
  ['about', '', 'Show repository and application information'],
  ['tools', '', 'List the actual tools available to Hermes'],
  ['skills', '', 'Discover the six built-in agent workflows'],
  ['runs', '', 'List saved agent runs'],
  ['run', '<run ID>', 'Read a saved result from this repository'],
  ['export', '', 'Save this conversation as Markdown'],
  ['send', '', 'Submit the message composed with /paste'],
  ['discard', '', 'Discard the message composed with /paste'],
  ['doctor', '', 'Check the Hermes runtime and profile'],
  ['setup', '', 'Prepare the dedicated Hermes profile'],
  ['clear', '', 'Clear the screen; keep the conversation'],
  ['exit', '', 'Save and exit (Ctrl-D also works)'],
] as const;
export type ChatCommand = typeof CHAT_COMMANDS[number][0];
export const BROWSE_COMMANDS = ['map', 'tree', 'find', 'show', 'diff', 'health', 'rescan', 'tour', 'explain', 'deps', 'inspect', 'graph', 'blast', 'symbols', 'hubs', 'layers', 'patterns', 'stats', 'security', 'stack', 'entry', 'externals', 'coupling', 'clusters', 'risks', 'log', 'hotspots', 'blame', 'diagram', 'layers-diagram', 'atlas', 'docs', 'workflows', 'sbom', 'engines', 'deep', 'web', 'about'] as const;

export function suggestCommands(line: string): typeof CHAT_COMMANDS[number][] {
  if (!/^\/[\w-]*$/.test(line)) return [];
  const query = line.slice(1).toLowerCase();
  return CHAT_COMMANDS.filter(([name, , summary]) => name.startsWith(query) || query.length > 1 && summary.toLowerCase().includes(query))
    .sort((a, b) => Number(b[0].startsWith(query)) - Number(a[0].startsWith(query)));
}

export function slashInput(line: string): { name: string; args: string[]; body: string } | null {
  const match = /^\/([\w-]*)(?:\s+([\s\S]*))?$/.exec(line.trim());
  if (!match) return null;
  const body = match[2] || '';
  // Quotes are useful for file paths. Workflow tasks retain the original body.
  const args = [...body.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3]!);
  return { name: match[1]!, args, body };
}
export function chatHelp(topic = ''): string {
  const commands = topic ? CHAT_COMMANDS.filter(c => c[0] === topic.replace(/^\//, '')) : CHAT_COMMANDS;
  if (!commands.length) return `Unknown command /${topic}. Use /help.`;
  return ['Slash commands', '', ...commands.map(([name, args, detail]) => `  /${name}${args ? ' ' + args : ''}\n    ${detail}`), '',
    'Type / for live suggestions. ↑/↓ select; Tab or Enter fills the command. Esc dismisses.',
    'Alt-Enter adds a line. Bracketed paste preserves multiline text. Ctrl-C cancels a task.',
    '/review 42   /triage 12   /implement Fix the failing test',
    '/permissions checks on   /permissions github on',
    'Paste a GitHub URL to clone and open it, then type your question.',
    'Follow-ups reuse the Hermes session. Mode, target, model, or permission changes start a new session.',
    'Use /paste for multiline text. /new resets context; /clear only clears the screen.'].join('\n');
}
export function completeChat(line: string, files: string[] = []): [string[], string] {
  if (!line.startsWith('/')) return [[], line];
  if (!line.includes(' ')) return [CHAT_COMMANDS.map(c => '/' + c[0]).filter(c => c.startsWith(line)), line];
  const [command, ...args] = line.split(/\s+/), fragment = args.at(-1) || '';
  let candidates: readonly string[] = [];
  if (command === '/mode') candidates = AGENT_MODES;
  if (command === '/permissions') candidates = args.length === 1 ? ['checks', 'github'] : ['on', 'off'];
  if (command === '/model' && args.length === 1) candidates = ['configure', 'default'];
  if (['/show', '/tree', '/repo', '/deps', '/inspect', '/graph', '/blast', '/symbols', '/explain', '/blame', '/docs', '/diagram'].includes(command!)) candidates = files;
  return [candidates.filter(c => c.startsWith(fragment)).slice(0, 100), fragment];
}
