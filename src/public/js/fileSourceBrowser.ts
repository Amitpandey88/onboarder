import type { BrowserDirectoryHandle, BrowserFileHandle } from '../browser.js';
import type { FileSource, FileEntry } from '../../shared/contracts.js';

// Browser folder handles stay in this tab and can be reused to preview source.
export function canPickFolder(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<BrowserDirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error('This browser cannot pick folders.');
  return window.showDirectoryPicker({ mode: 'read' });
}

export function browserFileSource(rootHandle: BrowserDirectoryHandle): FileSource {
  const handles = new Map<string, BrowserDirectoryHandle | BrowserFileHandle>([['', rootHandle]]);
  return {
    kind: 'browser',
    root: rootHandle.name,
    name: rootHandle.name,

    async list(directory: string): Promise<FileEntry[]> {
      const handle = handles.get(directory);
      if (!handle || handle.kind !== 'directory') throw new Error('No directory handle for ' + directory);
      const entries: FileEntry[] = [];
      for await (const [name, child] of handle.entries()) {
        const path = directory ? directory + '/' + name : name;
        handles.set(path, child);
        entries.push({ name, path, type: child.kind === 'directory' ? 'dir' : 'file' });
      }
      return entries;
    },

    async read(path: string): Promise<string> {
      const handle = handles.get(path);
      if (!handle || handle.kind !== 'file') throw new Error('No file handle for ' + path);
      const file = await handle.getFile();
      if (file.size > 10 * 1024 * 1024) throw new Error('File too large to read');
      return file.text();
    },
  };
}
