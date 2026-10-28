/** The browser has no native privileges. Only the packaged preload supplies this API. */
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
  subscribe(listener: (event: { type: string; [key: string]: any }) => void): () => void;
  dropped(files: File[]): Promise<void>;
}
export interface AppearanceState { reducedMotion: boolean; motion: 'system' | 'reduced' }
declare global { interface Window { onboarderDesktop?: DesktopHost } }
export function desktopHost(): DesktopHost | null { return window.onboarderDesktop || null; }
