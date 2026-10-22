import { installHermes } from './runtime.js';
export declare const CHAT_HELP = "\n  Onboarder chat \u2014 a repository agent in your terminal\n\n  onboarder                         Chat about the current repository\n  onboarder chat [folder|GitHub URL] Open the chat harness (alias: tui)\n  onboarder chat https://github.com/owner/repo  Clone a repository, then ask questions\n  onboarder chat --resume <chat-id>   Continue a saved conversation\n  onboarder chat --mode review       Start in a specific workflow\n  onboarder explore [folder|url]     Open the original offline explorer\n\n  Type / to see live commands. \u2191/\u2193 select; Tab or Enter inserts; Esc dismisses.\n  Ctrl-P opens the command palette. Ctrl-O browses files. Ctrl-R resumes a conversation.\n  Chat fills the terminal and adjusts on resize. PgUp/PgDn scroll the conversation.\n  Ctrl-End returns to the latest output; new lines are counted while you read history.\n  Alt-Enter adds a line. Pasted multiline messages stay in the composer.\n  /review 42 \u00B7 /triage 12 \u00B7 /implement <task> \u00B7 /pr <task> \u00B7 /github <task>\n  /model opens a searchable model picker. /model configure opens full Hermes setup.\n  /permissions checks on permits repository test execution.\n  /deep opens the web UI's analyzer picker; /engines lists availability.\n  /deep all \u00B7 /deep security \u00B7 /deep options semgrep \u00B7 /deep results high\n  /deep explain asks Hermes about the report; /deep export saves private JSON.\n  /permissions github on permits GitHub writes explicitly requested in a task.\n  /new starts fresh; /history and /resume restore conversations.\n  /repo <GitHub URL> or a pasted URL clones and opens a repository.\n  /clone <GitHub URL> also works; /pull refreshes a clean saved checkout.\n  /paste enters multiline input; /send submits it; /discard cancels it.\n  Ctrl-C cancels an active task. Ctrl-D saves and exits.\n\n  Flags: --mode, --model, --provider, --allow-checks, --allow-github-writes,\n         --timeout, --max-turns, --resume, --base, --no-color\n  For scripts: onboarder agent <workflow> --task \"...\" --json\n";
interface ChatOptions {
    target?: string | null;
    flags?: Record<string, any>;
    out?: (text: string) => void;
    err?: (text: string) => void;
    version?: string;
    runtimeInstaller?: typeof installHermes;
}
/** Analysis modules are loaded only when a browsing command actually needs them. */
export declare function repositoryBrowser(flags: Record<string, any>, progress: (text: string) => void, version?: string): {
    readonly files: string[];
    filesFor(root: string): string[];
    listFiles(root: string, signal: AbortSignal): Promise<string[]>;
    invalidate(): void;
    run(name: string, args: string[], root: string, signal: AbortSignal): Promise<string>;
};
export declare function runChat({ target, flags, out, err, version, runtimeInstaller }?: ChatOptions): Promise<number>;
export {};
