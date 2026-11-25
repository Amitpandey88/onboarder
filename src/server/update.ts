// Update detection, cache, and safe self-update for Onboarder.
//
// Follows the same supply-chain rules as `tools/install.ts`:
//   * Version detection reads only from npm's canonical registry over HTTPS,
//     with manual redirect validation, bounded body size, and strict SemVer
//     checks. Never transmits repository paths or telemetry.
//   * Auto-update refuses dirty git trees, non-main checkouts, ephemeral npx
//     caches, or unwritable global prefixes — explaining the exact manual
//     command instead of guessing or corrupting local work.
//   * Spawned `npm` and `git` commands run with `shell: false` (via `spawnArgv`
//     on Windows shims), `--ignore-scripts`, explicit registry pinning, and
//     `isolatedEnvironment()`.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PACKAGE_NAME, REPO_SLUG, compareVersions, isUpdateAvailable,
  isValidVersionString, npmPackageUrl, releaseNotesUrl, satisfiesMinimumNode,
  type InstallMethod, type UpdateEvent, type UpdateStatus,
} from '../shared/update.js';
import { configPath } from './config.js';
import { isolatedEnvironment } from './security/environment.js';
import { findOnPath, spawnArgv } from './tools/platform.js';
import { repositoryFromRemote } from '../cli/agent/github.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROJECT_ROOT = path.resolve(HERE, '..');

export const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org';
export const NPM_LATEST_URL = `${NPM_REGISTRY_ORIGIN}/${PACKAGE_NAME}/latest`;
export const GITHUB_RELEASES_TAG_URL = `https://api.github.com/repos/${REPO_SLUG}/releases/tags`;

export const UPDATE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_REGISTRY_BYTES = 256 * 1024;
const MAX_RELEASE_NOTES_BYTES = 128 * 1024;
const UPDATE_TIMEOUT_MS = 10 * 60 * 1000;

export interface CachedUpdateRecord {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string;
  requiredNode: string | null;
  tarball: string | null;
  integrity: string | null;
  releaseNotes?: string | null;
}

export interface InstallationInfo {
  packageName: string;
  currentVersion: string;
  projectRoot: string;
  method: InstallMethod;
  prefix: string | null;
  localRoot: string | null;
  canAutoUpdate: boolean;
  reason: string | null;
  manualCommand: string;
  npmBin: string | null;
  gitBin: string | null;
}

export interface RegistryRelease {
  version: string;
  requiredNode: string | null;
  tarball: string | null;
  integrity: string | null;
  checkedAt: string;
}

export interface UpdateCheckOptions {
  force?: boolean;
  cacheOnly?: boolean;
  includeNotes?: boolean;
  configFile?: string | null;
  cacheFile?: string | null;
  settings?: { updateCheck?: boolean } | null;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  projectRoot?: string;
  currentVersion?: string;
  platform?: NodeJS.Platform;
  execPath?: string;
  serverMode?: string | null;
  canRestart?: boolean;
  ttlMs?: number;
  timeoutMs?: number;
  now?: number;
  signal?: AbortSignal;
  writeCache?: boolean;
  runGit?: GitRunner;
  exists?: (p: string) => boolean;
  isWritable?: (p: string) => boolean;
}

export interface ApplyUpdateOptions extends UpdateCheckOptions {
  targetVersion?: string;
  spawnCommand?: CommandRunner;
}

export type GitRunner = (args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;
export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; onLine: (line: string) => void; signal?: AbortSignal },
) => Promise<number>;

let activeUpdate: Promise<Extract<UpdateEvent, { type: 'done' }>> | null = null;

export function isUpdating(): boolean {
  return activeUpdate !== null;
}

export function updateCachePath(configFile = configPath()): string {
  return path.join(path.dirname(path.resolve(configFile)), 'update-check.json');
}

export function isAutoUpdateCheckDisabled(env: NodeJS.ProcessEnv = process.env, settings?: { updateCheck?: boolean } | null): boolean {
  if (settings?.updateCheck === false) return true;
  if (['1', 'true', 'yes'].includes(String(env.ONBOARDER_NO_UPDATE_CHECK || '').trim().toLowerCase())) return true;
  if (['1', 'true', 'yes'].includes(String(env.NO_UPDATE_NOTIFIER || '').trim().toLowerCase())) return true;
  const ci = String(env.CI || '').trim().toLowerCase();
  return Boolean(ci && ci !== '0' && ci !== 'false');
}

