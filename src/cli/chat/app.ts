import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ChatController, type ChatOutput } from './controller.js';
import { TerminalComposer } from './composer.js';
import { profileDisplay } from './profile.js';
import { HermesModels } from './models.js';
import { hermesInstalled, hermesInstallCommand, installHermes } from './runtime.js';
import { ChatSources } from './source.js';
import { ChatAnalysis } from './analysis.js';
import { chatBanner, chatStatus, ChatRenderer, type ChatTheme } from './render.js';
import { FILE_ACTIONS, fileChoices, type FileSelection } from './navigation.js';
import { slashInput } from './commands.js';
import { screenDivider } from './screen.js';
import { AGENT_MODES, type AgentMode } from '../agent/contracts.js';
import { agentCommand } from '../agent/command.js';
import { terminalText, redact } from '../agent/process.js';
import { repositoryFromRemote } from '../agent/github.js';
import type { RunManifest } from '../agent/contracts.js';
import { scanOptionsFromFlags } from '../scanOptions.js';
import { dim, bold, ok, bad, paint, colorEnabled } from '../ui.js';

export const CHAT_HELP = `
  Onboarder chat — a repository agent in your terminal

  onboarder                         Chat about the current repository
  onboarder chat [folder|GitHub URL] Open the chat harness (alias: tui)
  onboarder chat https://github.com/owner/repo  Clone a repository, then ask questions
  onboarder chat --resume <chat-id>   Continue a saved conversation
  onboarder chat --mode review       Start in a specific workflow
  onboarder explore [folder|url]     Open the original offline explorer

  Type / to see live commands. ↑/↓ select; Tab or Enter inserts; Esc dismisses.
  Ctrl-P opens the command palette. Ctrl-O browses files. Ctrl-R resumes a conversation.
  Chat fills the terminal and adjusts on resize. PgUp/PgDn scroll the conversation.
  Ctrl-End returns to the latest output; new lines are counted while you read history.
  Alt-Enter adds a line. Pasted multiline messages stay in the composer.
  /review 42 · /triage 12 · /implement <task> · /pr <task> · /github <task>
  /model opens a searchable model picker. /model configure opens full Hermes setup.
  /permissions checks on permits repository test execution.
  /deep opens the web UI's analyzer picker; /engines lists availability.
  /deep all · /deep security · /deep options semgrep · /deep results high
  /deep explain asks Hermes about the report; /deep export saves private JSON.
  /permissions github on permits GitHub writes explicitly requested in a task.
  /new starts fresh; /history and /resume restore conversations.
  /repo <GitHub URL> or a pasted URL clones and opens a repository.
  /clone <GitHub URL> also works; /pull refreshes a clean saved checkout.
  /paste enters multiline input; /send submits it; /discard cancels it.
  Ctrl-C cancels an active task. Ctrl-D saves and exits.

  Flags: --mode, --model, --provider, --allow-checks, --allow-github-writes,
         --timeout, --max-turns, --resume, --base, --no-color
  For scripts: onboarder agent <workflow> --task "..." --json
`;
interface ChatOptions { target?: string | null; flags?: Record<string, any>; out?: (text: string) => void; err?: (text: string) => void; version?: string; runtimeInstaller?: typeof installHermes }

