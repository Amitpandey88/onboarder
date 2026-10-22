import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimePaths } from './config.js';
import { runProcess } from './process.js';
import { safeGitArguments } from './gitSafety.js';
/** File isolation only: this does not sandbox execution of repository code. */
export async function createImplementationWorkspace(manifest, home, revision = 'HEAD', signal) {
    if (!manifest.permissions.files || manifest.root !== manifest.sourceRoot)
        throw new Error('A new implementation workspace is required.');
    const dir = path.dirname(manifest.auditFile);
    await fs.mkdir(runtimePaths(home).workspaces, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(runtimePaths(home).workspaces)).isSymbolicLink())
        throw new Error('Worktree storage cannot be a symbolic link.');
    const hooks = path.join(dir, 'empty-hooks');
    await fs.mkdir(hooks, { recursive: true, mode: 0o700 });
    const root = path.join(runtimePaths(home).workspaces, manifest.id), branch = `codex/agent-${manifest.id}`;
    const output = await runProcess('git', [...await safeGitArguments(manifest.sourceRoot, signal), '-c', `core.hooksPath=${hooks}`, '-C', manifest.sourceRoot,
        'worktree', 'add', '-b', branch, root, revision], { timeoutMs: 30_000, maxBytes: 1024 * 1024, signal });
    if (output.code)
        throw new Error('Could not create the isolated Git worktree.');
    manifest.root = await fs.realpath(root);
    manifest.branch = branch;
    return manifest;
}
//# sourceMappingURL=workspace.js.map