export function readInstalledPackage(projectRoot = DEFAULT_PROJECT_ROOT): { name: string; version: string } {
  const pkgPath = path.join(projectRoot, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown };
  const name = typeof parsed.name === 'string' && parsed.name ? parsed.name : PACKAGE_NAME;
  const version = typeof parsed.version === 'string' && parsed.version ? parsed.version : '0.0.0';
  return { name, version };
}

function defaultIsWritable(target: string): boolean {
  try {
    fs.accessSync(target, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function findNpmBinary(options: { execPath?: string; platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; exists?: (p: string) => boolean } = {}): string | null {
  const platform = options.platform || process.platform;
  const execPath = options.execPath || process.execPath;
  const env = options.env || process.env;
  const exists = options.exists || ((p: string) => fs.existsSync(p));
  if (execPath) {
    const binDir = path.dirname(execPath);
    const names = platform === 'win32' ? ['npm.cmd', 'npm.exe', 'npm'] : ['npm'];
    for (const name of names) {
      const candidate = path.join(binDir, name);
      try { if (exists(candidate)) return candidate; } catch { /* ignore */ }
    }
  }
  return findOnPath('npm', { platform, envPath: env.PATH, pathext: env.PATHEXT, exists });
}

function manualCommandFor(method: InstallMethod, version?: string | null, localRoot?: string | null): string {
  const target = isValidVersionString(version) ? `${PACKAGE_NAME}@${version}` : `${PACKAGE_NAME}@latest`;
  switch (method) {
    case 'source':
      return 'git pull --ff-only && npm ci --ignore-scripts && npm run build';
    case 'npm-local':
      return localRoot ? `npm --prefix ${localRoot} install --ignore-scripts ${target}` : `npm install --ignore-scripts ${target}`;
    case 'npx':
      return `npx ${target}`;
    case 'npm-global':
    case 'standalone':
    default:
      return `npm install -g --ignore-scripts ${target}`;
  }
}

function detectNodeModulesLayout(
  projectRoot: string,
  packageName: string,
  platform: NodeJS.Platform,
  exists: (p: string) => boolean,
): { method: 'npm-local' | 'npm-global'; prefix: string | null; localRoot: string | null } | null {
  const normalized = path.resolve(projectRoot);
  const parent = path.dirname(normalized);
  if (path.basename(parent) !== 'node_modules') return null;

  const container = path.dirname(parent);
  const localPkgPath = path.join(container, 'package.json');
  if (exists(localPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(localPkgPath, 'utf8')) as Record<string, Record<string, unknown> | undefined>;
      const hasDep = ['dependencies', 'devDependencies', 'optionalDependencies']
        .some((section) => Boolean(pkg?.[section] && Object.hasOwn(pkg[section]!, packageName)));
      if (hasDep) return { method: 'npm-local', prefix: null, localRoot: container };
    } catch {
      /* malformed parent package.json falls through to global detection */
    }
  }

  // Global npm layout: `<prefix>/lib/node_modules/<pkg>` on POSIX or `<prefix>/node_modules/<pkg>` on Windows.
  const prefix = platform !== 'win32' && path.basename(container) === 'lib' ? path.dirname(container) : container;
  return { method: 'npm-global', prefix, localRoot: null };
}

export function detectInstallationSync(options: {
  projectRoot?: string;
  currentVersion?: string;
  targetVersion?: string | null;
  platform?: NodeJS.Platform;
  execPath?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (p: string) => boolean;
  isWritable?: (p: string) => boolean;
} = {}): InstallationInfo {
  const projectRoot = path.resolve(options.projectRoot || DEFAULT_PROJECT_ROOT);
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const exists = options.exists || ((p: string) => fs.existsSync(p));
  const isWritable = options.isWritable || defaultIsWritable;

  let pkg = { name: PACKAGE_NAME, version: options.currentVersion || '0.0.0' };
  try {
    const read = readInstalledPackage(projectRoot);
    pkg = { name: read.name, version: options.currentVersion || read.version };
  } catch {
    /* allow synthetic root in tests */
  }

  const npmBin = findNpmBinary({ execPath: options.execPath, platform, env, exists });
  const gitBin = findOnPath('git', { platform, envPath: env.PATH, pathext: env.PATHEXT, exists });

  if (exists(path.join(projectRoot, '.git'))) {
    return {
      packageName: pkg.name,
      currentVersion: pkg.version,
      projectRoot,
      method: 'source',
      prefix: null,
      localRoot: null,
      canAutoUpdate: Boolean(gitBin && npmBin),
      reason: !gitBin ? 'Git is not installed on PATH.' : !npmBin ? 'npm is not installed on PATH.' : null,
      manualCommand: manualCommandFor('source', options.targetVersion),
      npmBin,
      gitBin,
    };
  }

  if (/[/\\]_npx[/\\]/.test(projectRoot)) {
    return {
      packageName: pkg.name,
      currentVersion: pkg.version,
      projectRoot,
      method: 'npx',
      prefix: null,
      localRoot: null,
      canAutoUpdate: false,
      reason: 'Running from a temporary npx cache. Install globally or re-run with @latest.',
      manualCommand: manualCommandFor('npx', options.targetVersion),
      npmBin,
      gitBin,
    };
  }

  const nm = detectNodeModulesLayout(projectRoot, pkg.name, platform, exists);
  if (nm?.method === 'npm-local') {
    const writable = isWritable(path.dirname(projectRoot));
    return {
      packageName: pkg.name,
      currentVersion: pkg.version,
      projectRoot,
      method: 'npm-local',
      prefix: null,
      localRoot: nm.localRoot,
      canAutoUpdate: Boolean(npmBin) && writable,
      reason: !npmBin
        ? 'npm is not installed on PATH.'
        : !writable
          ? `Project directory (${nm.localRoot}) is not writable by this user.`
          : null,
      manualCommand: manualCommandFor('npm-local', options.targetVersion, nm.localRoot),
      npmBin,
      gitBin,
    };
  }

  if (nm?.method === 'npm-global') {
    const writable = isWritable(projectRoot) || isWritable(path.dirname(projectRoot));
    return {
      packageName: pkg.name,
      currentVersion: pkg.version,
      projectRoot,
      method: 'npm-global',
      prefix: nm.prefix,
      localRoot: null,
      canAutoUpdate: Boolean(npmBin) && writable,
      reason: !npmBin
        ? 'npm is not installed on PATH.'
        : !writable
          ? `Global install directory (${path.dirname(projectRoot)}) is not writable by this user.`
          : null,
      manualCommand: manualCommandFor('npm-global', options.targetVersion),
      npmBin,
      gitBin,
    };
  }

  return {
    packageName: pkg.name,
    currentVersion: pkg.version,
    projectRoot,
    method: 'standalone',
    prefix: null,
    localRoot: null,
    canAutoUpdate: false,
    reason: 'Installed outside npm and Git; update manually.',
    manualCommand: manualCommandFor('standalone', options.targetVersion),
    npmBin,
    gitBin,
  };
}

function defaultGitRunner(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', cwd, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...isolatedEnvironment(), GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes' },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 64 * 1024) stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 64 * 1024) stderr += String(chunk);
    });
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Verify whether a Git source checkout is safe to fast-forward update in place. */
export async function assessInstallation(
  base: InstallationInfo,
  runGit: GitRunner = defaultGitRunner,
): Promise<InstallationInfo> {
  if (base.method !== 'source' || !base.canAutoUpdate) return base;
  try {
    const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], base.projectRoot);
    const branch = branchRes.stdout.trim();
    if (branchRes.code !== 0 || branch !== 'main') {
      return {
        ...base,
        canAutoUpdate: false,
        reason: branch && branch !== 'HEAD'
          ? `Source checkout is on branch "${branch}" (in-place update only runs on clean main).`
          : 'Source checkout is in detached HEAD state (in-place update only runs on clean main).',
      };
    }
    const remoteRes = await runGit(['remote', 'get-url', 'origin'], base.projectRoot);
    const repo = repositoryFromRemote(remoteRes.stdout.trim());
    if (remoteRes.code !== 0 || !repo || repo.toLowerCase() !== REPO_SLUG.toLowerCase()) {
      return {
        ...base,
        canAutoUpdate: false,
        reason: 'Git origin remote does not point to the official Onboarder repository.',
      };
    }
    const statusRes = await runGit(['status', '--porcelain', '--untracked-files=all'], base.projectRoot);
    if (statusRes.code !== 0 || statusRes.stdout.trim().length > 0) {
      return {
        ...base,
        canAutoUpdate: false,
        reason: 'Source checkout has uncommitted or untracked changes.',
      };
    }
    return base;
  } catch (error) {
    return {
      ...base,
      canAutoUpdate: false,
      reason: `Could not inspect Git checkout: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function fetchBoundedJson(
  targetUrl: string,
  allowedOrigins: readonly string[],
  maxBytes: number,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const allowed = new Set(allowedOrigins);
  const validate = (url: URL) => {
    if (url.protocol !== 'https:' || url.username || url.password || !allowed.has(url.origin)) {
      throw new Error('Update endpoint URL or redirect is not trusted.');
    }
  };
  const bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]);
  let current = new URL(targetUrl);
  let response: Response;
  for (let hop = 0; ; hop++) {
    bounded.throwIfAborted();
    validate(current);
    response = await fetchImpl(current.href, {
      method: 'GET',
      redirect: 'manual',
      signal: bounded,
      headers: { accept: 'application/json', ...headers },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (hop >= 3 || !location) throw new Error('Too many or invalid redirects while checking updates.');
    current = new URL(location, current);
  }
  if (response.url) validate(new URL(response.url));
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Registry answered HTTP ${response.status}.`);
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error('Update metadata exceeded size limit.');
  }
  if (!response.body) {
    // Some mocked Responses in unit tests may supply .json()/.text() without a ReadableStream body.
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Update metadata exceeded size limit.');
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      bounded.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) throw new Error('Update metadata exceeded size limit.');
      chunks.push(Buffer.from(chunk.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function fetchRegistryRelease(options: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  now?: number;
} = {}): Promise<RegistryRelease> {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? 6000;
  const raw = await fetchBoundedJson(
    NPM_LATEST_URL,
    [NPM_REGISTRY_ORIGIN],
    MAX_REGISTRY_BYTES,
    timeoutMs,
    fetchImpl,
    options.signal,
    { 'user-agent': `${PACKAGE_NAME}-update-check` },
  ) as Record<string, unknown>;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Registry returned malformed package metadata.');
  }
  if (raw.name !== undefined && raw.name !== PACKAGE_NAME) {
    throw new Error('Registry metadata package name did not match.');
  }
  const version = raw.version;
  if (!isValidVersionString(version)) {
    throw new Error('Registry returned an invalid package version.');
  }
  const dist = raw.dist && typeof raw.dist === 'object' ? raw.dist as Record<string, unknown> : {};
  const tarball = typeof dist.tarball === 'string' && dist.tarball.startsWith(`${NPM_REGISTRY_ORIGIN}/${PACKAGE_NAME}/-/`)
    ? dist.tarball : null;
  const integrity = typeof dist.integrity === 'string' && /^sha\d+-[A-Za-z0-9+/=]+$/.test(dist.integrity)
    ? dist.integrity : null;
  const engines = raw.engines && typeof raw.engines === 'object' ? raw.engines as Record<string, unknown> : {};
  const requiredNode = typeof engines.node === 'string' ? engines.node.slice(0, 64) : null;

  return {
    version,
    requiredNode,
    tarball,
    integrity,
    checkedAt: new Date(options.now ?? Date.now()).toISOString(),
  };
}

