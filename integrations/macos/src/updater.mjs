import { createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export const GITHUB_RELEASES_API = 'https://api.github.com/repos/Amitpandey88/onboarder/releases?per_page=20';
export const GITHUB_RELEASES_PAGE = 'https://github.com/Amitpandey88/onboarder/releases';
export const BUNDLE_IDENTIFIER = 'io.github.amitpandey88.onboarder';
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const METADATA_MAX_BYTES = 1024 * 1024;
const CHECKSUM_MAX_BYTES = 256 * 1024;
const DOWNLOAD_MAX_BYTES = 600 * 1024 * 1024;
const ALLOWED_METADATA_HOSTS = new Set(['api.github.com', 'github.com']);
const ALLOWED_ASSET_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);

function splitCoreAndPre(raw) {
  const dash = raw.indexOf('-');
  if (dash === -1) return [raw, ''];
  return [raw.slice(0, dash), raw.slice(dash + 1)];
}

export function normalizeMacosVersion(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value) return null;
  if (value.startsWith('macos-')) value = value.slice('macos-'.length);
  if (value.startsWith('v') || value.startsWith('V')) value = value.slice(1);
  if (!value || value.length > 64) return null;
  const plus = value.indexOf('+');
  if (plus !== -1) value = value.slice(0, plus);
  return parseSemver(value) ? value : null;
}

export function parseSemver(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (value.startsWith('macos-')) value = value.slice('macos-'.length);
  if (value.startsWith('v') || value.startsWith('V')) value = value.slice(1);
  if (!value || value.length > 64) return null;
  const plus = value.indexOf('+');
  if (plus !== -1) value = value.slice(0, plus);
  const [core, preRaw] = splitCoreAndPre(value);
  const parts = core.split('.');
  if (parts.length !== 3) return null;
  const nums = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d*)$/.test(part)) return null;
    nums.push(Number(part));
  }
  const pre = [];
  if (preRaw !== '') {
    for (const id of preRaw.split('.')) {
      if (!id || !/^[0-9A-Za-z-]+$/.test(id)) return null;
      if (/^\d+$/.test(id) && id.length > 1 && id.startsWith('0')) return null;
      pre.push(id);
    }
  }
  return { major: nums[0], minor: nums[1], patch: nums[2], pre };
}

export function compareVersions(aRaw, bRaw) {
  const a = parseSemver(aRaw);
  const b = parseSemver(bRaw);
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  const len = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < len; i++) {
    const ai = a.pre[i];
    const bi = b.pre[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const aNum = /^\d+$/.test(ai) ? Number(ai) : null;
    const bNum = /^\d+$/.test(bi) ? Number(bi) : null;
    if (aNum !== null && bNum !== null) {
      if (aNum !== bNum) return aNum > bNum ? 1 : -1;
      continue;
    }
    if (aNum !== null) return -1;
    if (bNum !== null) return 1;
    if (ai !== bi) return ai > bi ? 1 : -1;
  }
  return 0;
}

export function isUpdateAvailable(currentVersion, latestVersion) {
  if (!parseSemver(currentVersion) || !parseSemver(latestVersion)) return false;
  return compareVersions(latestVersion, currentVersion) > 0;
}

export function isUpdateEnvOptedOut(env = process.env) {
  const flag = String(env.ONBOARDER_NO_UPDATE_CHECK || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function parseSha256Sums(text) {
  const map = new Map();
  if (typeof text !== 'string') return map;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) continue;
    map.set(path.basename(match[2].trim()), match[1].toLowerCase());
  }
  return map;
}

function validateRemoteUrl(rawUrl, allowedHosts, allowHttpForTests = false) {
  const url = new URL(rawUrl);
  if (url.username || url.password) {
    throw new Error('Blocked update URL containing embedded credentials.');
  }
  const allowedScheme = allowHttpForTests && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    ? url.protocol === 'http:' || url.protocol === 'https:'
    : url.protocol === 'https:';
  if (!allowedScheme) {
    throw new Error(`Blocked insecure update URL scheme: ${url.protocol}`);
  }
  if (!allowedHosts.has(url.hostname)) {
    throw new Error(`Blocked unexpected update host: ${url.hostname}`);
  }
  return url.toString();
}

