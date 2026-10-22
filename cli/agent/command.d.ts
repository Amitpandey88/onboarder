export declare const AGENT_HELP = "\n  Onboarder agent \u2014 Hermes with repository and GitHub tools\n\n  onboarder agent setup                    Create a dedicated Hermes profile\n  onboarder chat [folder]                  Open the conversational harness with / commands\n  onboarder agent model                    Configure its model/provider interactively\n  onboarder agent doctor                   Check runtime and integration compatibility\n  onboarder agent source                   Fetch the researched official Hermes source\n  onboarder agent runs                     List saved runs\n  onboarder agent show <run-id>             Inspect a saved result and workspace\n  onboarder agent <workflow> [folder] --task \"...\"\n\n  Workflows: ask, review, triage, implement, pr, github\n  --pr <number>             Review/inspect a GitHub pull request\n  --issue <number>          Work from an issue\n  --base <branch>           PR target (default: origin HEAD, or current branch)\n  --allow-checks            Allow npm install/test/typecheck/build (repository code)\n  --allow-github-writes     Allow issue/review/comment updates and draft PR publishing\n  --max-turns <1\u2013100>       Agent turn limit (default: 24)\n  --timeout <seconds>       Run limit, 15\u20133600 (default: 300)\n  --model <name> --provider <name>  Override the dedicated Hermes model\n  --resume <run-id>         Continue a session; repeat allowed permission flags\n  --dry-run                Print the plan without a model call or worktree\n  --json                   One JSON result; progress goes to stderr\n\n  implement/pr use a new Git worktree at committed HEAD. Uncommitted source\n  changes are excluded. Without --allow-github-writes, pr prepares a draft locally.\n  GitHub uses the checkout's github.com origin and GITHUB_TOKEN or GH_TOKEN.\n  Hermes is an optional separate Python runtime: https://github.com/NousResearch/hermes-agent\n  Profile/history: ONBOARDER_AGENT_HOME (default: ~/.config/onboarder/agent).\n\n  onboarder agent ask . --task \"Explain the authentication flow\"\n  onboarder agent review . --pr 42 --task \"Find correctness and security issues\"\n  onboarder agent triage . --issue 12 --task \"Investigate and propose a fix\"\n  onboarder agent implement . --task \"Fix issue 12\" --issue 12 --allow-checks\n  onboarder agent pr . --task \"Fix issue 12 and open a draft PR\" --issue 12 --allow-checks --allow-github-writes\n";
export declare const AGENT_OPTIONS: {
    task: {
        type: 'string';
    };
    pr: {
        type: 'string';
    };
    issue: {
        type: 'string';
    };
    'max-turns': {
        type: 'string';
    };
    timeout: {
        type: 'string';
    };
    resume: {
        type: 'string';
    };
    'allow-checks': {
        type: 'boolean';
    };
    'allow-github-writes': {
        type: 'boolean';
    };
    'dry-run': {
        type: 'boolean';
    };
    model: {
        type: 'string';
    };
    provider: {
        type: 'string';
    };
    json: {
        type: 'boolean';
    };
    help: {
        type: 'boolean';
        short: string;
    };
    base: {
        type: 'string';
    };
};
export declare function agentDoctor(home?: string, env?: NodeJS.ProcessEnv): Promise<{
    runtime: boolean;
    compatible: boolean;
    server: boolean;
    profile: boolean;
    githubToken: boolean;
    home: string;
    ready: boolean;
    detail: string;
    next: string;
}>;
export declare function fetchHermesSource(home?: string, signal?: AbortSignal): Promise<{
    source: string;
    revision: string;
    directory: string;
    license: string;
    installed: boolean;
}>;
export declare function agentCommand(sub?: string, positionals?: string[], flags?: Record<string, any>, options?: {
    root?: string;
    signal?: AbortSignal;
    out?: (text: string) => void;
    err?: (text: string) => void;
}): Promise<number>;
export declare function explorerAgent(args: string[], root: string, signal: AbortSignal, out: (text: string) => void, err: (text: string) => void): Promise<string>;