export async function fetchReleaseNotes(version: string, options: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
} = {}): Promise<string | null> {
  if (!isValidVersionString(version)) return null;
  try {
    const raw = await fetchBoundedJson(
      `${GITHUB_RELEASES_TAG_URL}/v${version}`,
      ['https://api.github.com'],
      MAX_RELEASE_NOTES_BYTES,
      options.timeoutMs ?? 2500,
      options.fetchImpl || fetch,
      options.signal,
      {
        accept: 'application/vnd.github+json',
        'user-agent': `${PACKAGE_NAME}-update-check`,
      },
    ) as Record<string, unknown>;
    if (!raw || typeof raw.body !== 'string') return null;
    const cleaned = raw.body.replace(/\r\n?|\n/g, '\n').trim();
    return cleaned ? cleaned.slice(0, 4000) : null;
  } catch {
    return null;
  }
}

export async function readUpdateCache(cacheFile: string): Promise<CachedUpdateRecord | null> {
  try {
    const stat = await fsp.lstat(cacheFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_REGISTRY_BYTES) return null;
    const parsed = JSON.parse(await fsp.readFile(cacheFile, 'utf8')) as Partial<CachedUpdateRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.checkedAt !== 'string' || !Number.isFinite(Date.parse(parsed.checkedAt))) return null;
    if (!isValidVersionString(parsed.latestVersion) || typeof parsed.currentVersion !== 'string') return null;
    return {
      checkedAt: parsed.checkedAt,
      currentVersion: parsed.currentVersion,
      latestVersion: parsed.latestVersion,
      requiredNode: typeof parsed.requiredNode === 'string' ? parsed.requiredNode : null,
      tarball: typeof parsed.tarball === 'string' ? parsed.tarball : null,
      integrity: typeof parsed.integrity === 'string' ? parsed.integrity : null,
      releaseNotes: typeof parsed.releaseNotes === 'string' ? parsed.releaseNotes : null,
    };
  } catch {
    return null;
  }
}