function normalizeAssetDigest(asset) {
  if (!asset || typeof asset.digest !== 'string') return null;
  const match = asset.digest.trim().match(/^sha256:([a-fA-F0-9]{64})$/);
  return match ? match[1].toLowerCase() : null;
}

function selectAsset(assets, { version, arch, ext }) {
  if (!Array.isArray(assets)) return null;
  const archNames = arch === 'x64' ? ['x64'] : ['arm64'];
  const exactStable = `Onboarder-${version}-${archNames[0]}.${ext}`;
  const exactDev = `Onboarder-${version}-DEVELOPMENT-${archNames[0]}.${ext}`;
  const valid = assets.filter(asset =>
    asset
    && typeof asset.name === 'string'
    && typeof asset.browser_download_url === 'string'
    && asset.name.endsWith('.' + ext),
  );
  const direct = valid.find(a => a.name === exactStable);
  if (direct) return { asset: direct, isDevelopment: false };
  const devExact = valid.find(a => a.name === exactDev);
  if (devExact) return { asset: devExact, isDevelopment: true };
  const byArch = valid.find(a => new RegExp(`(?:^|[-_])${archNames[0]}\\.${ext}$`, 'i').test(a.name));
  if (byArch) return { asset: byArch, isDevelopment: /-DEVELOPMENT-/i.test(byArch.name) };
  return null;
}

export function selectMacosRelease(releases, { currentVersion, arch = process.arch } = {}) {
  if (!Array.isArray(releases)) return null;
  const candidates = [];
  for (const release of releases) {
    if (!release || release.draft) continue;
    const tag = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
    const match = tag.match(/^macos-v(.+)$/i);
    if (!match) continue;
    const version = normalizeMacosVersion(match[1]);
    if (!version) continue;
    const zipChoice = selectAsset(release.assets, { version, arch, ext: 'zip' });
    const dmgChoice = selectAsset(release.assets, { version, arch, ext: 'dmg' });
    if (!zipChoice && !dmgChoice) continue;
    candidates.push({ release, tag, version, zipChoice, dmgChoice });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const cmp = compareVersions(b.version, a.version);
    if (cmp !== 0) return cmp;
    if (Boolean(a.release.prerelease) !== Boolean(b.release.prerelease)) {
      return a.release.prerelease ? 1 : -1;
    }
    return 0;
  });

  const best = candidates[0];
  const sumsAsset = Array.isArray(best.release.assets)
    ? best.release.assets.find(a => a && a.name === 'SHA256SUMS' && typeof a.browser_download_url === 'string') || null
    : null;
  const statusAsset = Array.isArray(best.release.assets)
    ? best.release.assets.find(a => a && a.name === 'BUILD-STATUS.json' && typeof a.browser_download_url === 'string') || null
    : null;
  const preferred = best.zipChoice || best.dmgChoice;
  const releaseUrl = typeof best.release.html_url === 'string' && best.release.html_url.startsWith('https://github.com/')
    ? best.release.html_url
    : `${GITHUB_RELEASES_PAGE}/tag/${encodeURIComponent(best.tag)}`;

  return {
    tag: best.tag,
    version: best.version,
    prerelease: Boolean(best.release.prerelease),
    publishedAt: typeof best.release.published_at === 'string' ? best.release.published_at : null,
    releaseUrl,
    releaseNotes: typeof best.release.body === 'string' ? best.release.body.slice(0, 16384) : null,
    updateAvailable: currentVersion ? isUpdateAvailable(currentVersion, best.version) : false,
    zipAsset: best.zipChoice ? {
      name: best.zipChoice.asset.name,
      url: best.zipChoice.asset.browser_download_url,
      size: Number.isFinite(best.zipChoice.asset.size) ? best.zipChoice.asset.size : null,
      digest: normalizeAssetDigest(best.zipChoice.asset),
      isDevelopment: best.zipChoice.isDevelopment,
    } : null,
    dmgAsset: best.dmgChoice ? {
      name: best.dmgChoice.asset.name,
      url: best.dmgChoice.asset.browser_download_url,
      size: Number.isFinite(best.dmgChoice.asset.size) ? best.dmgChoice.asset.size : null,
      digest: normalizeAssetDigest(best.dmgChoice.asset),
      isDevelopment: best.dmgChoice.isDevelopment,
    } : null,
    primaryAssetName: preferred ? preferred.asset.name : null,
    primaryAssetSize: preferred && Number.isFinite(preferred.asset.size) ? preferred.asset.size : null,
    isDevelopment: Boolean(best.release.prerelease || preferred?.isDevelopment),
    sumsUrl: sumsAsset ? sumsAsset.browser_download_url : null,
    buildStatusUrl: statusAsset ? statusAsset.browser_download_url : null,
  };
}

