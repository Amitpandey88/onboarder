/** Narrow declarations for the vendored browser integrations. */
export interface BrowserFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
export interface BrowserDirectoryHandle {
  kind: 'directory';
  name: string;
  entries(): AsyncIterableIterator<[string, BrowserDirectoryHandle | BrowserFileHandle]>;
}
export interface AmdLoader {
  (modules: string[], ready: () => void, failed?: () => void): void;
  config(options: { paths: Record<string, string> }): void;
}
export interface MonacoModel { getLineCount(): number }
export interface MonacoEditor {
  getModel(): MonacoModel | null;
  setValue(value: string): void;
  setScrollTop(value: number): void;
  setScrollLeft(value: number): void;
  revealLineInCenter(line: number): void;
  setPosition(position: { lineNumber: number; column: number }): void;
}
export interface MonacoApi {
  editor: {
    defineTheme(name: string, theme: unknown): void;
    create(container: HTMLElement, options: unknown): MonacoEditor;
    setTheme(name: string): void;
    setModelLanguage(model: MonacoModel, language: string): void;
  };
  languages: { typescript?: {
    typescriptDefaults: { setDiagnosticsOptions(options: unknown): void };
    javascriptDefaults: { setDiagnosticsOptions(options: unknown): void };
  } };
}
declare global {
interface Window {
  showDirectoryPicker?: (options: { mode: 'read' }) => Promise<BrowserDirectoryHandle>;
  require: AmdLoader;
  monaco: MonacoApi;
  MonacoEnvironment: { getWorkerUrl(workerId: string, label: string): string };
  mermaid: {
    initialize(options: unknown): void;
    render(id: string, source: string): Promise<{ svg: string }>;
  };
}
const monaco: MonacoApi;

}