export async function writeUpdateCache(cacheFile: string, record: CachedUpdateRecord): Promise<void> {
  try {
    const dir = path.dirname(cacheFile);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    await fsp.rename(temp, cacheFile);
    await fsp.chmod(cacheFile, 0o600);
  } catch {
    /* read-only config directories must never break update checking */
  }
}

export function buildUpdateStatus(
  install: InstallationInfo,
  options: {
    latestVersion: string | null;
    checkedAt: string | null;
    fromCache: boolean;
    checkDisabled: boolean;
    requiredNode?: string | null;
    releaseNotes?: string | null;
    error?: string | null;
    serverMode?: string | null;
    canRestart?: boolean;
  },
): UpdateStatus {
  const latestVersion = options.latestVersion;
  const updateAvailable = isUpdateAvailable(install.currentVersion, latestVersion);
  const upToDate = Boolean(latestVersion && !updateAvailable && compareVersions(install.currentVersion, latestVersion) >= 0);
  const nodeCompatible = satisfiesMinimumNode(process.versions.node, options.requiredNode);

  let canAutoUpdate = install.canAutoUpdate;
  let reason = install.reason;
  if (updateAvailable && !nodeCompatible) {
    canAutoUpdate = false;
    reason = `Onboarder v${latestVersion} requires Node ${options.requiredNode} (running v${process.versions.node}).`;
  }

  return {
    packageName: install.packageName,
    currentVersion: install.currentVersion,
    latestVersion,
    updateAvailable,
    upToDate,
    checkedAt: options.checkedAt,
    fromCache: options.fromCache,
    checkDisabled: options.checkDisabled,
    installMethod: install.method,
    canAutoUpdate,
    canRestart: Boolean(options.canRestart),
    serverMode: options.serverMode ?? null,
    reason,
    manualCommand: manualCommandFor(install.method, latestVersion || undefined, install.localRoot),
    releaseUrl: releaseNotesUrl(latestVersion),
    npmUrl: npmPackageUrl(latestVersion),
    nodeCompatible,
    requiredNode: options.requiredNode ?? null,
    releaseNotes: options.releaseNotes ?? null,
    installing: isUpdating(),
    error: options.error ?? null,
  };
}

