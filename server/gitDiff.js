// Bounded, shell-free Git comparisons. A failed range must never become another diff.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isInside, resolveInside } from './paths.js';
const execFileAsync = promisify(execFile);
const MAX_DIFF_BYTES = 5 * 1024 * 1024;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export class GitDiffError extends Error {
    status;
    constructor(message, status = 422) {
        super(message);
        this.status = status;
        this.name = 'GitDiffError';
    }
}
async function git(root, args, signal) {
    try {
        const { stdout } = await execFileAsync('git', ['--literal-pathspecs', '-c', 'core.quotePath=false', ...args], {
            cwd: root, maxBuffer: MAX_DIFF_BYTES, timeout: 15000, killSignal: 'SIGKILL', signal,
            env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
        });
        return stdout;
    }
    catch (error) {
        if (signal?.aborted)
            throw error;
        const e = error;
        if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
            throw new GitDiffError('This diff exceeds the 5 MB review limit. Choose a smaller range.', 413);
        if (e.killed)
            throw new GitDiffError('Git took too long. Choose a smaller comparison and try again.', 408);
        throw new GitDiffError('Git could not read this comparison. Check the repository and its available history.');
    }
}
async function resolveRef(root, ref, signal) {
    if (!ref || ref.length > 200 || ref.startsWith('-') || !/^[a-zA-Z0-9_./~^@{}-]+$/.test(ref))
        throw new GitDiffError('Use a valid branch, tag, or commit reference.', 400);
    try {
        return (await git(root, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], signal)).trim();
    }
    catch (e) {
        if (signal?.aborted || (e instanceof GitDiffError && e.status !== 422))
            throw e;
        throw new GitDiffError(`Reference "${ref}" is unavailable. Shallow clones may not contain older commits.`);
    }
}
export async function getGitRefs(root) {
    try {
        await git(root, ['rev-parse', '--is-inside-work-tree']);
        const [branches, tags, current, log] = await Promise.all([
            git(root, ['branch', '-a', '--format=%(refname:short)']),
            git(root, ['tag', '--sort=-creatordate']),
            git(root, ['symbolic-ref', '--short', 'HEAD']).catch(() => 'HEAD'),
            git(root, ['log', '-n', '40', '--format=%H%x00%h%x00%s%x00%an%x00%aI']).catch(() => ''),
        ]);
        return { available: true, branches: branches.trim().split('\n').filter(Boolean), tags: tags.trim().split('\n').filter(Boolean), current: current.trim(),
            commits: log.trim().split('\n').filter(Boolean).map(line => { const [hash, short, message, author, date] = line.split('\0'); return { hash, short, message, author, date }; }) };
    }
    catch (err) {
        return { available: false, reason: err instanceof Error ? err.message : 'Git unavailable.' };
    }
}
export async function getGitDiff(root, options = {}) {
    const { base = 'HEAD', head = '', file = '', includeUntracked = false, signal } = options;
    const mode = options.mode || (head ? 'range' : 'working');
    if (!['working', 'staged', 'range'].includes(mode))
        throw new GitDiffError('Choose working, staged, or range review.', 400);
    if (mode === 'range' && !head)
        throw new GitDiffError('A branch comparison needs a head reference.', 400);
    await git(root, ['rev-parse', '--is-inside-work-tree'], signal);
    const repoRoot = (await git(root, ['rev-parse', '--show-toplevel'], signal)).trim();
    if (await realpath(root) !== await realpath(repoRoot))
        throw new GitDiffError('Open the Git repository root to review changes. A subfolder scan cannot read changes outside its scan root.', 400);
    let baseHash;
    try {
        baseHash = await resolveRef(root, base || 'HEAD', signal);
    }
    catch (error) {
        // An unborn repository has no HEAD. Only that explicit default is allowed.
        if ((base || 'HEAD') !== 'HEAD' || mode === 'range' || signal?.aborted)
            throw error;
        const count = (await git(root, ['rev-list', '--all', '--count'], signal)).trim();
        if (count !== '0')
            throw error;
        baseHash = EMPTY_TREE;
    }
    const headHash = mode === 'range' ? await resolveRef(root, head, signal) : '';
    const args = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-U3'];
    if (mode === 'staged')
        args.push('--cached');
    args.push(headHash ? `${baseHash}...${headHash}` : baseHash, '--');
    if (file)
        args.push(file);
    let raw = await git(root, args, signal);
    let untracked = 0;
    if (includeUntracked && mode === 'working' && !file) {
        const names = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'], signal)).split('\0').filter(Boolean);
        if (names.length > 200)
            throw new GitDiffError('More than 200 untracked files. Stage selected files or narrow the repository before reviewing.', 413);
        const canonicalRoot = await realpath(root);
        for (const name of names) {
            signal?.throwIfAborted();
            const abs = resolveInside(root, name);
            if (!abs)
                throw new GitDiffError('An untracked path is outside this repository.');
            const st = await lstat(abs);
            if (st.isSymbolicLink()) {
                raw += `diff --git ${JSON.stringify('a/' + name)} ${JSON.stringify('b/' + name)}\nnew file mode 120000\nonboarder skipped symlink\n`;
                untracked++;
                continue;
            }
            if (!st.isFile())
                continue;
            if (!isInside(canonicalRoot, await realpath(abs)))
                throw new GitDiffError('An untracked path resolves outside this repository.');
            if (st.size > 1024 * 1024)
                throw new GitDiffError(`Untracked file "${name}" exceeds the 1 MB limit. Stage it to review its Git diff.`, 413);
            const buffer = await readFile(abs);
            if (buffer.byteLength > 1024 * 1024)
                throw new GitDiffError('An untracked file grew beyond the review limit.', 413);
            const header = `diff --git ${JSON.stringify('a/' + name)} ${JSON.stringify('b/' + name)}\nnew file mode 100644\n`;
            if (buffer.includes(0))
                raw += header + `Binary files /dev/null and ${name} differ\n`;
            else {
                const source = buffer.toString('utf8');
                const lines = source === '' ? [] : source.replace(/\n$/, '').split('\n');
                raw += header + `--- /dev/null\n+++ ${JSON.stringify('b/' + name)}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map(l => '+' + l + '\n').join('');
            }
            untracked++;
            if (Buffer.byteLength(raw) > MAX_DIFF_BYTES)
                throw new GitDiffError('This diff exceeds the 5 MB review limit.', 413);
        }
    }
    return { ...parseUnifiedDiff(raw), base: baseHash, head: headHash, mode, untracked };
}
function decodeGitPath(value) {
    if (!value.startsWith('"'))
        return value;
    // Git quotes control characters and sometimes octal UTF-8 bytes.
    const bytes = [];
    for (let i = 1; i < value.length - 1; i++) {
        if (value[i] === '\\') {
            const octal = value.slice(i + 1).match(/^[0-7]{1,3}/)?.[0];
            if (octal) {
                bytes.push(parseInt(octal, 8));
                i += octal.length;
                continue;
            }
            const escaped = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', a: '\x07' };
            bytes.push(...Buffer.from(escaped[value[++i]] ?? value[i]));
        }
        else {
            const cp = value.codePointAt(i);
            bytes.push(...Buffer.from(String.fromCodePoint(cp)));
            if (cp > 0xffff)
                i++;
        }
    }
    return Buffer.from(bytes).toString('utf8');
}
export function parseUnifiedDiff(diffText) {
    if (!diffText || typeof diffText !== 'string') {
        return { files: [], stats: { filesChanged: 0, additions: 0, deletions: 0 }, raw: '' };
    }
    const files = [];
    const lines = diffText.split('\n');
    let currentFile = null;
    let currentHunk = null;
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // File header: diff --git a/path b/path
        if (line.startsWith('diff --git ')) {
            const m = line.match(/^diff --git (\"(?:[^\"\\]|\\.)*\"|a\/.*?) (\"(?:[^\"\\]|\\.)*\"|b\/.*)$/);
            const oldPath = m ? decodeGitPath(m[1]).slice(2) : '';
            const newPath = m ? decodeGitPath(m[2]).slice(2) : '';
            currentFile = {
                oldPath,
                newPath,
                status: 'modified',
                additions: 0,
                deletions: 0,
                hunks: [],
            };
            files.push(currentFile);
            currentHunk = null;
            continue;
        }
        if (!currentFile)
            continue;
        // File markers disambiguate unquoted paths containing " b/" in the header.
        if (!currentHunk && (line.startsWith('--- ') || line.startsWith('+++ '))) {
            const value = line.slice(4);
            const markerPath = decodeGitPath(value.startsWith('"') ? value : value.split('\t')[0]);
            if (markerPath !== '/dev/null') {
                if (line.startsWith('--- '))
                    currentFile.oldPath = markerPath.slice(2);
                else
                    currentFile.newPath = markerPath.slice(2);
            }
            continue;
        }
        if (line === 'onboarder skipped symlink') {
            currentFile.skipReason = 'Untracked symlink: target not read';
            continue;
        }
        if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
            currentFile.binary = true;
            continue;
        }
        if (line.startsWith('new file mode ')) {
            currentFile.status = 'added';
            continue;
        }
        if (line.startsWith('deleted file mode ')) {
            currentFile.status = 'deleted';
            continue;
        }
        if (line.startsWith('rename from ')) {
            currentFile.status = 'renamed';
            currentFile.oldPath = decodeGitPath(line.slice(12));
            continue;
        }
        if (line.startsWith('rename to ')) {
            currentFile.newPath = decodeGitPath(line.slice(10));
            continue;
        }
        // Hunk header: @@ -1,5 +1,6 @@ optional context
        if (line.startsWith('@@ ')) {
            const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
            if (match) {
                const oldStart = parseInt(match[1], 10);
                const oldLines = match[2] !== undefined ? parseInt(match[2], 10) : 1;
                const newStart = parseInt(match[3], 10);
                const newLines = match[4] !== undefined ? parseInt(match[4], 10) : 1;
                currentHunk = {
                    header: line,
                    oldStart,
                    oldLines,
                    newStart,
                    newLines,
                    heading: match[5]?.trim() || '',
                    lines: [],
                };
                currentFile.hunks.push(currentHunk);
            }
            continue;
        }
        if (!currentHunk)
            continue;
        if (line.startsWith('+')) {
            currentFile.additions++;
            totalAdditions++;
            currentHunk.lines.push({
                type: 'add',
                text: line.slice(1),
            });
        }
        else if (line.startsWith('-')) {
            currentFile.deletions++;
            totalDeletions++;
            currentHunk.lines.push({
                type: 'del',
                text: line.slice(1),
            });
        }
        else if (line.startsWith(' ')) {
            currentHunk.lines.push({
                type: 'context',
                text: line.slice(1),
            });
        }
    }
    return {
        files,
        stats: {
            filesChanged: files.length,
            additions: totalAdditions,
            deletions: totalDeletions,
        },
        raw: diffText,
    };
}
//# sourceMappingURL=gitDiff.js.map