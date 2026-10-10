import { constants, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { verifiedDownload, type DownloadArtifact } from '../../server/security/download.js';
import { isolatedEnvironment } from '../../server/security/environment.js';
import { agentHome, hermesBinary, hermesEnvironment } from '../agent/config.js';

export const HERMES_COMMIT = 'dcabf76310ff26e1f264368e9e86277380d98266';
export function hermesInstaller(platform = process.platform): DownloadArtifact {
  const windows = platform === 'win32';
  return {
    url: `https://raw.githubusercontent.com/NousResearch/hermes-agent/${HERMES_COMMIT}/scripts/install.${windows ? 'ps1' : 'sh'}`,
    sha256: windows ? '61824d6b47be29ab793d0e72872cf56cd7a3e99cbe40abeb177a6c9eef52f485' : '034845e34289813ff5fb7fd3e071ec69f6b14aee8ba297a477b31dda6374cb86',
    maxBytes: 2 * 1024 * 1024,
  };
}
export function hermesInstallCommand(platform = process.platform): string {
  return `Verified official Hermes install.${platform === 'win32' ? 'ps1' : 'sh'} · commit ${HERMES_COMMIT.slice(0, 12)}`;
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

export function runInteractive(command: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal, cwd?: string): Promise<number> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, stdio: 'inherit', shell: false, signal });
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });
}

/** Run the official installer with terminal input, outside the named profile. */
export async function installHermes(signal: AbortSignal, env: NodeJS.ProcessEnv = process.env,
  options: { download?: typeof fetch; execute?: typeof runInteractive; artifact?: DownloadArtifact } = {}): Promise<void> {
  signal.throwIfAborted();
  const windows = process.platform === 'win32';
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-hermes-install-'));
  try {
    const script = await verifiedDownload(options.artifact || hermesInstaller(), signal, options.download || fetch);
    const file = path.join(temporary, windows ? 'install.ps1' : 'install.sh');
    await fs.writeFile(file, script, { mode: 0o600 });
    const childEnv = isolatedEnvironment(env, ['HERMES_HOME', 'HERMES_INSTALL_DIR'], temporary);
    // Pin the checkout as well as the bootstrap. Credentials and loader hooks
    // from the chat/server process never reach this installation subprocess.
    const code = await (options.execute || runInteractive)(windows ? 'powershell.exe' : 'bash',
      windows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, '-Commit', HERMES_COMMIT]
        : [file, '--commit', HERMES_COMMIT], childEnv, signal, temporary);
    signal.throwIfAborted();
    if (code !== 0) throw new Error(`Hermes installation did not complete (exit ${code}).`);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