export function resolveBundleLocation(execPath) {
  if (typeof execPath !== 'string' || !execPath) return null;
  const resolved = path.resolve(execPath);
  const suffix = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const idx = resolved.lastIndexOf(suffix);
  if (idx === -1) return null;
  const bundle = resolved.slice(0, idx);
  return bundle.endsWith('.app') ? bundle : null;
}

export async function assessMacosInstall({
  platform = process.platform,
  isPackaged = false,
  execPath = process.execPath,
  accessCheck = (target, mode) => fs.access(target, mode),
} = {}) {
  const bundlePath = resolveBundleLocation(execPath);
  if (platform !== 'darwin') {
    return {
      canAutoUpdate: false,
      installPath: bundlePath || execPath,
      reason: 'In-app macOS bundle updates are available only on macOS.',
      translocated: false,
    };
  }
  if (!isPackaged || !bundlePath) {
    return {
      canAutoUpdate: false,
      installPath: bundlePath || path.dirname(execPath),
      reason: 'Running unpackaged from source. Download the verified .dmg installer or pull the latest source.',
      translocated: false,
    };
  }
  if (bundlePath.includes('/AppTranslocation/')) {
    return {
      canAutoUpdate: false,
      installPath: bundlePath,
      reason: 'App Translocation prevents in-place updates. Move Onboarder.app to /Applications or install the .dmg update.',
      translocated: true,
    };
  }
  try {
    await accessCheck(bundlePath, fs.constants.W_OK);
    await accessCheck(path.dirname(bundlePath), fs.constants.W_OK);
  } catch {
    return {
      canAutoUpdate: false,
      installPath: bundlePath,
      reason: `Cannot write to ${path.dirname(bundlePath)}. Download the verified .dmg installer to update.`,
      translocated: false,
    };
  }
  return {
    canAutoUpdate: true,
    installPath: bundlePath,
    reason: undefined,
    translocated: false,
  };
}

async function fetchWithValidatedRedirects(
  fetchImpl,
  initialUrl,
  { headers = {}, timeoutMs = 15000, allowedHosts, allowHttpForTests = false, maxBytes, signal },
) {
  let currentUrl = validateRemoteUrl(initialUrl, allowedHosts, allowHttpForTests);
  for (let hop = 0; hop <= 5; hop++) {
    const combinedSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const response = await fetchImpl(currentUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: combinedSignal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      try { await response.body?.cancel(); } catch {}
      const location = response.headers.get('location');
      if (!location) throw new Error('Update server returned a redirect without a location.');
      currentUrl = validateRemoteUrl(new URL(location, currentUrl).toString(), allowedHosts, allowHttpForTests);
      continue;
    }
    if (!response.ok) {
      try { await response.body?.cancel(); } catch {}
      throw new Error(`Update server responded with HTTP ${response.status}.`);
    }
    if (maxBytes !== undefined) {
      const cl = Number(response.headers.get('content-length'));
      if (Number.isFinite(cl) && cl > maxBytes) {
        try { await response.body?.cancel(); } catch {}
        throw new Error('Update download exceeded the maximum allowed size.');
      }
    }
    return response;
  }
  throw new Error('Too many redirects while fetching update.');
}