function resolveCacheFile(options: UpdateCheckOptions): string | null {
  if (options.cacheFile !== undefined) return options.cacheFile;
  if (options.configFile === null) return null;
  if (options.configFile) return updateCachePath(options.configFile);
  return updateCachePath(configPath(options.env));
}

export async function checkForUpdates(options: UpdateCheckOptions = {}): Promise<UpdateStatus> {
  const baseInstall = detectInstallationSync({
    projectRoot: options.projectRoot,
    currentVersion: options.currentVersion,
    platform: options.platform,
    execPath: options.execPath,
    env: options.env,
    exists: options.exists,
    isWritable: options.isWritable,
  });
  const install = await assessInstallation(baseInstall, options.runGit);
  const env = options.env || process.env;
  const disabled = isAutoUpdateCheckDisabled(env, options.settings);
  const cacheFile = resolveCacheFile(options);
  const ttlMs = options.ttlMs ?? UPDATE_CACHE_TTL_MS;
  const now = options.now ?? Date.now();

  const cached = cacheFile ? await readUpdateCache(cacheFile) : null;
  const cacheValid = Boolean(
    cached
    && cached.currentVersion === install.currentVersion
    && (now - Date.parse(cached.checkedAt)) < ttlMs,
  );

  // Explicit `force: true` still runs when the user asks to check right now,
  // unless `cacheOnly: true` was requested (startup banners / fast CLI hints).
  if (options.cacheOnly || (!options.force && (cacheValid || disabled))) {
    const usable = cached && compareVersions(cached.latestVersion, install.currentVersion) >= 0 ? cached : null;
    return buildUpdateStatus(install, {
      latestVersion: usable ? usable.latestVersion : (cached && cached.currentVersion === install.currentVersion ? cached.latestVersion : null),
      checkedAt: cached?.checkedAt || null,
      fromCache: Boolean(cached),
      checkDisabled: disabled && !options.force,
      requiredNode: cached?.requiredNode ?? null,
      releaseNotes: cached?.releaseNotes ?? null,
      serverMode: options.serverMode,
      canRestart: options.canRestart,
    });
  }

  try {
    const release = await fetchRegistryRelease({
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs ?? 6000,
      signal: options.signal,
      now,
    });
    const available = isUpdateAvailable(install.currentVersion, release.version);
    const notes = options.includeNotes && available
      ? (cached?.latestVersion === release.version && cached.releaseNotes
          ? cached.releaseNotes
          : await fetchReleaseNotes(release.version, { fetchImpl: options.fetchImpl, signal: options.signal }))
      : (cached?.latestVersion === release.version ? cached.releaseNotes ?? null : null);

    if (cacheFile && options.writeCache !== false) {
      await writeUpdateCache(cacheFile, {
        checkedAt: release.checkedAt,
        currentVersion: install.currentVersion,
        latestVersion: release.version,
        requiredNode: release.requiredNode,
        tarball: release.tarball,
        integrity: release.integrity,
        releaseNotes: notes,
      });
    }

    return buildUpdateStatus(install, {
      latestVersion: release.version,
      checkedAt: release.checkedAt,
      fromCache: false,
      checkDisabled: false,
      requiredNode: release.requiredNode,
      releaseNotes: notes,
      serverMode: options.serverMode,
      canRestart: options.canRestart,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildUpdateStatus(install, {
      latestVersion: cached?.latestVersion ?? null,
      checkedAt: cached?.checkedAt ?? null,
      fromCache: Boolean(cached),
      checkDisabled: false,
      requiredNode: cached?.requiredNode ?? null,
      releaseNotes: cached?.releaseNotes ?? null,
      error: `Could not check for updates: ${message}`,
      serverMode: options.serverMode,
      canRestart: options.canRestart,
    });
  }
}

/** Fire-and-forget cache refresh for interactive long-lived sessions; never throws or blocks exit. */
export function refreshUpdateCacheInBackground(options: UpdateCheckOptions = {}): void {
  const env = options.env || process.env;
  if (isAutoUpdateCheckDisabled(env, options.settings)) return;
  void checkForUpdates({
    ...options,
    force: false,
    cacheOnly: false,
    timeoutMs: options.timeoutMs ?? 3500,
  }).catch(() => {});
}

function defaultSpawnCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; onLine: (line: string) => void; signal?: AbortSignal },
): Promise<number> {
  const { command: cmd, args: argv } = spawnArgv([command, ...args]);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, argv, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd,
        env: options.env,
        detached: process.platform !== 'win32',
        shell: false,
      });
    } catch (error) {
      options.onLine(`Could not start ${cmd}: ${error instanceof Error ? error.message : String(error)}`);
      resolve(-1);
      return;
    }

    let pending = '';
    const feed = (chunk: Buffer | string) => {
      pending += String(chunk);
      if (pending.length > 64 * 1024) pending = pending.slice(-64 * 1024);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) options.onLine(line);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);

    const stopChild = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        killer.on('error', () => child.kill());
        killer.unref();
      } else if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    };

    const onAbort = () => {
      stopChild();
      options.onLine('Update cancelled.');
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      stopChild();
      options.onLine(`${cmd} timed out and was stopped.`);
    }, UPDATE_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      options.onLine(`Could not run ${cmd}: ${error.message}`);
      resolve(-1);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (pending.trim()) options.onLine(pending);
      resolve(code ?? -1);
    });
  });
}

