import { constants, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { agentHome, hermesBinary, hermesEnvironment } from '../agent/config.js';

const INSTALL_BASE = 'https://hermes-agent.nousresearch.com/install';
export function hermesInstallCommand(platform = process.platform): string {
  return platform === 'win32' ? `iex (irm ${INSTALL_BASE}.ps1)` : `curl -fsSL ${INSTALL_BASE}.sh | bash`;
}

/** Check the same executable and PATH used by chat, without starting a wizard. */
export async function hermesInstalled(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const command = hermesBinary(env);
  const names = process.platform === 'win32' && !path.extname(command) ? [command, command + '.exe'] : [command];
  const dirs = path.isAbsolute(command) || command.includes('/') || command.includes('\\')
    ? [''] : (hermesEnvironment(agentHome(env), env).PATH || '').split(path.delimiter);
  for (const dir of dirs) for (const name of names) {
    const file = path.resolve(dir, name);
    try {
      if (!(await fs.stat(file)).isFile()) continue;
      await fs.access(file, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return true;
    } catch { /* Missing files and broken symlinks are unavailable. */ }
  }
  return false;
}

export function runInteractive(command: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit', shell: false, signal });
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });
}

/** Run the official installer with terminal input, outside the named profile. */
export async function installHermes(signal: AbortSignal, env: NodeJS.ProcessEnv = process.env,
  options: { download?: typeof fetch; execute?: typeof runInteractive } = {}): Promise<void> {
  signal.throwIfAborted();
  const windows = process.platform === 'win32';
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-hermes-install-'));
  try {
    const response = await (options.download || fetch)(INSTALL_BASE + (windows ? '.ps1' : '.sh'), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok) throw new Error(`Could not download the Hermes installer (HTTP ${response.status}).`);
    const script = await response.text();
    if (!script.trim() || Buffer.byteLength(script) > 2 * 1024 * 1024) throw new Error('The Hermes installer download is empty or too large.');
    const file = path.join(temporary, windows ? 'install.ps1' : 'install.sh');
    await fs.writeFile(file, script, { mode: 0o600 });
    // Keep the user's installation environment; the model wizard prepares the
    // dedicated Onboarder profile only after installation succeeds.
    const code = await (options.execute || runInteractive)(windows ? 'powershell.exe' : 'bash',
      windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file] : [file], { ...env }, signal);
    signal.throwIfAborted();
    if (code !== 0) throw new Error(`Hermes installation did not complete (exit ${code}).`);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
