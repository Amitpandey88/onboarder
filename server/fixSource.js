import { promises as fs, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { gitRead, hash, evidenceText } from './intelligence/workspace.js';
import { readAgentFile, safeRelative, scopedFile } from '../cli/agent/files.js';
import { redact } from '../cli/agent/process.js';
export const privateText = (value) => evidenceText(redact(value));
export function requirePublicSource(value) {
    if (privateText(value) !== value)
        throw new Error('Credential-like content cannot be saved in a fix proposal or submitted to a model.');
}
export async function fixGit(root, args, signal) { return gitRead(root, args, signal); }
/** Bounded source snapshot. No repository scripts, filters, hooks or programs run. */
export async function captureFixSource(root, selector, signal) {
    const revision = (await fixGit(root, ['rev-parse', '--verify', '--end-of-options', (selector.mode === 'range' ? selector.head : 'HEAD') + '^{commit}'], signal)).trim();
    const tree = await fixGit(root, selector.mode === 'working' ? ['ls-files', '-z', '--cached', '--others', '--exclude-standard'] :
        selector.mode === 'staged' ? ['ls-files', '--stage', '-z'] : ['ls-tree', '-rz', '--full-tree', revision], signal);
    const blobs = new Map();
    const names = [...new Set(tree.split('\0').filter(Boolean).map(entry => {
            if (selector.mode === 'working')
                return entry;
            const m = (selector.mode === 'range' ? /^100(?:644|755) blob ([a-f0-9]+)\t([\s\S]+)$/ : /^100(?:644|755) ([a-f0-9]+) 0\t([\s\S]+)$/).exec(entry);
            const name = entry.slice(entry.indexOf('\t') + 1);
            if (m)
                blobs.set(name, m[1]);
            return name;
        }))].sort();
    if (names.length > 4000)
        throw new Error('Fix snapshot exceeds the 4,000-file limit. Narrow the repository before proposing a fix.');
    const files = new Map(), modes = new Map(), excluded = [], unavailable = [], fingerprints = [];
    let bytes = 0, hashedBytes = 0;
    for (const name of names) {
        signal?.throwIfAborted();
        try {
            safeRelative(name);
            let content;
            if (selector.mode === 'working')
                content = (await readAgentFile(root, name)).content;
            else {
                const blob = blobs.get(name);
                if (!blob)
                    throw new Error('Unsupported tree entry.');
                const size = Number((await fixGit(root, ['cat-file', '-s', blob], signal)).trim());
                if (size > 128 * 1024)
                    throw new Error('Oversized source.');
                content = await fixGit(root, ['cat-file', 'blob', blob], signal);
                if (content.includes('\0'))
                    throw new Error('Binary source.');
            }
            bytes += Buffer.byteLength(content);
            if (bytes > 24 * 1024 * 1024)
                throw new Error('Fix source snapshot exceeds 24 MB.');
            files.set(name, content);
            const executable = selector.mode === 'working' ? Boolean((await fs.lstat(path.join(root, name))).mode & 0o111) : /100755/.test(tree.split('\0').find(e => e.endsWith('\t' + name)) || '');
            modes.set(name, executable);
            fingerprints.push([name, hash(content) + (executable ? ':executable' : ':regular')]);
        }
        catch (e) {
            if (signal?.aborted || e.message.includes('24 MB'))
                throw e;
            if (selector.mode === 'working' && e.code === 'ENOENT') {
                fingerprints.push([name, 'deleted']);
                continue;
            }
            excluded.push(name);
            // Clean assets/large lockfiles need a fingerprint, not editable text or artifact copies.
            try {
                safeRelative(name);
                if (selector.mode !== 'working') {
                    const blob = blobs.get(name);
                    if (!blob)
                        throw new Error('Unsupported tree entry.');
                    fingerprints.push([name, 'blob:' + blob]);
                }
                else {
                    const handle = await fs.open(await scopedFile(root, name), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
                    try {
                        const st = await handle.stat();
                        if (!st.isFile() || st.size > 8 * 1024 * 1024 || hashedBytes + st.size > 64 * 1024 * 1024)
                            throw new Error('Hash-only snapshot limit.');
                        const digest = createHash('sha256'), buffer = Buffer.alloc(65536);
                        let size = 0;
                        for (;;) {
                            signal?.throwIfAborted();
                            const chunk = await handle.read(buffer, 0, buffer.length, null);
                            if (!chunk.bytesRead)
                                break;
                            size += chunk.bytesRead;
                            if (size > 8 * 1024 * 1024)
                                throw new Error('Hash-only source grew.');
                            digest.update(buffer.subarray(0, chunk.bytesRead));
                        }
                        hashedBytes += size;
                        fingerprints.push([name, digest.digest('hex') + (st.mode & 0o111 ? ':executable' : ':regular')]);
                    }
                    finally {
                        await handle.close();
                    }
                }
            }
            catch {
                signal?.throwIfAborted();
                unavailable.push(name);
            }
        }
    }
    const dirty = selector.mode === 'range' ? [] : (await fixGit(root, ['diff', '--no-ext-diff', '--name-only', '-z', ...(selector.mode === 'staged' ? ['--cached'] : []), revision, '--'], signal)).split('\0').filter(Boolean);
    if (selector.mode === 'working')
        dirty.push(...(await fixGit(root, ['ls-files', '-z', '--others', '--exclude-standard'], signal)).split('\0').filter(Boolean));
    const overlay = [];
    let overlayBytes = 0;
    for (const name of [...new Set(dirty)].sort()) {
        safeRelative(name);
        if (excluded.includes(name))
            throw new Error('A changed file cannot be safely captured for an isolated fix: ' + privateText(name));
        const content = files.get(name) ?? null;
        if (content !== null) {
            requirePublicSource(content);
            overlayBytes += Buffer.byteLength(content);
        }
        if (overlayBytes > 2 * 1024 * 1024 || overlay.length >= 100)
            throw new Error('Working/index snapshot exceeds 100 changed files or 2 MB.');
        overlay.push({ path: name, content, executable: modes.get(name) });
    }
    // Include excluded names and index/tree identity, without persisting their source.
    const identity = selector.mode === 'working' ? await fixGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], signal) : tree;
    return { revision, files, excluded, unavailable, overlay, fingerprint: hash(JSON.stringify({ revision, fingerprints, excluded, unavailable, identity })) };
}
export async function canonicalFixRoot(root) {
    const canonical = await fs.realpath(path.resolve(root));
    const top = (await fixGit(canonical, ['rev-parse', '--show-toplevel'])).trim();
    if (await fs.realpath(top) !== canonical)
        throw new Error('Fixes require the Git repository root.');
    return canonical;
}
//# sourceMappingURL=fixSource.js.map