import type { BrowserDirectoryHandle } from '../browser.js';
import type { FileSource } from '../../shared/contracts.js';
export declare function canPickFolder(): boolean;
export declare function pickDirectory(): Promise<BrowserDirectoryHandle>;
export declare function browserFileSource(rootHandle: BrowserDirectoryHandle): FileSource;
