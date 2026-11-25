/** The browser has no native privileges. Only the packaged preload supplies this API. */
export interface DesktopUpdateStatus {
  platform: 'macos-app';
  currentVersion: string;
  coreVersion: string;
  arch: string;
  channel: 'release' | 'preview';
  latestVersion: string | null;
  updateAvailable: boolean;
  updateReadyToRestart: boolean;
  pendingVersion: string | null;
  state: 'up-to-date' | 'available' | 'downloading' | 'verifying' | 'installing' | 'restart-required' | 'unsupported' | 'error';
  canAutoUpdate: boolean;
  canDownloadInstaller: boolean;
  installPath: string;
  installReason?: string;
  autoCheckEnabled: boolean;
  checkDisabled: boolean;
  optedOutByEnv: boolean;
  checkedAt: string | null;
  fromCache: boolean;
  assetName: string | null;
  assetSize: number | null;
  assetSha256: string | null;
  signedForDistribution: boolean;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  dismissedVersion: string | null;
  downloadedInstallerPath: string | null;
  error?: string;
}

export interface DesktopUpdateProgress {
  phase: 'downloading' | 'verifying' | 'extracting' | 'replacing' | 'complete' | 'error';
  percent: number | null;
  message: string;
  receivedBytes?: number;
  totalBytes?: number;
}

export interface DesktopHost {
  initial(): Promise<{ root: string | null; temporary: boolean; version: string; appearance: AppearanceState; cloneStorage: 'permanent' | 'temporary'; recents: { path: string; name: string; openedAt: number }[] }>;
  home(): Promise<void>;
  preferences(patch?: { motion?: 'system' | 'reduced'; cloneStorage?: 'permanent' | 'temporary' }): Promise<{ appearance: AppearanceState; cloneStorage: 'permanent' | 'temporary' }>;
  openProject(path?: string): Promise<void>;
  openDemo(): Promise<void>;
  cloneProject(url: string, options?: { storage: 'permanent' | 'temporary' }): Promise<void>;
  cancelClone(): Promise<void>;
  clearRecents(): Promise<void>;
  reveal(): Promise<void>;
  credential(action: 'get' | 'set' | 'delete', endpoint: string, secret?: string): Promise<string | null>;
  terminal(action: 'create' | 'write' | 'resize' | 'close', input: { id?: string; kind?: 'chat' | 'shell'; data?: string; cols?: number; rows?: number }): Promise<{ id?: string }>;
  update(action: 'status' | 'check' | 'install' | 'restart' | 'dismiss' | 'set-auto-check' | 'open-release', input?: { force?: boolean; mode?: 'auto' | 'dmg'; version?: string; autoCheck?: boolean }): Promise<DesktopUpdateStatus>;
  subscribe(listener: (event: { type: string; [key: string]: any }) => void): () => void;
  dropped(files: File[]): Promise<void>;
}
export interface AppearanceState { reducedMotion: boolean; motion: 'system' | 'reduced' }
declare global { interface Window { onboarderDesktop?: DesktopHost } }
export function desktopHost(): DesktopHost | null { return typeof window === 'undefined' ? null : (window.onboarderDesktop || null); }