export function buildUpdateSteps(
  install: InstallationInfo,
  targetVersion: string,
  ctx: { tmpDir: string; emptyHooksDir: string },
): Array<{ command: string; args: string[]; cwd: string; label: string }> {
  if (!isValidVersionString(targetVersion)) {
    throw new Error('Refused invalid target version string.');
  }
  const spec = `${install.packageName}@${targetVersion}`;

  if (install.method === 'npm-global') {
    if (!install.npmBin) throw new Error('npm is not installed on PATH.');
    const args = [
      'install', '-g', '--ignore-scripts', `--registry=${NPM_REGISTRY_ORIGIN}/`, '--prefer-online',
      ...(install.prefix ? ['--prefix', install.prefix] : []),
      spec,
    ];
    return [{ command: install.npmBin, args, cwd: ctx.tmpDir, label: `npm install -g ${spec}` }];
  }

  if (install.method === 'npm-local') {
    if (!install.npmBin || !install.localRoot) throw new Error('npm local installation target is unavailable.');
    const args = ['install', '--ignore-scripts', `--registry=${NPM_REGISTRY_ORIGIN}/`, '--prefer-online', spec];
    return [{ command: install.npmBin, args, cwd: install.localRoot, label: `npm install ${spec}` }];
  }

  if (install.method === 'source') {
    if (!install.gitBin || !install.npmBin) throw new Error('git and npm are both required to update a source checkout.');
    return [
      {
        command: install.gitBin,
        args: ['-C', install.projectRoot, '-c', `core.hooksPath=${ctx.emptyHooksDir}`, '-c', 'submodule.recurse=false', 'pull', '--ff-only', '--no-rebase'],
        cwd: install.projectRoot,
        label: 'git pull --ff-only',
      },
      {
        command: install.npmBin,
        args: ['ci', '--ignore-scripts', `--registry=${NPM_REGISTRY_ORIGIN}/`],
        cwd: install.projectRoot,
        label: 'npm ci --ignore-scripts',
      },
      {
        command: install.npmBin,
        args: ['run', 'build'],
        cwd: install.projectRoot,
        label: 'npm run build',
      },
    ];
  }

  throw new Error(install.reason || 'Automatic update is not supported for this installation method.');
}

