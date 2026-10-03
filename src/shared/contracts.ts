/** Portable contracts shared by the server, terminal app, and browser. */
export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

export interface FileSource {
  kind: string;
  root: string;
  name: string;
  list(directory: string): Promise<FileEntry[]>;
  read(path: string): Promise<string>;
}

/** A structural signal keeps the engine independent of Node and browser imports. */
export interface ScanSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export type ScanProgress =
  | { phase: 'clone'; url: string }
  | { phase: 'walk'; found: number }
  | { phase: 'parse'; done: number; total: number }
  | { phase: 'resolve'; done: number; total: number }
  | { phase: 'complete'; files: number; edges: number };

export interface ScanOptions {
  maxFiles?: number;
  /** UTF-8 bytes, rather than JavaScript string length. */
  maxFileSize?: number;
  readConcurrency?: number;
  signal?: ScanSignal;
  onProgress?: (progress: ScanProgress) => void;
}

export interface ScanLimits {
  maxFiles: number;
  maxFileSize: number;
  readConcurrency: number;
}

export interface ImportInfo {
  spec: string;
  line?: number;
  symbols?: string[];
  kind?: string;
  local?: boolean;
  static?: boolean;
  typeOnly?: boolean;
  reexport?: boolean;
  packageName?: string;
}

export interface ImportEdge {
  from: string;
  to: string;
  kind: string;
  symbols: string[];
}

export interface Service {
  name: string;
  source: string;
  command?: string;
  build?: string;
  image?: string;
  ports?: string[];
  dependsOn?: string[];
}

export interface Manifest {
  entryPoints: string[];
  services: Service[];
  packageName: string;
  scripts: string[];
  workspaces: string[];
  license?: string;
  hasServerScript?: boolean;
  composeFile?: string;
  deps: { npm: Record<string, string>; dev: Record<string, string>; pip: string[]; go: string[]; cargo: string[] };
}

export interface ResolverContext {
  hasDir?: (path: string) => boolean;
  findDirEndingWith?: (suffix: string) => string | null;
  findByName?: (name: string) => string | null;
  modulePath?: string;
  tsPaths?: { baseUrl: string; paths: Record<string, string[]>; sourceRoot?: string; outputRoot?: string } | null;
}

export interface ImportResolution {
  path?: string;
  packageDir?: string;
  external?: string;
  unresolved?: string;
}

export interface AccountSettings {
  name: string;
  email: string;
  provider: string;
  baseUrl: string;
  model: string;
}

export interface Settings {
  version: number;
  mode: 'local' | 'self-hosted';
  host: string;
  port: number;
  domain: string;
  https: boolean;
  accessKey: string;
  autoOpen: boolean;
  account: AccountSettings;
  tunnel: { cloudflare: boolean; tailscale: boolean };
}

export interface SettingsInput {
  version?: unknown;
  mode?: unknown;
  host?: unknown;
  port?: unknown;
  domain?: unknown;
  https?: unknown;
  accessKey?: unknown;
  autoOpen?: unknown;
  account?: Partial<Record<keyof AccountSettings, unknown>>;
  tunnel?: { cloudflare?: unknown; tailscale?: unknown };
}

export interface ServerUrls { local: string; network?: string; domain?: string }

export interface SymbolInfo {
  name: string;
  line?: number;
  kind?: string;
  calls?: string[];
  async?: boolean;
  exported?: boolean;
  pub?: boolean;
  genericArity?: number;
  decorators?: string[];
  annotations?: string[];
  attributes?: string[];
}

export interface FileAnalysis {
  imports: ImportInfo[];
  exports: SymbolInfo[];
  functions: SymbolInfo[];
  classes: SymbolInfo[];
  interfaces?: SymbolInfo[];
  calls?: Array<{ from: string; to: string }>;
  hasMain?: boolean;
  decorators?: string[];
  annotations?: string[];
  attributes?: string[];
  packageName?: string;
  namespace?: string;
}

export interface SecurityFinding {
  rule: string;
  severity: string;
  category: string;
  message: string;
  line: number;
  source?: string;
  tool?: string;
}

export interface ScannedFile extends FileAnalysis {
  path: string;
  dir: string;
  name: string;
  ext: string;
  lang: string;
  size: number;
  loc: number;
  comment: number;
  blank: number;
  lines: number;
  docRatio: number;
  complexity: number;
  findings?: SecurityFinding[];
  cognitive?: number;
  maintainability?: number;
}

export interface ScannedFolder {
  path: string;
  name: string;
  depth: number;
  fileCount: number;
  loc: number;
  comment: number;
  blank: number;
  size: number;
  langs: Record<string, number>;
  hasReadme: boolean;
  docRatio?: number;
}

export interface LanguageAnalyzer {
  id: string;
  label: string;
  short: string;
  extensions: string[];
  analyze(source: string, path: string): FileAnalysis;
  resolveImport(spec: string, from: string, has: (path: string) => boolean, context?: ResolverContext, meta?: ImportInfo): ImportResolution;
}

export type ScanRequestOptions = Pick<ScanOptions, 'maxFiles' | 'maxFileSize' | 'readConcurrency'>;
export type ScanRequest = (
  | { path: string; gitUrl?: never; demo?: never }
  | { gitUrl: string; path?: never; demo?: never }
  | { demo: true; path?: never; gitUrl?: never }
) & { options?: ScanRequestOptions };