async function readBoundedText(response, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) {
      try { await response.body?.cancel(); } catch {}
      throw new Error('Update metadata exceeded size limit.');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function defaultInspectAppBundle(appPath, targetVersion) {
  const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
  await fs.stat(infoPlist);
  const { stdout } = await execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPlist]);
  const info = JSON.parse(stdout);
  if (info.CFBundleIdentifier !== BUNDLE_IDENTIFIER) {
    throw new Error(`Unexpected bundle identifier in update: ${String(info.CFBundleIdentifier || 'missing')}.`);
  }
  const bundleVersion = String(info.CFBundleShortVersionString || '').trim();
  if (bundleVersion && parseSemver(bundleVersion) && targetVersion && compareVersions(bundleVersion, targetVersion) !== 0) {
    throw new Error(`Downloaded app version (${bundleVersion}) does not match release ${targetVersion}.`);
  }
  await checkSymlinksContained(appPath);
  await execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
}

async function checkSymlinksContained(rootDir) {
  const canonicalRoot = await fs.realpath(rootDir);
  const stack = [canonicalRoot];
  while (stack.length) {
    const dir = stack.pop();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await fs.readlink(full);
        const resolved = path.resolve(dir, target);
        const norm = resolved.startsWith(canonicalRoot + path.sep) || resolved === canonicalRoot;
        if (!norm) {
          throw new Error(`Update archive contains a symlink outside the app bundle: ${entry.name}`);
        }
      } else if (entry.isDirectory()) {
        stack.push(full);
      }
    }
  }
}

async function defaultReadTeamId(appPath) {
  try {
    const { stderr, stdout } = await execFile('/usr/bin/codesign', ['-dv', '--verbose=2', appPath]);
    const combined = `${stdout || ''}\n${stderr || ''}`;
    const match = combined.match(/^TeamIdentifier=(.+)$/m);
    if (!match) return null;
    const team = match[1].trim();
    return team && team !== 'not set' ? team : null;
  } catch {
    return null;
  }
}

async function defaultExtractZip(zipPath, stageDir) {
  await execFile('/usr/bin/ditto', ['-xk', zipPath, stageDir]);
}

async function uniqueDestinationPath(directory, filename) {
  const safeName = path.basename(filename).replace(/[\0/\\]/g, '_');
  const parsed = path.parse(safeName);
  for (let i = 0; i < 100; i++) {
    const name = i === 0 ? safeName : `${parsed.name} (${i})${parsed.ext}`;
    const candidate = path.join(directory, name);
    try {
      await fs.lstat(candidate);
    } catch {
      return candidate;
    }
  }
  return path.join(directory, `${parsed.name}-${randomUUID().slice(0, 8)}${parsed.ext}`);
}

export class DesktopUpdater {
  constructor({
    store,
    currentVersion,
    coreVersion = '1.5.0',
    arch = process.arch,
    platform = process.platform,
    isPackaged = false,
    execPath = process.execPath,
    userDataDir,
    downloadsDir,
    apiUrl = process.env.ONBOARDER_DESKTOP_UPDATE_API_URL || GITHUB_RELEASES_API,
    allowedHosts = null,
    allowHttpForTests = Boolean(process.env.ONBOARDER_DESKTOP_UPDATE_API_URL),
    fetchImpl = globalThis.fetch,
    extractZip = defaultExtractZip,
    inspectBundle = defaultInspectAppBundle,
    readTeamId = defaultReadTeamId,
    openPath = async () => '',
    showItemInFolder = () => {},
    relaunchApp = () => {},
    quitApp = () => {},
    env = process.env,
    onStatus = () => {},
    onProgress = () => {},
  }) {
    this.store = store;
    this.currentVersion = currentVersion;
    this.coreVersion = coreVersion;
    this.arch = arch;
    this.platform = platform;
    this.isPackaged = isPackaged;
    this.execPath = execPath;
    this.userDataDir = userDataDir;
    this.downloadsDir = downloadsDir || path.join(os.homedir(), 'Downloads');
    this.apiUrl = apiUrl;
    this.allowHttpForTests = allowHttpForTests;
    const apiHost = new URL(apiUrl).hostname;
    this.metadataHosts = allowedHosts ? new Set([...ALLOWED_METADATA_HOSTS, ...allowedHosts, apiHost]) : new Set([...ALLOWED_METADATA_HOSTS, apiHost]);
    this.assetHosts = allowedHosts ? new Set([...ALLOWED_ASSET_HOSTS, ...allowedHosts, apiHost]) : new Set([...ALLOWED_ASSET_HOSTS, apiHost]);
    this.fetchImpl = fetchImpl;
    this.extractZip = extractZip;
    this.inspectBundle = inspectBundle;
    this.readTeamId = readTeamId;
    this.openPath = openPath;
    this.showItemInFolder = showItemInFolder;
    this.relaunchApp = relaunchApp;
    this.quitApp = quitApp;
    this.env = env;
    this.onStatus = onStatus;
    this.onProgress = onProgress;

    this.checkingPromise = null;
    this.installingPromise = null;
    this.pendingRestart = false;
    this.pendingVersion = null;
    this.downloadedInstallerPath = null;
    this.lastRelease = null;
    this.lastError = null;
    this.progress = null;
  }

