import { promises as fs } from 'node:fs';
import path from 'node:path';
import { serveMcp } from '../../server/mcp/server.js';
import { createAgentDispatcher } from './mcp.js';
import { AGENT_MODES, type RunManifest } from './contracts.js';
import { redact, runProcess } from './process.js';

const write = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error) => void), callback?: (err?: Error) => void) {
  process.stderr.write(chunk);
  if (typeof encoding === 'function') encoding(); else callback?.();
  return true;
};
try {
  const file = process.env.ONBOARDER_AGENT_RUN;
  if (!file || !path.isAbsolute(file)) throw new Error('Start this MCP server through onboarder agent.');
  const stat = await fs.stat(file); if (stat.size > 64000) throw new Error('Task manifest is too large.');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8')) as RunManifest;
  if (manifest.schemaVersion !== 1 || !AGENT_MODES.includes(manifest.mode) || !manifest.permissions || typeof manifest.task !== 'string') throw new Error('Invalid task manifest.');
  for (const root of [manifest.root, manifest.sourceRoot]) if (!path.isAbsolute(root) || await fs.realpath(root) !== root) throw new Error('Task roots must be canonical directories.');
  if (manifest.auditFile !== path.join(path.dirname(file), 'audit.jsonl')) throw new Error('Invalid task audit path.');
  if (manifest.permissions.files) {
    if (!['implement', 'pr'].includes(manifest.mode) || manifest.root === manifest.sourceRoot || !/^codex\/agent-[\w-]+$/.test(manifest.branch || '')) throw new Error('Invalid writable workspace.');
    const branch = await runProcess('git', ['-C', manifest.root, 'branch', '--show-current'], { timeoutMs: 10_000, detached: false });
    if (branch.code || branch.stdout.trim() !== manifest.branch) throw new Error('Workspace branch changed.');
  }
  const abort = new AbortController();
  // Some Hermes releases put stdio servers in their own process group. Reap
  // this server if its supervisor disappears, including a forced cancellation.
  const parent = process.ppid;
  const watchdog = setInterval(() => {
    try { process.kill(parent, 0); }
    catch { abort.abort(); process.stdin.destroy(); clearInterval(watchdog); setTimeout(() => process.exit(143), 2000).unref(); }
  }, 1000); watchdog.unref();
  process.on('SIGTERM', () => { abort.abort(); process.exitCode = 143; });
  process.on('SIGINT', () => { abort.abort(); process.exitCode = 130; });
  serveMcp({ output: { write: (chunk: string) => write(chunk) }, dispatch: createAgentDispatcher(manifest, { signal: abort.signal }) });
} catch (e) {
  console.error(redact(e instanceof Error ? e.message : String(e))); process.exitCode = 1;
}
