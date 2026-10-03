import { GithubClient } from './github.js';
import { safeRelative, FILE_LIMIT, hashText } from './files.js';

type Entry = { path: string; mode: string; type: string; sha: string; size?: number };
const validSha = (sha: unknown): sha is string => typeof sha === 'string' && /^[a-f\d]{40,64}$/i.test(sha);
/** Resolve immutable Git objects, checking modes before reading any blob. The
 * contents API can dereference symlinks, so it cannot enforce our file scope. */
export class GithubSourceReader {
  private roots = new Map<string, string>();
  private trees = new Map<string, Entry[]>();
  constructor(private client: GithubClient) {}
  async read(file: string, sha: string) {
    safeRelative(file);
    if (!validSha(sha)) throw new Error('Use an exact commit SHA from the PR or GitHub run.');
    const parts = file.split('/');
    if (parts.length > 20) throw new Error('The source path exceeds the directory-depth limit.');
    let tree = this.roots.get(sha);
    if (!tree) {
      const commit = (await this.client.request(`/git/commits/${sha}`)).data as { tree?: { sha?: string } } | null;
      tree = commit?.tree?.sha;
      if (!validSha(tree)) throw new Error('GitHub returned no valid commit tree.');
      if (this.roots.size >= 64) this.roots.clear(); this.roots.set(sha, tree);
    }
    let entry: Entry | undefined;
    for (let i = 0; i < parts.length; i++) {
      let entries = this.trees.get(tree);
      if (!entries) {
        const response = (await this.client.request(`/git/trees/${tree}`)).data as { tree?: Entry[]; truncated?: boolean } | null;
        if (!response || !Array.isArray(response.tree) || response.truncated) throw new Error('GitHub tree coverage is incomplete.');
        entries = response.tree;
        if (this.trees.size >= 32) this.trees.clear(); this.trees.set(tree, entries);
      }
      entry = entries.find(e => e.path === parts[i]);
      if (!entry || !validSha(entry.sha)) throw new Error('Source file is not present at that commit.');
      if (i < parts.length - 1) {
        if (entry.type !== 'tree' || entry.mode !== '040000') throw new Error('Source paths cannot traverse symlinks or submodules.');
        tree = entry.sha;
      }
    }
    if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || !Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > FILE_LIMIT) throw new Error('Source must be a regular text file, not a symlink or submodule, at most 128 KiB.');
    const response = (await this.client.request(`/git/blobs/${entry.sha}`)).data as { encoding?: string; content?: string; size?: number } | null;
    if (!response || response.encoding !== 'base64' || typeof response.content !== 'string' || response.size !== entry.size) throw new Error('GitHub returned an invalid source blob.');
    const buffer = Buffer.from(response.content, 'base64');
    if (buffer.length !== entry.size || buffer.length > FILE_LIMIT || buffer.includes(0)) throw new Error('GitHub file exceeds the text limit or contains binary data.');
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { throw new Error('GitHub file is not UTF-8 source text.'); }
    return { repository: this.client.repository, file, commitSha: sha, blobSha: entry.sha, content, sha256: hashText(content), bytes: buffer.length };
  }
}