export async function applyUpdate(
  options: ApplyUpdateOptions = {},
  onEvent: (event: UpdateEvent) => void = () => {},
): Promise<Extract<UpdateEvent, { type: 'done' }>> {
  if (activeUpdate) {
    const busyResult: Extract<UpdateEvent, { type: 'done' }> = {
      type: 'done',
      ok: false,
      previousVersion: options.currentVersion || '0.0.0',
      currentVersion: options.currentVersion || '0.0.0',
      error: 'An update is already in progress.',
    };
    onEvent(busyResult);
    return busyResult;
  }

  const run = async (): Promise<Extract<UpdateEvent, { type: 'done' }>> => {
    const log = (line: string) => onEvent({ type: 'log', line });
    const emitStatus = (phase: 'checking' | 'installing' | 'verifying', message: string) =>
      onEvent({ type: 'status', phase, message });

    emitStatus('checking', 'Checking npm registry for the latest Onboarder release…');
    const status = await checkForUpdates({
      ...options,
      force: true,
      includeNotes: false,
      writeCache: false,
    });

    const finish = (result: Omit<Extract<UpdateEvent, { type: 'done' }>, 'type'>): Extract<UpdateEvent, { type: 'done' }> => {
      const event: Extract<UpdateEvent, { type: 'done' }> = { type: 'done', ...result };
      onEvent(event);
      return event;
    };

    if (status.error && !options.targetVersion) {
      return finish({
        ok: false,
        previousVersion: status.currentVersion,
        currentVersion: status.currentVersion,
        manualCommand: status.manualCommand,
        error: status.error,
      });
    }

    const targetVersion = options.targetVersion || status.latestVersion;
    if (!isValidVersionString(targetVersion)) {
      return finish({
        ok: false,
        previousVersion: status.currentVersion,
        currentVersion: status.currentVersion,
        manualCommand: status.manualCommand,
        error: 'No valid release version was found to install.',
      });
    }

    if (!options.force && !isUpdateAvailable(status.currentVersion, targetVersion)) {
      return finish({
        ok: true,
        alreadyCurrent: true,
        previousVersion: status.currentVersion,
        currentVersion: status.currentVersion,
        updatedTo: status.currentVersion,
      });
    }

    const install = await assessInstallation(
      detectInstallationSync({
        projectRoot: options.projectRoot,
        currentVersion: options.currentVersion,
        targetVersion,
        platform: options.platform,
        execPath: options.execPath,
        env: options.env,
        exists: options.exists,
        isWritable: options.isWritable,
      }),
      options.runGit,
    );

    if (!status.nodeCompatible && !options.force) {
      return finish({
        ok: false,
        previousVersion: install.currentVersion,
        currentVersion: install.currentVersion,
        manualCommand: install.manualCommand,
        error: `Onboarder v${targetVersion} requires Node ${status.requiredNode} (running v${process.versions.node}).`,
      });
    }

    if (!install.canAutoUpdate) {
      return finish({
        ok: false,
        previousVersion: install.currentVersion,
        currentVersion: install.currentVersion,
        manualCommand: install.manualCommand,
        error: `${install.reason || 'Automatic update is unavailable here.'} Run manually: ${install.manualCommand}`,
      });
    }

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'onboarder-update-'));
    const emptyHooksDir = path.join(tmpDir, 'empty-hooks');
    await fsp.mkdir(emptyHooksDir, { mode: 0o700 });
    const runner = options.spawnCommand || defaultSpawnCommand;

    try {
      const steps = buildUpdateSteps(install, targetVersion, { tmpDir, emptyHooksDir });
      const childEnv = isolatedEnvironment(options.env || process.env, ['NPM_CONFIG_PREFIX', 'GIT_SSH_COMMAND'], tmpDir);
      if (install.prefix) childEnv.NPM_CONFIG_PREFIX = install.prefix;

      emitStatus('installing', `Updating Onboarder v${install.currentVersion} → v${targetVersion}…`);
      log(`Installing ${install.packageName}@${targetVersion} (${install.method})…`);

      for (const step of steps) {
        log(`$ ${step.label}`);
        const code = await runner(step.command, step.args, {
          cwd: step.cwd,
          env: childEnv,
          onLine: log,
          signal: options.signal,
        });
        if (code !== 0) {
          const windowsHint = process.platform === 'win32'
            ? ' On Windows, stop a running server with `onboarder stop` before updating.'
            : '';
          return finish({
            ok: false,
            previousVersion: install.currentVersion,
            currentVersion: install.currentVersion,
            manualCommand: install.manualCommand,
            error: `Update step "${step.label}" exited with code ${code}.${windowsHint}`,
          });
        }
      }

      emitStatus('verifying', 'Verifying updated installation…');
      let installedVersion = targetVersion;
      if (!options.spawnCommand) {
        try {
          installedVersion = readInstalledPackage(install.projectRoot).version;
        } catch {
          /* keep targetVersion if package.json moved transiently */
        }
      }

      const cacheFile = resolveCacheFile(options);
      if (cacheFile && options.writeCache !== false) {
        await writeUpdateCache(cacheFile, {
          checkedAt: new Date(options.now ?? Date.now()).toISOString(),
          currentVersion: installedVersion,
          latestVersion: targetVersion,
          requiredNode: status.requiredNode,
          tarball: null,
          integrity: null,
          releaseNotes: status.releaseNotes,
        });
      }

      log(`✓ Updated Onboarder to v${installedVersion}.`);
      return finish({
        ok: true,
        previousVersion: install.currentVersion,
        currentVersion: installedVersion,
        updatedTo: installedVersion,
        restartRequired: true,
        canRestart: Boolean(options.canRestart),
      });
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  activeUpdate = run();
  try {
    return await activeUpdate;
  } finally {
    activeUpdate = null;
  }
}

export function canVerifyNodeUpdate(version: string): boolean {
  return spawnSync(process.execPath, ['-v'], { encoding: 'utf8' }).status === 0 && isValidVersionString(version);
}