  async _readRecord() {
    try {
      const data = await this.store.read('updates');
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  async _updateRecord(transform) {
    return this.store.update('updates', current => transform(current && typeof current === 'object' ? current : {}));
  }

  async _assess() {
    return assessMacosInstall({
      platform: this.platform,
      isPackaged: this.isPackaged,
      execPath: this.execPath,
    });
  }

  async _buildStatus(fromCache = false) {
    const record = await this._readRecord();
    const assessment = await this._assess();
    const optedOutByEnv = isUpdateEnvOptedOut(this.env);
    const autoCheckEnabled = record.autoCheck !== false && !optedOutByEnv;
    const release = this.lastRelease || record.cachedRelease || null;
    const latestVersion = release?.version || null;
    const updateAvailable = Boolean(latestVersion && isUpdateAvailable(this.currentVersion, latestVersion));
    const canInstallInPlace = Boolean(
      updateAvailable
      && assessment.canAutoUpdate
      && release?.zipAsset
      && (release.sumsUrl || release.zipAsset.digest),
    );
    const hasDownloadableAsset = Boolean(updateAvailable && (release?.dmgAsset || release?.zipAsset));
    const preferredAsset = canInstallInPlace ? release?.zipAsset : (release?.dmgAsset || release?.zipAsset || null);

    let state = 'up-to-date';
    if (this.pendingRestart) {
      state = 'restart-required';
    } else if (this.installingPromise && this.progress) {
      if (this.progress.phase === 'downloading') state = 'downloading';
      else if (this.progress.phase === 'verifying') state = 'verifying';
      else state = 'installing';
    } else if (this.lastError && !updateAvailable) {
      state = 'error';
    } else if (updateAvailable) {
      state = (canInstallInPlace || hasDownloadableAsset) ? 'available' : 'unsupported';
    }

    return {
      platform: 'macos-app',
      currentVersion: this.currentVersion,
      coreVersion: this.coreVersion,
      arch: this.arch,
      channel: release?.isDevelopment ? 'preview' : 'release',
      latestVersion,
      updateAvailable,
      updateReadyToRestart: this.pendingRestart,
      pendingVersion: this.pendingVersion,
      state,
      canAutoUpdate: canInstallInPlace,
      canDownloadInstaller: hasDownloadableAsset,
      installPath: assessment.installPath,
      installReason: assessment.reason,
      autoCheckEnabled: record.autoCheck !== false,
      checkDisabled: !autoCheckEnabled,
      optedOutByEnv,
      checkedAt: record.checkedAt || null,
      fromCache,
      assetName: preferredAsset?.name || release?.primaryAssetName || null,
      assetSize: preferredAsset?.size ?? release?.primaryAssetSize ?? null,
      assetSha256: preferredAsset?.digest || null,
      signedForDistribution: release ? !release.isDevelopment : false,
      releaseUrl: release?.releaseUrl || GITHUB_RELEASES_PAGE,
      releaseNotes: release?.releaseNotes || null,
      publishedAt: release?.publishedAt || null,
      dismissedVersion: typeof record.dismissedVersion === 'string' ? record.dismissedVersion : null,
      downloadedInstallerPath: this.downloadedInstallerPath,
      error: this.lastError || (typeof record.lastError === 'string' ? record.lastError : undefined),
    };
  }

  _emitProgress(progress) {
    this.progress = progress;
    this.onProgress(progress);
  }

  async _emitStatus(fromCache = false) {
    const status = await this._buildStatus(fromCache);
    this.onStatus(status);
    return status;
  }

  async getStatus() {
    return this._buildStatus(true);
  }

  async startupCheck() {
    const record = await this._readRecord();
    if (record.autoCheck === false || isUpdateEnvOptedOut(this.env)) {
      return this._buildStatus(true);
    }
    const lastChecked = record.checkedAt ? Date.parse(record.checkedAt) : 0;
    if (lastChecked && (Date.now() - lastChecked) < CACHE_TTL_MS && record.cachedRelease) {
      this.lastRelease = record.cachedRelease;
      return this._emitStatus(true);
    }
    return this.checkForUpdates({ force: false, background: true });
  }

  async checkForUpdates({ force = false, background = false } = {}) {
    if (this.checkingPromise) return this.checkingPromise;
    const record = await this._readRecord();
    if (!force && (record.autoCheck === false || isUpdateEnvOptedOut(this.env))) {
      return this._buildStatus(true);
    }
    if (!force && record.checkedAt && (Date.now() - Date.parse(record.checkedAt)) < CACHE_TTL_MS && record.cachedRelease) {
      this.lastRelease = record.cachedRelease;
      return this._buildStatus(true);
    }

    this.checkingPromise = (async () => {
      try {
        const response = await fetchWithValidatedRedirects(this.fetchImpl, this.apiUrl, {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': `onboarder-macos/${this.currentVersion}`,
          },
          timeoutMs: 12000,
          allowedHosts: this.metadataHosts,
          allowHttpForTests: this.allowHttpForTests,
          maxBytes: METADATA_MAX_BYTES,
        });
        const jsonText = await readBoundedText(response, METADATA_MAX_BYTES);
        const releases = JSON.parse(jsonText);
        const selected = selectMacosRelease(releases, { currentVersion: this.currentVersion, arch: this.arch });
        this.lastRelease = selected;
        this.lastError = null;
        await this._updateRecord(prev => ({
          ...prev,
          checkedAt: new Date().toISOString(),
          cachedRelease: selected,
          lastError: null,
        }));
        return this._emitStatus(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = message;
        if (!background) {
          await this._updateRecord(prev => ({ ...prev, lastError: message })).catch(() => {});
        }
        return this._emitStatus(Boolean(record.cachedRelease));
      } finally {
        this.checkingPromise = null;
      }
    })();

    return this.checkingPromise;
  }

  async setAutoCheck(autoCheck) {
    if (typeof autoCheck !== 'boolean') throw new Error('autoCheck must be a boolean.');
    await this._updateRecord(prev => ({ ...prev, autoCheck }));
    return this._emitStatus(true);
  }

  async dismissVersion(version) {
    if (typeof version !== 'string' || !version.trim()) throw new Error('Version is required.');
    await this._updateRecord(prev => ({ ...prev, dismissedVersion: version.trim() }));
    return this._emitStatus(true);
  }

  async _expectedSha256(release, asset) {
    if (asset.digest) return asset.digest;
    if (!release.sumsUrl) return null;
    const response = await fetchWithValidatedRedirects(this.fetchImpl, release.sumsUrl, {
      headers: { 'user-agent': `onboarder-macos/${this.currentVersion}` },
      timeoutMs: 15000,
      allowedHosts: this.assetHosts,
      allowHttpForTests: this.allowHttpForTests,
      maxBytes: CHECKSUM_MAX_BYTES,
    });
    const text = await readBoundedText(response, CHECKSUM_MAX_BYTES);
    const map = parseSha256Sums(text);
    const expected = map.get(asset.name);
    if (!expected) {
      throw new Error(`SHA256SUMS does not list ${asset.name}. Refusing unverified download.`);
    }
    return expected;
  }

  async _downloadAndVerify(asset, expectedSha256, destPath) {
    this._emitProgress({
      phase: 'downloading',
      percent: 0,
      message: `Downloading ${asset.name}…`,
      receivedBytes: 0,
      totalBytes: asset.size || undefined,
    });
    const response = await fetchWithValidatedRedirects(this.fetchImpl, asset.url, {
      headers: { 'user-agent': `onboarder-macos/${this.currentVersion}` },
      timeoutMs: 180000,
      allowedHosts: this.assetHosts,
      allowHttpForTests: this.allowHttpForTests,
      maxBytes: DOWNLOAD_MAX_BYTES,
    });
    if (!response.body) {
      throw new Error(`Update download for ${asset.name} returned an empty response.`);
    }
    const headerLength = Number(response.headers.get('content-length'));
    const totalBytes = Number.isFinite(headerLength) && headerLength > 0 ? headerLength : (asset.size || 0);
    const hash = createHash('sha256');
    let receivedBytes = 0;
    let lastEmit = 0;

    await fs.mkdir(path.dirname(destPath), { recursive: true, mode: 0o700 });
    const fileStream = createWriteStream(destPath, { mode: 0o600, flags: 'wx' });
    try {
      for await (const chunk of response.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buf.length;
        if (receivedBytes > DOWNLOAD_MAX_BYTES) {
          throw new Error('Update download exceeded the maximum allowed size.');
        }
        hash.update(buf);
        if (!fileStream.write(buf)) {
          await new Promise((resolve, reject) => {
            fileStream.once('drain', resolve);
            fileStream.once('error', reject);
          });
        }
        const now = Date.now();
        if (now - lastEmit >= 120) {
          lastEmit = now;
          const percent = totalBytes > 0 ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : null;
          this._emitProgress({
            phase: 'downloading',
            percent,
            message: `Downloading ${asset.name}…`,
            receivedBytes,
            totalBytes: totalBytes || undefined,
          });
        }
      }
      await new Promise((resolve, reject) => {
        fileStream.once('error', reject);
        fileStream.end(resolve);
      });
    } catch (err) {
      fileStream.destroy();
      await fs.rm(destPath, { force: true }).catch(() => {});
      throw err;
    }

    this._emitProgress({
      phase: 'verifying',
      percent: 100,
      message: `Verifying SHA-256 checksum for ${asset.name}…`,
      receivedBytes,
      totalBytes: totalBytes || receivedBytes,
    });
    const actualSha256 = hash.digest('hex');
    if (expectedSha256 && actualSha256 !== expectedSha256) {
      await fs.rm(destPath, { force: true }).catch(() => {});
      throw new Error(`SHA-256 checksum mismatch for ${asset.name}. Downloaded file removed.`);
    }
    return actualSha256;
  }

  async _findAppBundle(dir) {
    const direct = path.join(dir, 'Onboarder.app');
    try {
      const st = await fs.stat(direct);
      if (st.isDirectory()) return direct;
    } catch {}
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith('.app')) {
        return path.join(dir, entry.name);
      }
    }
    return null;
  }

