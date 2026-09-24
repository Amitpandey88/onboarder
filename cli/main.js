// argv → command. `bin/onboarder.js` is a one-line trampoline into `main`; all
// parsing and dispatch lives here so the tests can call it directly.
//
// Flags use node's util.parseArgs — still zero dependencies, still strict about
// unknown flags, which is what a tool that writes a config file should be.

import fs from 'node:fs';
import { parseArgs } from 'node:util';

import {
  runSetup, runStart, runStatus, runStop, runRestart,
  runConfig, runConfigKey, runConfigReset, runDoctor, runTunnel,
} from './commands.js';

const PACKAGE = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `
  🧭 Onboarder — drop a path, get a map.

  Usage
    onboarder                     Start the server (runs setup first if needed)
    onboarder setup | onboard     Configure interactively (the wizard)
    onboarder start               Start the server
    onboarder status              Show whether the server is running
    onboarder stop                Stop the running server
    onboarder restart             Stop and start again
    onboarder config [<…>]         show | get <key> | set <key> <value> | path | reset | key <rotate|show|set>
    onboarder tunnel <name>       cloudflare | tailscale
    onboarder doctor              Check the machine and the config

  Setup flags (interactive wizard skips what they answer)
    --mode local|self-hosted   --host <addr>   --port <n>   --domain <name>
    --access-key generate|<k>  --name <n>   --email <e>
    --provider none|openai-compatible|ollama|openrouter|custom
    --base-url <url>   --model <m>   --cloudflare   --tailscale

  General flags
    --config <file>     Use this config file (or ONBOARDER_CONFIG)
    --non-interactive   Never prompt; flags + defaults are the answers
    -y, --yes           Answer yes to confirmations
    --json              Machine-readable output
    --reveal            config show prints the full access key
    --no-color          Plain output (NO_COLOR works too)
    -h, --help          This text      -v, --version      Print the version

  Also accepted
    help | --help       onboarder help | onboarder --help
    config | config show

  Examples
    onboarder setup
    onboarder setup --non-interactive --mode local --port 4310
    onboarder setup --non-interactive --mode self-hosted --domain map.example.com --access-key generate
    onboarder config set tunnel.cloudflare true && onboarder tunnel cloudflare
`;

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  json: { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  'non-interactive': { type: 'boolean' },
  reveal: { type: 'boolean' },
  verbose: { type: 'boolean' },
  start: { type: 'boolean' },
  color: { type: 'boolean' }, // --no-color falls out of parseArgs for free
  config: { type: 'string' },
  mode: { type: 'string' },
  host: { type: 'string' },
  port: { type: 'string' },
  domain: { type: 'string' },
  'access-key': { type: 'string' },
  name: { type: 'string' },
  email: { type: 'string' },
  provider: { type: 'string' },
  'base-url': { type: 'string' },
  model: { type: 'string' },
  cloudflare: { type: 'boolean' },
  tailscale: { type: 'boolean' },
  'auto-open': { type: 'boolean' },
};

// parseArgs speaks kebab-case; the wizard's flags speak camelCase.
function normalizeFlags(values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = v;
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (e) {
    console.error('  ' + e.message + '\n' + HELP);
    return 2;
  }
  const { values, positionals } = parsed;
  const flags = normalizeFlags(values);

  if (flags.help) { console.log(HELP); return 0; }
  if (flags.version) { console.log(PACKAGE.version); return 0; }

  const [cmd, sub, ...rest] = positionals;
  try {
    switch (cmd) {
      case 'help':
        console.log(HELP);
        return 0;
      case undefined:
      case 'start':
        return codeOf(await runStart({ flags }));
      case 'status':
        return codeOf(await runStatus({ flags }));
      case 'stop':
        return codeOf(await runStop({ flags }));
      case 'restart':
        return codeOf(await runRestart({ flags }));
      case 'setup':
      case 'onboard':
      case 'init':
        return codeOf(await runSetup({ flags, version: PACKAGE.version }));
      case 'config':
        if (sub === 'key') return codeOf(await runConfigKey(rest[0], rest.slice(1), { flags }));
        if (sub === 'reset') return codeOf(await runConfigReset({ flags }));
        return codeOf(await runConfig(sub || 'show', rest, { flags }));
      case 'tunnel':
        return codeOf(await runTunnel(sub, { flags }));
      case 'doctor':
        return codeOf(await runDoctor({ flags }));
      default:
        console.error('  Unknown command: ' + cmd + '\n' + HELP);
        return 2;
    }
  } catch (e) {
    console.error('  ' + (e.message || e));
    return 1;
  }
}

// Commands return an exit code or, for `start`, an object carrying the live
// server. Both collapse to "what code should the process eventually use".
function codeOf(result) {
  return typeof result === 'number' ? result : result?.code ?? 0;
}
