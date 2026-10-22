import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readAgentFile, writeAgentFile, deleteAgentFile, safeRelative, hashText } from './files.js';
function requireWorkspace(manifest) {
    if (!manifest.permissions.files || !manifest.branch || manifest.root === manifest.sourceRoot)
        throw new Error('Checkpoints require an isolated implementation workspace.');
}
function folder(manifest) { return path.join(path.dirname(manifest.auditFile), 'checkpoints'); }
export async function createCheckpoint(manifest, files) {
    requireWorkspace(manifest);
    if (!Array.isArray(files) || !files.length || files.length > 30 || new Set(files).size !== files.length)
        throw new Error('Choose one to thirty unique source files.');
    const entries = [];
    let bytes = 0;
    for (const file of files) {
        safeRelative(file);
        try {
            const source = await readAgentFile(manifest.root, file);
            bytes += Buffer.byteLength(source.content);
            if (bytes > 2 * 1024 * 1024)
                throw new Error('Checkpoint exceeds 2 MB.');
            entries.push({ file, content: source.content, sha256: source.sha256 });
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
            entries.push({ file, content: null, sha256: null });
        }
    }
    const checkpoint = { version: 1, id: randomUUID(), root: await fs.realpath(manifest.root), createdAt: new Date().toISOString(), files: entries };
    await fs.mkdir(folder(manifest), { recursive: true, mode: 0o700 });
    if ((await fs.readdir(folder(manifest))).length >= 100)
        throw new Error('Checkpoint limit reached for this run.');
    if ((await fs.lstat(folder(manifest))).isSymbolicLink())
        throw new Error('Checkpoint storage cannot be a symbolic link.');
    await fs.writeFile(path.join(folder(manifest), checkpoint.id + '.json'), JSON.stringify(checkpoint), { flag: 'wx', mode: 0o600 });
    return { id: checkpoint.id, digest: hashText(JSON.stringify(checkpoint)), createdAt: checkpoint.createdAt, files: entries.map(({ content: _content, ...f }) => f) };
}
export async function restoreCheckpoint(manifest, id, expectedHashes, expectedDigest) {
    requireWorkspace(manifest);
    if (!/^[a-f0-9-]{36}$/.test(id))
        throw new Error('Invalid checkpoint ID.');
    const file = path.join(folder(manifest), id + '.json');
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 3 * 1024 * 1024)
        throw new Error('Invalid checkpoint file.');
    const source = await fs.readFile(file, 'utf8');
    if (expectedDigest && hashText(source) !== expectedDigest)
        throw new Error('Checkpoint content changed after creation. Nothing was restored.');
    const checkpoint = JSON.parse(source);
    if (checkpoint.version !== 1 || checkpoint.root !== await fs.realpath(manifest.root) || !Array.isArray(checkpoint.files) || checkpoint.files.length > 30)
        throw new Error('Checkpoint belongs to a different workspace.');
    if (!expectedHashes || typeof expectedHashes !== 'object' || Array.isArray(expectedHashes))
        throw new Error('Supply fresh expected hashes for every file.');
    for (const entry of checkpoint.files) {
        safeRelative(entry.file);
        if (entry.content !== null && (typeof entry.content !== 'string' || Buffer.byteLength(entry.content) > 128 * 1024))
            throw new Error('Invalid checkpoint content.');
        const expected = expectedHashes[entry.file];
        if (typeof expected !== 'string')
            throw new Error('Read every current file and supply its hash, or new when absent.');
        try {
            const current = await readAgentFile(manifest.root, entry.file);
            if (current.sha256 !== expected)
                throw new Error('A file changed after its last read. Nothing was restored.');
        }
        catch (error) {
            if (error.code !== 'ENOENT' || expected !== 'new')
                throw error;
        }
    }
    const restored = [];
    try {
        for (const entry of checkpoint.files) {
            const expected = String(expectedHashes[entry.file]);
            if (entry.content === null) {
                if (expected !== 'new')
                    await deleteAgentFile(manifest.root, entry.file, expected);
            }
            else
                await writeAgentFile(manifest.root, entry.file, entry.content, expected);
            restored.push(entry.file);
        }
    }
    catch (error) {
        throw Object.assign(new Error('Restore stopped; completed files: ' + restored.join(', ') + '. ' + error.message), { restored });
    }
    return { id, restored, note: 'Selected source files restored. Run relevant checks again.' };
}
//# sourceMappingURL=checkpoints.js.map