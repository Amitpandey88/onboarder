import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runProcess } from './process.js';

export const HERMES_SOURCE = 'https://github.com/NousResearch/hermes-agent.git';
export const HERMES_REVISION = 'eb7e8620324b32424c06218f6a28094df2e921f8';
export function agentHome(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.ONBOARDER_AGENT_HOME || path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'onboarder', 'agent'));
}
export function hermesBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.ONBOARDER_HERMES_BIN || 'hermes';
}
export function runtimePaths(home = agentHome(), env: NodeJS.ProcessEnv = process.env) {
  const native = process.platform === 'win32' ? path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'hermes') : path.join(os.homedir(), '.hermes');
  const configured = env.HERMES_HOME ? (path.basename(path.dirname(env.HERMES_HOME)) === 'profiles' ? path.dirname(path.dirname(env.HERMES_HOME)) : env.HERMES_HOME) : native;
  // Named profiles share the installation's Python store, but not its config,
  // credentials, sessions, memory, or MCP server selection.
  const name = 'onboarder-' + createHash('sha256').update(path.resolve(home)).digest('hex').slice(0, 12);
  return { home, profile: path.join(configured, 'profiles', name), runs: path.join(home, 'runs'), workspaces: path.join(home, 'workspaces'), server: fileURLToPath(new URL('./stdio.js', import.meta.url)) };
}
export function hermesEnvironment(home = agentHome(), env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...env, HERMES_HOME: runtimePaths(home, env).profile, OPENAI_API_KEY: env.ONBOARDER_AI_API_KEY || env.OPENAI_API_KEY,
    PATH: [path.join(os.homedir(), '.local', 'bin'), env.PATH || ''].join(path.delimiter) };
}
export async function setupAgent(home = agentHome(), env: NodeJS.ProcessEnv = process.env) {
  const paths = runtimePaths(home, env);
  for (const dir of [paths.profile, paths.runs, paths.workspaces]) await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(paths.profile, 'config.yaml');
  const base = env.ONBOARDER_AI_BASE_URL || env.OPENAI_BASE_URL;
  const model = env.ONBOARDER_AI_MODEL || env.OPENAI_MODEL;
  // JSON is a YAML subset. Hermes can subsequently maintain this file with its own model wizard.
  const config = {
    ...(base && model ? { model: { provider: 'custom', base_url: base, default: model } } : {}),
    agent: { max_turns: 24 }, memory: { memory_enabled: false, user_profile_enabled: false },
    tools: { tool_search: { enabled: 'off' } },
    mcp_servers: { onboarder: { command: process.execPath, args: [paths.server],
      env: { ONBOARDER_AGENT_RUN: '${ONBOARDER_AGENT_RUN}', GITHUB_TOKEN: '${GITHUB_TOKEN}', GH_TOKEN: '${GH_TOKEN}' },
      tools: { prompts: false, resources: false }, connect_timeout: 30, timeout: 150 } },
  };
  let created = false;
  try { await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); created = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  return { ...paths, configFile: file, created };
}

/** Refresh only harness-owned settings; retain the model wizard's provider/auth choices. */
export async function prepareAgentProfile(home = agentHome(), env: NodeJS.ProcessEnv = process.env, signal?: AbortSignal) {
  const setup = await setupAgent(home, env);
  if (setup.created) return setup;
  const server = { command: process.execPath, args: [setup.server],
    env: { ONBOARDER_AGENT_RUN: '${ONBOARDER_AGENT_RUN}', GITHUB_TOKEN: '${GITHUB_TOKEN}', GH_TOKEN: '${GH_TOKEN}' },
    tools: { prompts: false, resources: false }, connect_timeout: 30, timeout: 150 };
  const source = await fs.readFile(setup.configFile, 'utf8');
  let config: Record<string, any> | null = null;
  try { const value = JSON.parse(source); if (value && typeof value === 'object' && !Array.isArray(value)) config = value; } catch { /* Hermes' model wizard writes native YAML. */ }
  if (config) {
    config.mcp_servers = { ...(config.mcp_servers || {}), onboarder: server };
    config.tools = { ...(config.tools || {}), tool_search: { ...(config.tools?.tool_search || {}), enabled: 'off' } };
    config.memory = { ...(config.memory || {}), memory_enabled: false, user_profile_enabled: false };
    const next = JSON.stringify(config, null, 2) + '\n';
    if (source !== next) {
      const temporary = setup.configFile + '-' + randomUUID();
      try { await fs.writeFile(temporary, next, { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, setup.configFile); }
      finally { await fs.rm(temporary, { force: true }); }
    }
  } else {
    // Let Hermes parse/preserve its own YAML rather than adding a Node dependency
    // or hand-editing the model wizard's configuration.
    for (const [key, value] of [['mcp_servers.onboarder', JSON.stringify(server)], ['tools.tool_search.enabled', 'off'], ['memory.memory_enabled', 'false'], ['memory.user_profile_enabled', 'false']]) {
      const result = await runProcess(hermesBinary(env), ['config', 'set', key, value], { env: hermesEnvironment(home, env), signal, timeoutMs: 30_000, maxBytes: 128000 });
      if (result.code) throw new Error(`Could not refresh the dedicated Hermes profile: ${result.stderr.slice(-1500) || result.stdout.slice(-1500)}`);
    }
  }
  return setup;
}