  async _replaceAppAtomically(stagedApp, targetApp) {
    const parent = path.dirname(targetApp);
    const backupPath = path.join(parent, `.${path.basename(targetApp)}.backup-${process.pid}-${randomUUID().slice(0, 8)}`);
    let backedUp = false;
    try {
      await fs.rename(targetApp, backupPath);
      backedUp = true;
      await fs.rename(stagedApp, targetApp);
    } catch (err) {
      if (backedUp) {
        try {
          await fs.rename(backupPath, targetApp);
        } catch {}
      }
      throw new Error(`Could not replace ${path.basename(targetApp)}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await fs.rm(backupPath, { recursive: true, force: true }).catch(() => {});
  }

  async installUpdate({ mode = 'auto' } = {}) {
    if (this.pendingRestart) {
      return this._emitStatus(false);
    }
    if (this.installingPromise) return this.installingPromise;

    this.installingPromise = (async () => {
      const runId = randomUUID();
      const stageDir = path.join(this.userDataDir || os.tmpdir(), 'updates', 'staging-' + runId);
      try {
        this.lastError = null;
        await this.checkForUpdates({ force: true });
        const release = this.lastRelease;
        if (!release || !release.updateAvailable) {
          throw new Error(`Onboarder ${this.currentVersion} is already up to date.`);
        }
        const assessment = await this._assess();
        const useInPlace = mode !== 'dmg'
          && assessment.canAutoUpdate
          && Boolean(release.zipAsset)
          && Boolean(release.sumsUrl || release.zipAsset?.digest);

        if (useInPlace && release.zipAsset) {
          const expectedSha = await this._expectedSha256(release, release.zipAsset);
          if (!expectedSha) {
            throw new Error('Release is missing a SHA-256 checksum for automatic replacement.');
          }
          await fs.mkdir(stageDir, { recursive: true, mode: 0o700 });
          const zipPath = path.join(stageDir, path.basename(release.zipAsset.name));
          await this._downloadAndVerify(release.zipAsset, expectedSha, zipPath);

          this._emitProgress({
            phase: 'extracting',
            percent: null,
            message: `Extracting ${release.zipAsset.name}…`,
          });
          const extractDir = path.join(stageDir, 'extracted');
          await fs.mkdir(extractDir, { recursive: true, mode: 0o700 });
          await this.extractZip(zipPath, extractDir);

          const stagedApp = await this._findAppBundle(extractDir);
          if (!stagedApp) {
            throw new Error('Update archive does not contain Onboarder.app.');
          }

          this._emitProgress({
            phase: 'verifying',
            percent: null,
            message: 'Verifying app bundle and code signature…',
          });
          await this.inspectBundle(stagedApp, release.version);

          const currentTeam = await this.readTeamId(assessment.installPath);
          if (currentTeam) {
            const nextTeam = await this.readTeamId(stagedApp);
            if (nextTeam !== currentTeam) {
              throw new Error(`Updated app signing TeamIdentifier mismatch (expected ${currentTeam}, got ${nextTeam || 'none'}).`);
            }
          }

          this._emitProgress({
            phase: 'replacing',
            percent: null,
            message: `Installing Onboarder v${release.version}…`,
          });
          await this._replaceAppAtomically(stagedApp, assessment.installPath);

          this.pendingRestart = true;
          this.pendingVersion = release.version;
          this.downloadedInstallerPath = null;
          this._emitProgress({
            phase: 'complete',
            percent: 100,
            message: `Updated to Onboarder v${release.version}. Restart to finish applying the update.`,
          });
          return this._emitStatus(false);
        }

        const installerAsset = release.dmgAsset || release.zipAsset;
        if (!installerAsset) {
          throw new Error('No downloadable macOS installer asset found for this architecture.');
        }
        const expectedSha = await this._expectedSha256(release, installerAsset).catch(err => {
          if (release.sumsUrl || installerAsset.digest) throw err;
          return null;
        });
        if (!expectedSha) {
          throw new Error('Refusing installer download without a verified SHA-256 checksum.');
        }
        await fs.mkdir(this.downloadsDir, { recursive: true });
        const destPath = await uniqueDestinationPath(this.downloadsDir, installerAsset.name);
        await this._downloadAndVerify(installerAsset, expectedSha, destPath);
        this.downloadedInstallerPath = destPath;
        this._emitProgress({
          phase: 'complete',
          percent: 100,
          message: `Downloaded verified ${path.basename(destPath)} to Downloads.`,
        });
        if (destPath.endsWith('.dmg')) {
          const openErr = await this.openPath(destPath).catch(e => String(e));
          if (openErr) this.showItemInFolder(destPath);
        } else {
          this.showItemInFolder(destPath);
        }
        return this._emitStatus(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = message;
        this._emitProgress({ phase: 'error', percent: null, message });
        return this._emitStatus(false);
      } finally {
        this.installingPromise = null;
        await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {});
      }
    })();

    return this.installingPromise;
  }

  restartApp() {
    if (!this.pendingRestart) {
      throw new Error('No installed update is awaiting restart.');
    }
    this.relaunchApp();
    this.quitApp();
  }
}
