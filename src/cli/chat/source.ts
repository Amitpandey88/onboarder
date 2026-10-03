import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { agentHome } from '../agent/config.js';
import { repositoryFromRemote } from '../agent/github.js';
import { runProcess } from '../agent/process.js';

export interface ChatSource { root: string; sourceUrl?: string; reused: boolean }
interface SourceOptions { env?: NodeJS.ProcessEnv; execute?: typeof runProcess }
export function isRemoteSource(value: string): boolean { return /^(?:https?:\/\/|ssh:\/\/|git@)/i.test(value); }
export function githubSource(value: string): { repository: string; url: string; gitUrl: string } {
  const raw = value.trim(), repository = repositoryFromRemote(raw);
  if (!repository) throw new Error('Enter a GitHub repository URL: https://github.com/owner/repo or git@github.com:owner/repo.git.');
  const url = `https://github.com/${repository}`;
  const gitUrl = /^https:/i.test(raw) ? url + '.git' : `git@github.com:${repository}.git`;
  return { repository, url, gitUrl };
}

/** Persistent checkouts keep conversations and agent worktrees usable after exit. */
export class ChatSources {
  constructor(readonly home = agentHome(), private options: SourceOptions = {}) {}
  get directory() { return path.join(this.home, 'repositories'); }
  private target(repository: string) {
    const key = repository.toLowerCase();
    return path.join(this.directory, key.split('/')[1]!.slice(0, 40) + '-' + createHash('sha256').update(key).digest('hex').slice(0, 16));
  }
  private async git(args: string[], signal?: AbortSignal, hooks?: string) {
    const env = this.options.env || process.env;
    const result = await (this.options.execute || runProcess)('git', [
      ...(hooks ? ['-c', `core.hooksPath=${hooks}`] : []), '-c', 'submodule.recurse=false', ...args,
    ], { env: { ...env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: env.GIT_SSH_COMMAND || 'ssh -oBatchMode=yes' }, signal, timeoutMs: 180000, maxBytes: 1024 * 1024 });
    if (result.code !== 0) throw new Error(`Could not open/update the repository. ${result.stderr.trim().slice(-1200) || 'Git exited with ' + result.code}. Private repositories require your existing Git credentials.`);
    return result.stdout.trim();
  }
  private async verify(target: string, repository: string, signal?: AbortSignal) {
    const stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The saved repository path is not a regular directory.');
    const root = await fs.realpath(target);
    if (await fs.realpath(await this.git(['-C', root, 'rev-parse', '--show-toplevel'], signal)) !== root) throw new Error('The saved checkout does not belong to this repository.');
    const origin = await this.git(['-C', root, 'remote', 'get-url', 'origin'], signal);
    if (repositoryFromRemote(origin)?.toLowerCase() !== repository.toLowerCase()) throw new Error('The saved checkout origin changed. Its files were preserved.');
    return root;
  }
  async open(target: string, from = process.cwd(), signal?: AbortSignal, progress: (text: string) => void = () => {}): Promise<ChatSource> {
    signal?.throwIfAborted();
    if (!isRemoteSource(target)) {
      const folder = target.replace(/^~(?=\/|$)/, os.homedir());
      const root = await fs.realpath(path.resolve(from, folder));
      if (!(await fs.stat(root)).isDirectory()) throw new Error('Choose a repository folder or GitHub URL.');
      signal?.throwIfAborted();
      return { root, reused: false };
    }
    const source = githubSource(target), destination = this.target(source.repository);
    const existing = await fs.lstat(destination).then(() => true).catch(e => { if (e.code !== 'ENOENT') throw e; return false; });
    if (existing) {
      const root = await this.verify(destination, source.repository, signal);
      progress(`Using saved checkout of ${source.repository}. Use /pull to fetch the latest changes.`);
      return { root, sourceUrl: source.url, reused: true };
    }
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const staging = await fs.mkdtemp(path.join(this.directory, '.clone-'));
    const hooks = path.join(staging, 'empty-hooks'), checkout = path.join(staging, 'checkout');
    await fs.mkdir(hooks, { mode: 0o700 });
    try {
      progress(`Cloning ${source.repository}… Ctrl-C to stop.`);
      await this.git(['clone', '--filter=blob:none', '--single-branch', '--', source.gitUrl, checkout], signal, hooks);
      signal?.throwIfAborted();
      await this.verify(checkout, source.repository, signal);
      await fs.chmod(checkout, 0o700);
      try { await fs.rename(checkout, destination); }
      catch (e) {
        // Two chats may clone the same URL concurrently. Reuse the complete
        // winner, preserving it rather than replacing its existing contents.
        if (!['EEXIST', 'ENOTEMPTY'].includes((e as NodeJS.ErrnoException).code || '')) throw e;
      }
      const root = await this.verify(destination, source.repository, signal);
      progress(`Ready: ${source.repository}\nSaved checkout: ${root}\nAsk a question, or use /map to explore.`);
      return { root, sourceUrl: source.url, reused: false };
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
  async pull(root: string, signal?: AbortSignal, progress: (text: string) => void = () => {}) {
    const origin = await this.git(['-C', root, 'remote', 'get-url', 'origin'], signal);
    const repository = repositoryFromRemote(origin);
    if (!repository || await fs.realpath(this.target(repository)).catch(() => null) !== root) throw new Error('/pull updates a saved GitHub checkout. Open one with /repo <GitHub URL> first.');
    await this.verify(root, repository, signal);
    if (await this.git(['-C', root, 'status', '--porcelain', '--untracked-files=all'], signal)) throw new Error('The checkout has local changes. Preserve or commit them before /pull.');
    const hooks = path.join(this.directory, '.pull-hooks-' + randomUUID());
    await fs.mkdir(hooks, { mode: 0o700 });
    try {
      progress(`Pulling latest changes for ${repository}…`);
      const result = await this.git(['-C', root, 'pull', '--ff-only', '--no-rebase'], signal, hooks);
      return result || 'Repository is up to date.';
    } finally { await fs.rm(hooks, { recursive: true, force: true }); }
  }
}