/** Analysis modules are loaded only when a browsing command actually needs them. */
export function repositoryBrowser(flags: Record<string, any>, progress: (text: string) => void, version = '') {
  let cached: any = null;
  const ensure = async (root: string, signal: AbortSignal, refresh = false) => {
    signal.throwIfAborted();
    if (!cached || cached.root !== root || refresh) {
      const { openRepo } = await import('../explorer/session.js');
      progress('Indexing repository…');
      const repo = await openRepo(root, { ...scanOptionsFromFlags(flags), signal });
      signal.throwIfAborted(); cached = repo;
    }
    return cached;
  };
  return {
    get files(): string[] { return cached?.scan?.files?.map((f: any) => f.path) || []; },
    filesFor(root: string): string[] { return cached?.root === root ? cached.scan.files.map((f: any) => f.path) : []; },
    async listFiles(root: string, signal: AbortSignal): Promise<string[]> {
      const repo = await ensure(root, signal);
      return repo.scan.files.map((f: any) => f.path);
    },
    invalidate() { cached = null; },
    async run(name: string, args: string[], root: string, signal: AbortSignal): Promise<string> {
      const [repo, { lookup }, { getGitDiff }, { formatDiff }] = await Promise.all([
        ensure(root, signal, name === 'rescan'), import('../explorer/commands.js'), import('../../server/gitDiff.js'), import('../explorer/featureViews.js'),
      ]);
      signal.throwIfAborted();
      if (name === 'rescan') return 'Repository analysis refreshed.';
      const ctx = { repo, flags, version,
        diff: async (base: string, head: string, file: string) => formatDiff(await getGitDiff(root, { base, head, file, signal }), repo.facts.importers || {}, repo.scan.files.length, file),
        engines: async () => { const [{ toolsStatus }, { formatEngines }] = await Promise.all([import('../../server/tools/scan.js'), import('../explorer/featureViews.js')]); return formatEngines(toolsStatus()); },
        deep: async (tool: string) => {
          const [{ toolsStatus, runExternalAnalysis }, { formatDeepAnalysis }] = await Promise.all([import('../../server/tools/scan.js'), import('../explorer/featureViews.js')]);
          if (tool !== 'all' && !Object.hasOwn(toolsStatus(), tool)) throw new Error('Unknown analyzer. Use /engines.');
          return formatDeepAnalysis(await runExternalAnalysis(root, tool === 'all' ? { signal } : { signal, tools: [tool] }));
        },
        web: async () => { const { startWeb } = await import('../explorer/app.js'); return (await startWeb({ flags, repo })) + '\nRepository path: ' + root; },
      };
      const command = lookup(name);
      if (!command) throw new Error('Unknown repository command.');
      return String(await command.run(ctx, args));
    },
  };
}
export async function runChat({ target = null, flags = {}, out = console.log, err = console.error, version = '', runtimeInstaller = installHermes }: ChatOptions = {}): Promise<number> {
  if (flags.help) { out(CHAT_HELP); return 0; }
  if (!process.stdin.isTTY || !process.stdout.isTTY) { out('The chat harness needs an interactive terminal. For scripts use onboarder agent <workflow> --task "..." --json.'); return 0; }
  if (flags.task || flags.json || flags.dryRun) throw new Error('Use onboarder agent <workflow> --task "..." for one-shot or JSON requests.');
  const mode = flags.mode || 'ask';
  if (!AGENT_MODES.includes(mode)) throw new Error('Choose --mode ' + AGENT_MODES.join('|'));
  const timeout = Number(flags.timeout ?? 300), maxTurns = Number(flags.maxTurns ?? 24);
  if (!Number.isInteger(timeout) || timeout < 15 || timeout > 3600 || !Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 100) throw new Error('Use --timeout 15–3600 and --max-turns 1–100.');
  const sources = new ChatSources(), startup = new AbortController(), cancelStartup = () => startup.abort();
  process.on('SIGINT', cancelStartup); process.on('SIGTERM', cancelStartup);
  let source: Awaited<ReturnType<ChatSources['open']>>;
  try { source = await sources.open(target || '.', process.cwd(), startup.signal, text => out(dim(terminalText(redact(text))))); }
  catch (e) { if (startup.signal.aborted) { out('Repository loading cancelled.'); return 130; } throw e; }
  finally { process.off('SIGINT', cancelStartup); process.off('SIGTERM', cancelStartup); }
  const root = source.root;
  const theme: ChatTheme = { accent: text => paint(text, 'yellow', 'bold'), muted: dim, strong: bold, success: ok, error: bad,
    selection: text => colorEnabled() ? '\x1b[48;5;220m\x1b[38;5;232m' + text + '\x1b[0m' : text,
    status: text => {
      if (!colorEnabled()) return text;
      const [lead, ...details] = text.split(' │ ');
      return '\x1b[48;5;234m\x1b[38;5;220m\x1b[1m' + lead + '\x1b[22m'
        + details.map(detail => '\x1b[38;5;240m │ \x1b[38;5;250m' + detail).join('') + '\x1b[0m';
    } };
  let composer: TerminalComposer | null = null, handingOff = false, exiting = false, active: Promise<void> | null = null;
  let display = await profileDisplay(), startedAt = 0, toolCalls = 0, lastTool = '', analysisRunning = false, activity = '';
  let resolveDone: () => void;
  const done = new Promise<void>(resolve => { resolveDone = resolve; });
  const safe = (text: string) => terminalText(redact(text));
  const print = (text: string) => {
    if (composer && !handingOff && !exiting) composer.print(text); else out(text);
  };
  const browser = repositoryBrowser(flags, text => print(dim(text)), version);
  const renderer = new ChatRenderer(print, theme, process.env, {
    columns: () => process.stdout.columns || 80,
    divider: divider => {
      if (composer && !handingOff && !exiting) composer.divider(divider);
      else print(screenDivider(divider, (process.stdout.columns || 80) - 1));
    },
  });
  const analysis = new ChatAnalysis({ progress: text => print(dim(safe(text))),
    choose: (choices, signal) => composer!.choose({ title: 'Deep Analysis — Select Engines',
      hint: 'Same engines as the web UI · /deep options <engine> for settings', choices, signal }),
  });
  const models = new HermesModels();
  const ensureHermes = async (signal: AbortSignal): Promise<boolean> => {
    if (await hermesInstalled()) return true;
    const command = hermesInstallCommand();
    print(dim('Hermes is not installed. Install Hermes to configure a provider and use AI chat.\n' + command));
    const answer = await composer!.choose({ title: 'Hermes is not installed',
      hint: 'Press Enter to run the official, verified Hermes installer, or continue offline.', signal,
      choices: [{ value: 'install', label: 'Install Hermes', detail: command },
        { value: 'offline', label: 'Continue offline', detail: '/map · /tree · /find · install later with /model' }] });
    if (answer !== 'install' || exiting) return false;
    handingOff = true; composer?.suspend();
    let failure: unknown;
    try {
      out('Installing Hermes…\n' + command);
      await runtimeInstaller(signal);
    } catch (e) {
      signal.throwIfAborted();
      failure = e;
    } finally { handingOff = false; if (!exiting) composer?.start(); }
    if (failure) {
      print(bad(safe(failure instanceof Error ? failure.message : String(failure))) + '\nInstallation stopped safely. Retry with /model after checking the error.');
      return false;
    }
    if (!await hermesInstalled()) {
      print(bad('Hermes is still unavailable. Restart your terminal after installation, or check ONBOARDER_HERMES_BIN.\n' + command));
      return false;
    }
    print(ok('Hermes installed. Choose a provider and model to enable AI chat.'));
    return true;
  };
  const configureModel = async (signal: AbortSignal): Promise<boolean> => {
    if (!await ensureHermes(signal)) return false;
    // Give the official wizard exclusive terminal ownership, then restore chat.
    const before = await profileDisplay();
    handingOff = true; composer?.suspend();
    try {
      const code = await agentCommand('model', [], {}, { root: controller.settings.root, signal });
      if (code !== 0) throw new Error('Model setup did not complete. Existing settings remain available.');
      display = await profileDisplay();
      if (!display.model) { print(dim('Choose a provider and model to enable AI chat. Offline commands are ready.')); return false; }
      return display.model !== before.model || display.provider !== before.provider;
    } finally { display = await profileDisplay(); handingOff = false; if (!exiting) composer?.start(); }
  };
  const chooseModel = async (configure: boolean, signal: AbortSignal): Promise<boolean> => {
    if (configure) return configureModel(signal);
    if (!await ensureHermes(signal)) return false;
    print(dim('Loading Hermes model catalog…'));
    let providers: Awaited<ReturnType<HermesModels['catalog']>> = [];
    try { providers = await models.catalog(signal); }
    catch (e) { signal.throwIfAborted(); print(dim(safe(e instanceof Error ? e.message : String(e)))); }
    signal.throwIfAborted();
    while (!exiting) {
      const provider = await composer!.choose({ title: 'Model Picker — Select Provider',
        hint: `Current: ${controller.settings.model || display.model || 'not configured'} · ${controller.settings.provider || display.provider || 'choose a provider'}`,
        selected: controller.settings.provider || display.provider,
        choices: [...providers.map(p => ({ value: p.id, label: p.name, detail: `${p.models.length} models` })),
          { value: ':configure', label: 'Configure provider / authentication', detail: 'Full Hermes setup · all supported providers' },
          { value: ':cancel', label: 'Keep current settings' }], signal });
      if (provider === null || provider === ':cancel') return false;
      if (provider === ':configure') return configureModel(signal);
      const selectedProvider = providers.find(p => p.id === provider)!;
      const model = await composer!.choose({ title: 'Model Picker — ' + selectedProvider.name,
        hint: 'Type to search models · changes are saved to your Onboarder Hermes profile',
        selected: controller.settings.model || display.model,
        choices: [...selectedProvider.models.map(m => ({ value: m, label: m })),
          { value: ':back', label: '← Back to providers' }, { value: ':configure', label: 'Configure another model / endpoint' }], signal });
      if (model === null) return false;
      if (model === ':back') continue;
      if (model === ':configure') return configureModel(signal);
      print(dim('Activating ' + model + '…'));
      try {
        const selected = await models.select(model, provider, signal);
        display = await profileDisplay();
        print(ok('Model: ' + selected.model + ' · Provider: ' + selected.provider));
        return true;
      } catch (e) {
        signal.throwIfAborted();
        print(bad(safe(e instanceof Error ? e.message : String(e))));
        const next = await composer!.choose({ title: 'Model needs configuration',
          hint: 'Your current model and conversation are kept until a selection succeeds.', signal,
          choices: [{ value: 'configure', label: 'Configure provider / authentication', detail: 'Continue in the official Hermes wizard' },
            { value: 'back', label: 'Choose a different provider or model' }, { value: 'cancel', label: 'Keep current settings' }] });
        if (next === 'configure') return configureModel(signal);
        if (next !== 'back') return false;
      }
    }
    return false;
  };
  const onOutput = (event: ChatOutput) => {
    if (event.type === 'start') { startedAt = Date.now(); toolCalls = 0; lastTool = ''; }
    if (event.type === 'event' && event.event.type === 'tool_use') { toolCalls++; lastTool = safe(event.event.name || '').replace(/^mcp__onboarder__/, ''); }
    if (event.type === 'end') browser.invalidate();
    if (event.type === 'clear') composer?.clear();
    else if (event.type === 'exit') { exiting = true; composer?.close(); resolveDone!(); }
    else renderer.handle(event);
    composer?.refresh();
  };
  const controller = new ChatController({ root, sourceUrl: source.sourceUrl, mode: mode as AgentMode, model: flags.model, provider: flags.provider,
    checks: flags.allowChecks === true, github: flags.allowGithubWrites === true, timeout, maxTurns, base: flags.base }, {
    output: onOutput,
    sources,
    analysis: async (name, args, folder, signal, checks) => {
      analysisRunning = true; startedAt = Date.now();
      try { return await analysis.execute(name, args, folder, signal, checks); }
      finally { analysisRunning = false; }
    },
    chooseModel,
    chooseFile: async (folder, query, signal) => {
      const files = await browser.listFiles(folder, signal);
      signal.throwIfAborted();
      if (!files.length) { print(dim('No code files found. Use /repo <folder> to open another repository.')); return null; }
      const file = await composer!.choose({ title: 'Open a code file', hint: `${files.length} code files · search a name or path · all actions work offline`, choices: fileChoices(files), query, fuzzy: true, signal });
      if (!file) return null;
      const action = await composer!.choose({ title: safe(file.split('/').at(-1) || 'File actions'), hint: safe(file), choices: [...FILE_ACTIONS], signal });
      return action ? { path: file, action } as FileSelection : null;
    },
    chooseConversation: (records, signal) => composer!.choose({ title: 'Resume a conversation', hint: 'Saved conversations from this repository · current permissions are kept', fuzzy: true, signal,
      choices: records.map(record => ({ value: record.id, label: safe(record.turns[0]?.prompt || 'Untitled conversation').replace(/\s+/g, ' ').slice(0, 120),
        detail: `${record.settings.mode} · ${record.turns.length} turns · ${new Date(record.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })} · ${record.id.slice(0, 8)}` })),
    }),
    browse: (name, args, folder, signal) => browser.run(name, args, folder, signal),
    utility: async (name, signal) => {
      if (name === 'model') {
        await configureModel(signal); return 'Hermes model setup closed.';
      }
      if (name === 'tools') return `Hermes tools (${catalog.length})\n\n` + catalog.map(tool => `${tool.name}\n  ${tool.description}`).join('\n\n');
      const lines: string[] = [];
      const code = await agentCommand(name, [], {}, { root: controller.settings.root, signal, out: t => lines.push(t), err: t => lines.push(t) });
      return lines.join('\n') + (code ? '\nCheck the details above before running a task.' : '');
    },
  });
  const { scopedTools } = await import('../agent/mcp.js');
  const catalog = scopedTools({ schemaVersion: 1, id: randomUUID(), mode: controller.settings.mode, root, sourceRoot: root,
    repository: source.sourceUrl ? repositoryFromRemote(source.sourceUrl) : null, remote: source.sourceUrl || null, branch: null, baseBranch: null,
    task: '', permissions: { files: false, checks: false, github: false }, startedAt: '', timeoutSeconds: timeout, maxTurns, auditFile: '',
  } satisfies RunManifest).map(({ name, description }) => ({ name, description }));
  let bannerKey = '', bannerText = '';
  const banner = (columns: number, rows: number) => {
    const indexedFiles = browser.filesFor(controller.workspace).length;
    const key = JSON.stringify([controller.settings, display, columns, rows, controller.record.id, indexedFiles]);
    if (key !== bannerKey) { bannerKey = key; bannerText = chatBanner(controller.settings, columns, theme, version, { ...display, tools: catalog.length, catalog, session: controller.record.id, rows, fullscreen: true, indexedFiles }); }
    return bannerText;
  };
  composer = new TerminalComposer({ input: process.stdin, output: process.stdout, theme, fullscreen: true, welcome: banner,
    header: () => theme.accent('◈ ONBOARDER') + dim('  ·  ' + controller.settings.mode + '  ·  ' + (controller.settings.sourceUrl || controller.settings.root)),
    state: () => {
      const s = controller.settings, model = s.model || display.model || 'model not configured';
      const repo = s.sourceUrl?.split('/').at(-1) || path.basename(s.root);
      const tokens = controller.lastResult?.tokens?.total;
      const status = chatStatus(s, process.stdout.columns || 80, { model, repo, busy: controller.busy, elapsed: startedAt ? Date.now() - startedAt : 0,
        activity: analysisRunning ? 'Deep analysis' : lastTool || activity, calls: toolCalls, tokens, turns: controller.record.turns.length, tools: catalog.length });
      return { mode: s.mode, status: safe(status), busy: controller.busy, pasting: controller.pasting, files: browser.filesFor(controller.workspace) };
    },
    submit: line => {
      if (exiting) return;
      if (controller.busy) { void controller.accept(line); composer?.refresh(); return; }
      startedAt = Date.now(); toolCalls = 0; lastTool = '';
      const command = slashInput(line)?.name;
      activity = command === 'open' ? 'Browsing files' : command === 'resume' ? 'Opening conversation' : command === 'repo' || command === 'clone' ? 'Loading repository' : command ? '/' + command : 'Thinking';
      // Only one task owns the controller; cancellation/exit remain available while it runs.
      const task = controller.accept(line); active = task;
      composer?.refresh();
      void task.catch(e => print(bad(safe(e instanceof Error ? e.message : String(e))))).finally(() => {
        renderer.finish(); if (active === task) active = null;
        composer?.refresh();
      });
    },
    cancel: () => {
      if (controller.busy) { controller.cancel(); print(dim('Cancelling…')); }
      else if (controller.pasting) { void controller.accept('/discard'); composer?.refresh(); }
      else print(dim('Use /exit or Ctrl-D to leave.'));
    }, exit: () => controller.close(),
  });
  const terminate = () => controller.close();
  const interrupt = () => { if (controller.busy) controller.cancel(); else controller.close(); };
  const ticker = setInterval(() => { if (controller.busy && !composer?.choosing) composer?.refresh(); }, 250); ticker.unref();
  process.on('SIGTERM', terminate); process.on('SIGINT', interrupt);
  try {
    if (flags.resume) await controller.resume(flags.resume);
    composer.start();
    if (!await hermesInstalled()) {
      await controller.accept('/model configure');
    } else if (!controller.settings.model && !display.model) {
      const answer = await composer.choose({ title: 'Welcome — Model & Provider', hint: 'Set up AI chat now, or use repository commands offline.',
        choices: [{ value: 'configure', label: 'Choose a provider and model', detail: 'Open full Hermes configuration' },
          { value: 'offline', label: 'Continue offline', detail: '/map · /tree · /find · set up later with /model' }], signal: startup.signal });
      if (answer === 'configure' && !exiting) await controller.accept('/model configure');
    }
    await done; if (active) await active;
    if (await controller.save()) out(dim('Conversation saved. Resume it with /resume ' + controller.record.id));
    return 0;
  } finally {
    controller.cancel(); process.off('SIGTERM', terminate); process.off('SIGINT', interrupt); clearInterval(ticker);
    exiting = true; composer.close();
  }
}
