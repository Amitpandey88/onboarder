import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { AGENT_MODES, type AgentMode } from './contracts.js';
import { agentHome, setupAgent, prepareAgentProfile, runtimePaths, hermesBinary, hermesEnvironment, HERMES_SOURCE, HERMES_REVISION } from './config.js';
import { runAgent, savedRun } from './runner.js';
import { runProcess, terminalText, redact } from './process.js';
import { githubToken } from './github.js';

export const AGENT_HELP = `
  Onboarder agent — Hermes with repository and GitHub tools

  onboarder agent setup                    Create a dedicated Hermes profile
  onboarder chat [folder]                  Open the conversational harness with / commands
  onboarder agent model                    Configure its model/provider interactively
  onboarder agent doctor                   Check runtime and integration compatibility
  onboarder agent source                   Fetch the researched official Hermes source
  onboarder agent runs                     List saved runs
  onboarder agent show <run-id>             Inspect a saved result and workspace
  onboarder agent <workflow> [folder] --task "..."

  Workflows: ask, review, triage, implement, pr, github
  --pr <number>             Review/inspect a GitHub pull request
  --issue <number>          Work from an issue
  --base <branch>           PR target (default: origin HEAD, or current branch)
  --allow-checks            Allow npm install/test/typecheck/build (repository code)
  --allow-github-writes     Allow issue/review/comment updates and draft PR publishing
  --max-turns <1–100>       Agent turn limit (default: 24)
  --timeout <seconds>       Run limit, 15–3600 (default: 300)
  --model <name> --provider <name>  Override the dedicated Hermes model
  --resume <run-id>         Continue a session; repeat allowed permission flags
  --dry-run                Print the plan without a model call or worktree
  --json                   One JSON result; progress goes to stderr

  implement/pr use a new Git worktree at committed HEAD. Uncommitted source
  changes are excluded. Without --allow-github-writes, pr prepares a draft locally.
  GitHub uses the checkout's github.com origin and GITHUB_TOKEN or GH_TOKEN.
  Hermes is an optional separate Python runtime: https://github.com/NousResearch/hermes-agent
  Profile/history: ONBOARDER_AGENT_HOME (default: ~/.config/onboarder/agent).

  onboarder agent ask . --task "Explain the authentication flow"
  onboarder agent review . --pr 42 --task "Find correctness and security issues"
  onboarder agent triage . --issue 12 --task "Investigate and propose a fix"
  onboarder agent implement . --task "Fix issue 12" --issue 12 --allow-checks
  onboarder agent pr . --task "Fix issue 12 and open a draft PR" --issue 12 --allow-checks --allow-github-writes
`;
export const AGENT_OPTIONS = {
  task: { type: 'string' as const }, pr: { type: 'string' as const }, issue: { type: 'string' as const },
  'max-turns': { type: 'string' as const }, timeout: { type: 'string' as const }, resume: { type: 'string' as const },
  'allow-checks': { type: 'boolean' as const }, 'allow-github-writes': { type: 'boolean' as const }, 'dry-run': { type: 'boolean' as const },
  model: { type: 'string' as const }, provider: { type: 'string' as const }, json: { type: 'boolean' as const }, help: { type: 'boolean' as const, short: 'h' },
  base: { type: 'string' as const },
};
export async function agentDoctor(home = agentHome(), env: NodeJS.ProcessEnv = process.env) {
  const paths = runtimePaths(home, env);
  let runtime = false, compatible = false, detail = '';
  try {
    const result = await runProcess(hermesBinary(env), ['chat', '--help'], { env: hermesEnvironment(home, env), timeoutMs: 30_000, maxBytes: 128000 });
    runtime = result.code === 0;
    compatible = runtime && ['--query-file', 'stream-json', '--toolsets', '--run-budget', '--ignore-rules', '--no-restore-cwd'].every(s => result.stdout.includes(s));
    if (!compatible) detail = result.code ? result.stderr.slice(-2000) || 'Hermes could not start.' : 'Update Hermes to a runtime supporting structured one-shot chat and MCP selection.';
  } catch (e) { detail = redact(e instanceof Error ? e.message : String(e), env); }
  const server = await fs.access(paths.server).then(() => true).catch(() => false);
  const profile = await fs.access(path.join(paths.profile, 'config.yaml')).then(() => true).catch(() => false);
  return { runtime, compatible, server, profile, githubToken: Boolean(githubToken(env)), home, ready: runtime && compatible && server && profile, detail,
    next: !runtime ? 'Install Hermes from its official repository, then agent setup and agent model.' : !profile ? 'Run onboarder agent setup, then onboarder agent model.' : 'Model credentials are checked by Hermes when a task runs; use agent model to configure them.' };
}
export async function fetchHermesSource(home = agentHome(), signal?: AbortSignal) {
  const target = path.join(home, 'upstream', 'hermes-agent');
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const git = async (args: string[]) => {
    const output = await runProcess('git', ['-c', 'http.version=HTTP/1.1', ...args], { signal, timeoutMs: 120_000, maxBytes: 2 * 1024 * 1024 });
    if (output.code) throw new Error(`Hermes source fetch failed: ${output.stderr.slice(-1500)}`);
    return output.stdout.trim();
  };
  if (!await fs.access(target).then(() => true).catch(() => false)) {
    const staging = target + '-' + randomUUID();
    try { await git(['clone', '--depth', '1', '--no-checkout', '--', HERMES_SOURCE, staging]); await fs.rename(staging, target); }
    finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
  if (await git(['-C', target, 'remote', 'get-url', 'origin']) !== HERMES_SOURCE) throw new Error('The source cache origin is not the official Hermes repository.');
  if (await git(['-C', target, 'status', '--porcelain']) && await fs.access(path.join(target, 'LICENSE')).then(() => true).catch(() => false)) throw new Error('The source cache contains edits. Preserve them before updating it.');
  await git(['-C', target, 'fetch', '--depth', '1', 'origin', HERMES_REVISION]);
  await git(['-C', target, '-c', 'core.hooksPath=' + path.join(home, 'empty-hooks'), 'checkout', '--detach', HERMES_REVISION]);
  return { source: HERMES_SOURCE, revision: HERMES_REVISION, directory: target, license: 'MIT', installed: false };
}

export async function agentCommand(sub = 'help', positionals: string[] = [], flags: Record<string, any> = {}, options: { root?: string; signal?: AbortSignal; out?: (text: string) => void; err?: (text: string) => void } = {}) {
  const out = options.out || console.log, err = options.err || console.error, home = agentHome();
  const print = (value: unknown) => out(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  if (flags.help || sub === 'help') { out(AGENT_HELP); return 0; }
  if (sub === 'setup') {
    const result = await prepareAgentProfile(home, process.env, options.signal);
    print(flags.json ? result : `Dedicated Hermes profile: ${result.profile}\n${result.created ? 'Created.' : 'Existing model settings preserved.'} Run onboarder agent model to configure its provider.\nRun onboarder agent doctor to check the integration.`); return 0;
  }
  if (sub === 'doctor') { const report = await agentDoctor(home); print(report); return report.ready ? 0 : 1; }
  if (sub === 'source') { print(await fetchHermesSource(home, options.signal)); return 0; }
  if (sub === 'model') {
    if (!process.stdin.isTTY) throw new Error('Run onboarder agent model in an interactive terminal.');
    await setupAgent(home);
    return new Promise<number>((resolve, reject) => {
      const child = spawn(hermesBinary(), ['model'], { env: hermesEnvironment(home), stdio: 'inherit', shell: false, signal: options.signal });
      child.on('error', reject); child.on('close', code => resolve(code ?? 1));
    });
  }
  if (sub === 'runs') {
    const names = await fs.readdir(runtimePaths(home).runs).catch(e => { if (e.code !== 'ENOENT') throw e; return []; });
    const runs = (await Promise.all(names.filter(n => /^[a-f\d-]{36}$/.test(n)).map(async id => {
      try { const { manifest, result } = await savedRun(id, home); return { id, mode: manifest.mode, status: result?.status || 'unfinished', startedAt: manifest.startedAt, workspace: manifest.root, repository: manifest.repository }; }
      catch { return { id, status: 'unreadable' }; }
    }))).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    print(runs); return 0;
  }
  if (sub === 'show') { print(await savedRun(positionals[0] || '', home)); return 0; }
  if (!AGENT_MODES.includes(sub as AgentMode)) throw new Error('Unknown agent workflow. Run onboarder agent --help.');
  if (positionals.length > 1) throw new Error('Use one repository folder and --task "your task".');
  const task = flags.task || (sub === 'review' ? `Review ${flags.pr ? 'pull request ' + flags.pr : 'local changes'} for actionable correctness and security issues.` : sub === 'triage' ? `Investigate ${flags.issue ? 'issue ' + flags.issue : 'open issues'} and propose a prioritized plan.` : '');
  const result = await runAgent({ mode: sub as AgentMode, root: positionals[0] || options.root || '.', task,
    pr: flags.pr === undefined ? undefined : Number(flags.pr), issue: flags.issue === undefined ? undefined : Number(flags.issue),
    maxTurns: flags.maxTurns === undefined ? flags['max-turns'] : flags.maxTurns, timeoutSeconds: flags.timeout,
    allowChecks: flags.allowChecks || flags['allow-checks'], allowGithubWrites: flags.allowGithubWrites || flags['allow-github-writes'], dryRun: flags.dryRun || flags['dry-run'],
    model: flags.model, provider: flags.provider, resume: flags.resume, base: flags.base }, { signal: options.signal,
    onEvent: event => {
      if (event.type === 'tool_use') err(`  ${terminalText(event.name || 'Tool')}…`);
      if (event.type === 'tool_result' && event.is_error) err(`  ${terminalText(event.name || 'Tool')} reported an error.`);
    } });
  if ('dryRun' in result || flags.json) print(result);
  else out(`${terminalText(result.answer)}\n\nRun: ${result.id} (${result.status})\nWorkspace: ${result.workspace}${result.branch ? '\nBranch: ' + result.branch : ''}`);
  return 'dryRun' in result || result.status === 'completed' ? 0 : result.status === 'cancelled' ? 130 : 1;
}

export async function explorerAgent(args: string[], root: string, signal: AbortSignal, out: (text: string) => void, err: (text: string) => void) {
  const parsed = parseArgs({ args, options: AGENT_OPTIONS, allowPositionals: true });
  await agentCommand(parsed.positionals[0], parsed.positionals.slice(1), parsed.values, { root, signal, out, err });
  return '';
}
