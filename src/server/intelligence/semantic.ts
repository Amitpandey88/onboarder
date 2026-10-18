import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isolatedEnvironment } from '../security/environment.js';
import { runProcess } from '../../cli/agent/process.js';
import type { SemanticResult } from '../../shared/intelligence/contracts.js';
let activeWorkers = 0;

/** Optional compiler loaded from operator configuration, never repository code. */
export async function semanticAnalysis(_root: string, texts: Map<string, string>): Promise<SemanticResult> {
  const unavailable = (reason: string): SemanticResult => ({ available: false, reason, definitions: [], references: [] });
  let engine = process.env.ONBOARDER_TYPESCRIPT_MODULE;
  if (!engine) {
    const installed = path.join(semanticEngineDirectory(), 'node_modules/typescript/lib/typescript.js');
    try { await access(installed); engine = installed; } catch {}
  }
  if (!engine) {
    try {
      const require = createRequire(import.meta.url);
      const candidate = require.resolve('typescript');
      if (typeof require(candidate).createProgram === 'function') engine = candidate;
    } catch { /* Native compiler distributions need the optional API engine. */ }
  }
  if (!engine) return unavailable('Install the optional TypeScript Compiler API and set ONBOARDER_TYPESCRIPT_MODULE to its absolute lib/typescript.js path. No repository code is executed.');
  if (!path.isAbsolute(engine)) return unavailable('ONBOARDER_TYPESCRIPT_MODULE must be an absolute path to a trusted compiler.');
  if (activeWorkers >= 2) return unavailable('Two semantic indexes are already running. Retry when one completes.');
  return new Promise(resolve => {
    let worker: Worker;
    try { worker = new Worker(new URL('./semanticWorker.js', import.meta.url), {
      workerData: { engine, texts: [...texts] },
      resourceLimits: { maxOldGenerationSizeMb: 384 },
    }); } catch { resolve(unavailable('Optional compiler worker could not start.')); return; }
    activeWorkers++;
    let settled = false;
    const timer = setTimeout(() => finish(unavailable('Semantic indexing exceeded its 20-second limit.')), 20000);
    const finish = (result: SemanticResult) => {
      if (settled) return; settled = true; activeWorkers--;
      clearTimeout(timer); void worker.terminate(); resolve(result);
    };
    worker.once('message', finish);
    worker.once('error', () => finish(unavailable('Optional compiler failed. Check the configured module and its compatibility.')));
    worker.once('exit', code => { if (code !== 0) finish(unavailable('Optional compiler exited before completing.')); });
  });
}
export function semanticEngineDirectory() {
  return path.join(process.env.ONBOARDER_INTELLIGENCE_HOME || path.join(os.homedir(), '.config', 'onboarder', 'intelligence'), 'engines', 'typescript');
}
export async function installSemanticEngine(signal?: AbortSignal) {
  const directory = semanticEngineDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const env = isolatedEnvironment(process.env, [], directory);
  env.NPM_CONFIG_CACHE = path.join(directory, 'cache');
  const args = ['install', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', 'typescript@5.9.3'];
  if (process.platform === 'win32') throw new Error('Install the pinned TypeScript 5.9.3 API manually and set ONBOARDER_TYPESCRIPT_MODULE to its absolute lib/typescript.js path.');
  const result = await runProcess('npm', args, { cwd: directory, env, signal, timeoutMs: 120000, maxBytes: 65536 });
  if (result.code) throw new Error('Optional TypeScript installation failed: ' + result.stderr.slice(-1000));
  return { engine: path.join(directory, 'node_modules/typescript/lib/typescript.js'), version: '5.9.3', note: 'Installed separately from the zero-dependency core, with npm lifecycle scripts disabled.' };
}
