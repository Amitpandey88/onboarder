import { createHash } from 'node:crypto';
import { DEFAULT_REVIEW_CONFIG, parseReviewConfigText } from '../../shared/review/review.js';
import { parseUnifiedDiff } from '../gitDiff.js';
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const size = (value) => Number.isSafeInteger(value) && value >= 0;
const record = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid GitHub review response.');
    return value;
};
/** Stay on the allowlisted base repository. Never follow fork URLs or a mutable ref. */
export async function githubReviewConfig(client, head) {
    try {
        const commit = record((await client.request('/git/commits/' + head)).data);
        if (commit.sha !== head || !sha(commit.tree?.sha))
            throw new Error('Reviewed commit is unavailable.');
        const tree = record((await client.request('/git/trees/' + commit.tree.sha)).data);
        if (tree.sha !== commit.tree.sha || tree.truncated !== false || !Array.isArray(tree.tree) ||
            tree.tree.some((entry) => !entry || typeof entry.path !== 'string'))
            throw new Error('Configuration tree is incomplete.');
        const entries = tree.tree.filter((entry) => entry.path === '.onboarder-review.json');
        const configuration = { source: 'commit', status: 'missing', revision: head };
        if (!entries.length)
            return { config: DEFAULT_REVIEW_CONFIG, configuration };
        const entry = entries[0];
        if (entries.length !== 1 || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || !sha(entry.sha) || !size(entry.size) || entry.size > 65536)
            throw new Error('Review configuration must be a regular JSON blob under 64 KB.');
        const blob = record((await client.request('/git/blobs/' + entry.sha)).data);
        if (blob.sha !== entry.sha || blob.encoding !== 'base64' || blob.size !== entry.size || typeof blob.content !== 'string' || blob.content.length > 100000)
            throw new Error('Invalid configuration blob.');
        const encoded = blob.content.replace(/\n/g, '');
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
            throw new Error('Invalid configuration encoding.');
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.length !== entry.size || bytes.length > 65536 || bytes.toString('base64') !== encoded ||
            createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') !== entry.sha)
            throw new Error('Configuration blob does not match the reviewed tree.');
        const config = parseReviewConfigText(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        return { config, configuration: { ...configuration, status: 'present', blob: entry.sha } };
    }
    catch (error) {
        // A 404 may mean missing permissions or an inaccessible fork object, not an absent file.
        throw new Error('Cannot load .onboarder-review.json at reviewed commit: ' + error.message);
    }
}
function filePath(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) ||
        value.split('/').some(p => !p || p === '.' || p === '..'))
        throw new Error('Invalid pull-request file path.');
    return value;
}
/** Preserve GitHub metadata and make absent or partial patches explicit per file. */
export function githubReviewDiff(items, base, head) {
    const files = [];
    let raw = '';
    const seen = new Set();
    for (const value of items) {
        const f = record(value), name = filePath(f.filename), old = filePath(f.previous_filename ?? name);
        if (seen.has(name))
            throw new Error('Duplicate pull-request file.');
        seen.add(name);
        if (!['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'].includes(f.status))
            throw new Error('Invalid pull-request file status.');
        for (const key of ['additions', 'deletions'])
            if (f[key] !== undefined && !size(f[key]))
                throw new Error('Invalid pull-request line count.');
        const patch = 'diff --git ' + JSON.stringify('a/' + old) + ' ' + JSON.stringify('b/' + name) + '\n' +
            '--- ' + (f.status === 'added' ? '/dev/null' : JSON.stringify('a/' + old)) + '\n+++ ' +
            (f.status === 'removed' ? '/dev/null' : JSON.stringify('b/' + name)) + '\n' + (typeof f.patch === 'string' ? f.patch + '\n' : '');
        raw += patch;
        if (Buffer.byteLength(raw) > 5 * 1024 * 1024)
            throw new Error('Pull-request patch exceeds 5 MB.');
        const parsed = parseUnifiedDiff(patch);
        if (parsed.files.length !== 1 || parsed.files[0].newPath !== name || parsed.files[0].oldPath !== old)
            throw new Error('Invalid pull-request patch boundaries.');
        const file = parsed.files[0];
        file.status = f.status === 'removed' ? 'deleted' : f.status;
        const malformed = file.hunks.some(h => !Number.isSafeInteger(h.oldStart) || !Number.isSafeInteger(h.newStart) ||
            h.newLines > 0 && h.newStart < 1 || h.oldLines > 0 && h.oldStart < 1 ||
            h.lines.filter(l => l.type !== 'add').length !== h.oldLines ||
            h.lines.filter(l => l.type !== 'del').length !== h.newLines) ||
            f.additions !== undefined && file.additions !== f.additions || f.deletions !== undefined && file.deletions !== f.deletions;
        if (typeof f.patch !== 'string')
            file.skipReason = 'GitHub omitted this file patch; content was not inspected.';
        else if (malformed || !file.hunks.length && (f.patch || f.additions || f.deletions))
            file.skipReason = 'GitHub patch is incomplete or invalid; content was not inspected.';
        file.additions = f.additions ?? file.additions;
        file.deletions = f.deletions ?? file.deletions;
        files.push(file);
    }
    return { files, raw, base, head, mode: 'range', stats: { filesChanged: files.length,
            additions: files.reduce((n, f) => n + f.additions, 0), deletions: files.reduce((n, f) => n + f.deletions, 0) } };
}
//# sourceMappingURL=githubReview.js.map