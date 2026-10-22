import { GithubClient, positiveId } from '../../cli/agent/github.js';
import { GithubSourceReader } from '../../cli/agent/gitSource.js';
import { githubReviewConfig, githubReviewDiff } from '../intelligence/githubReview.js';
import { buildReview } from '../../shared/review/review.js';
import { retainReviewEvidence } from '../reviewEvidence.js';
import { evidenceText } from '../intelligence/workspace.js';
import { terminalText } from '../../cli/agent/process.js';
import { createHash } from 'node:crypto';
export const record = (v) => { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('Invalid GitHub response object.'); return v; };
const string = (v, max = 1000) => { if (typeof v !== 'string' || v.length > max)
    throw new Error('Invalid GitHub text.'); return terminalText(evidenceText(v)); };
export const exactSha = (v) => { if (typeof v !== 'string' || !/^[a-f0-9]{40}$/.test(v))
    throw new Error('GitHub did not return an exact revision.'); return v; };
const date = (v) => { const s = string(v, 40); if (!Number.isFinite(Date.parse(s)))
    throw new Error('Invalid GitHub timestamp.'); return new Date(s).toISOString(); };
const optionalCount = (v) => v === undefined || v === null ? null : Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1e9 ? Number(v) : (() => { throw new Error('Invalid GitHub count.'); })();
const array = (v) => { if (!Array.isArray(v) || v.length > 1000)
    throw new Error('Invalid GitHub list.'); return v; };
const path = (v) => { const p = string(v, 4096); if (!p || p.startsWith('/') || p.includes('\\') || p.split('/').some(s => !s || s === '.' || s === '..') || /[\x00-\x1f\x7f]/.test(String(v)))
    throw new Error('Invalid GitHub file path.'); return p; };
function login(v) { const value = string(v, 150); if (!/^[a-zA-Z0-9][a-zA-Z0-9_\[\]-]{0,99}$/.test(value))
    throw new Error('Invalid GitHub account.'); return value; }
/** Enforces a request/byte ceiling across source, review and pagination helpers. */
class ReadOnlyBudget extends GithubClient {
    delegate;
    requests = 0;
    bytes = 0;
    constructor(delegate) {
        super(delegate.repository);
        this.delegate = delegate;
    }
    async request(route, method = 'GET', body) {
        if (method !== 'GET' || body !== undefined)
            throw new Error('Triage permits read-only Git provider requests.');
        if (++this.requests > 40)
            throw new Error('Triage reached its 40-request budget. Narrow the requested analysis.');
        const result = await this.delegate.request(route);
        this.rateLimit = this.delegate.rateLimit;
        const immutable = /^\/git\/(?:commits|trees)\/([a-f0-9]{40})$/.exec(route);
        if (immutable && record(result.data).sha !== immutable[1])
            throw new Error('GitHub immutable object identity mismatch.');
        this.bytes += Buffer.byteLength(JSON.stringify(result.data));
        if (this.bytes > 12 * 1024 * 1024)
            throw new Error('Triage response budget exceeds 12 MB.');
        return result;
    }
}
export class GithubProvider {
    api;
    repository;
    source;
    constructor(client) { this.api = new ReadOnlyBudget(client); this.repository = client.repository; this.source = new GithubSourceReader(this.api); }
    normalizePull(value) {
        const p = record(value), base = record(p.base), head = record(p.head), repo = record(base.repo);
        if (string(repo.full_name, 150).toLowerCase() !== this.repository.toLowerCase() || !['open', 'closed'].includes(p.state) || typeof p.draft !== 'boolean')
            throw new Error('Pull request does not belong to this repository or has invalid state.');
        const number = positiveId(p.number, 'PR');
        return { provider: 'github', repository: this.repository, number, title: string(p.title, 1000), author: p.user ? login(p.user.login) : 'deleted-user',
            url: `https://github.com/${this.repository}/pull/${number}`, state: p.merged === true || p.merged_at ? 'merged' : p.state, draft: p.draft,
            base: exactSha(base.sha), head: exactSha(head.sha), baseBranch: string(base.ref, 300), headBranch: string(head.ref, 300),
            updatedAt: date(p.updated_at), createdAt: date(p.created_at),
            requestedReviewers: [...array(p.requested_reviewers || []).map(r => '@' + login(record(r).login)), ...array(p.requested_teams || []).map(t => '@' + this.repository.split('/')[0] + '/' + string(record(t).slug, 100))],
            additions: optionalCount(p.additions), deletions: optionalCount(p.deletions), changedFiles: optionalCount(p.changed_files), mergeable: typeof p.mergeable === 'boolean' ? p.mergeable : null };
    }
    async metadata() {
        const r = record((await this.api.request('')).data);
        if (string(r.full_name, 150).toLowerCase() !== this.repository.toLowerCase() || typeof r.private !== 'boolean')
            throw new Error('Invalid GitHub repository identity.');
        const permissions = r.permissions === undefined ? null : Object.fromEntries(Object.entries(record(r.permissions)).filter(([k]) => ['admin', 'maintain', 'push', 'triage', 'pull'].includes(k)).map(([k, v]) => { if (typeof v !== 'boolean')
            throw new Error('Invalid repository permission metadata.'); return [k, v]; }));
        return { name: r.full_name, private: r.private, defaultBranch: string(r.default_branch, 300), permissions };
    }
    async pulls(state, page, limit) {
        if (!['open', 'closed', 'all'].includes(state) || !Number.isInteger(page) || page < 1 || page > 100 || !Number.isInteger(limit) || limit < 1 || limit > 30)
            throw new Error('Choose an open/closed/all PR page, 1–100, with 1–30 rows.');
        const result = await this.api.request(`/pulls?state=${state}&sort=updated&direction=desc&per_page=${limit}&page=${page}`);
        const items = array(result.data);
        if (items.length > limit)
            throw new Error('GitHub exceeded the requested PR page.');
        return { items: items.map(p => this.normalizePull(p)), more: result.more, complete: !result.more, limitations: result.more ? ['More PRs are available; filtering and sorting cover only the loaded pages.'] : [] };
    }
    async pull(number) { const p = this.normalizePull((await this.api.request('/pulls/' + positiveId(number, 'PR'))).data); if (p.number !== number)
        throw new Error('GitHub returned another PR.'); return p; }
    async files(number) {
        const result = await this.api.list('/pulls/' + positiveId(number, 'PR') + '/files', 3);
        if (result.items.length > 300)
            throw new Error('GitHub changed-file page exceeded its 300-file ceiling.');
        return { items: result.items.map(v => {
                const f = record(v), additions = optionalCount(f.additions), deletions = optionalCount(f.deletions);
                if (additions === null || deletions === null || !['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'].includes(f.status) || f.patch !== undefined && typeof f.patch !== 'string')
                    throw new Error('Invalid changed-file metadata.');
                if (typeof f.patch === 'string' && Buffer.byteLength(f.patch) > 5 * 1024 * 1024)
                    throw new Error('GitHub file patch exceeds its limit.');
                return { path: path(f.filename), ...(f.previous_filename !== undefined ? { previousPath: path(f.previous_filename) } : {}), status: f.status, additions, deletions, ...(typeof f.patch === 'string' ? { patch: f.patch } : {}) };
            }), more: result.truncated, complete: !result.truncated, limitations: result.truncated ? ['Changed-file pagination stopped at 300 files.'] : [] };
    }
    async document(file, revision) {
        try {
            const result = await this.source.read(file, exactSha(revision));
            const bytes = Buffer.from(result.content);
            if (createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') !== result.blobSha)
                throw new Error('Source blob fingerprint mismatch.');
            return { path: file, revision, text: result.content, hash: result.sha256 };
        }
        catch (e) {
            if (e.message === 'Source file is not present at that commit.')
                return null;
            throw e;
        }
    }
    async checks(head) {
        exactSha(head);
        const checks = [], limitations = [];
        let complete = true;
        for (const kind of ['check-run', 'commit-status']) {
            let seen = 0;
            try {
                for (let page = 1; page <= 2; page++) {
                    const r = await this.api.request(kind === 'check-run' ? `/commits/${head}/check-runs?filter=latest&per_page=100&page=${page}` : `/commits/${head}/status?per_page=100&page=${page}`);
                    const data = record(r.data);
                    if (kind === 'commit-status' && data.sha !== head)
                        throw new Error('Commit status revision does not match.');
                    const rows = array(kind === 'check-run' ? data.check_runs : data.statuses), total = optionalCount(data.total_count);
                    if (rows.length > 100)
                        throw new Error('GitHub CI page exceeded its requested size.');
                    if (total === null)
                        throw new Error('Missing CI pagination count.');
                    seen += rows.length;
                    for (const raw of rows) {
                        const c = record(raw);
                        let state;
                        if (kind === 'check-run') {
                            if (c.head_sha !== head || !['queued', 'in_progress', 'completed', 'waiting', 'pending', 'requested'].includes(c.status))
                                throw new Error('Check run has an invalid revision or state.');
                            state = c.status !== 'completed' ? 'pending' : c.conclusion === 'success' ? 'passed' : ['neutral', 'skipped'].includes(c.conclusion) ? 'neutral' : ['failure', 'cancelled', 'timed_out', 'action_required', 'stale', 'startup_failure'].includes(c.conclusion) ? 'failed' : (() => { throw new Error('Unknown check conclusion.'); })();
                        }
                        else {
                            if (!['error', 'failure', 'pending', 'success'].includes(c.state))
                                throw new Error('Invalid commit status.');
                            state = c.state === 'success' ? 'passed' : c.state === 'pending' ? 'pending' : 'failed';
                        }
                        checks.push({ name: string(kind === 'check-run' ? c.name : c.context, 300), state, source: kind });
                    }
                    if (!r.more && seen >= total)
                        break;
                    if (!r.more || page === 2) {
                        complete = false;
                        limitations.push(kind + ' pagination/count coverage is incomplete.');
                        break;
                    }
                }
            }
            catch (e) {
                complete = false;
                limitations.push(kind + ' unavailable: ' + safeProviderError(e));
            }
        }
        const state = checks.some(c => c.state === 'failed') ? 'failed' : !complete || !checks.length ? 'unknown' : checks.some(c => c.state === 'pending') ? 'pending' : checks.some(c => c.state === 'neutral') ? 'unknown' : 'passed';
        return { revision: head, state, complete, checks, limitations: [...limitations, 'Only observed checks are shown. Branch protection and required-check completeness are not established.'] };
    }
    async reviews(number, head) {
        const result = await this.api.list('/pulls/' + positiveId(number, 'PR') + '/reviews', 2);
        if (result.items.length > 200)
            throw new Error('GitHub review pages exceeded their requested size.');
        const decisions = result.items.map(raw => { const r = record(raw); if (!['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED', 'COMMENTED', 'PENDING'].includes(r.state))
            throw new Error('Invalid review decision.'); return { user: r.user ? login(r.user.login) : 'deleted-user', state: r.state, sha: r.commit_id === null ? '' : exactSha(r.commit_id), at: r.submitted_at ? date(r.submitted_at) : '', id: positiveId(r.id, 'Review') }; }).sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
        const latest = new Map();
        for (const d of decisions)
            if (!latest.has(d.user) && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(d.state))
                latest.set(d.user, d);
        const current = [...latest.values()].filter(d => d.sha === head && d.state !== 'DISMISSED');
        return { state: current.some(d => d.state === 'CHANGES_REQUESTED') ? 'changes-requested' : result.truncated ? 'unknown' : current.some(d => d.state === 'APPROVED') ? 'approved' : [...latest.values()].some(d => d.sha !== head) ? 'outdated' : 'waiting',
            complete: !result.truncated, reviewers: current.map(d => '@' + d.user), limitations: result.truncated ? ['Review history exceeds 200 entries.'] : [] };
    }
    async review(pull, files) {
        const { config, configuration } = await githubReviewConfig(this.api, pull.head);
        const diff = githubReviewDiff(files.items.map(f => ({ filename: f.path, previous_filename: f.previousPath, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch })), pull.base, pull.head);
        const report = retainReviewEvidence(buildReview(diff, config, 'github-pr-patch'), diff, config, configuration);
        report.coverage.expectedFiles = pull.changedFiles ?? undefined;
        if (!files.complete || pull.changedFiles === null || pull.changedFiles !== files.items.length) {
            report.coverage.status = 'partial';
            report.coverage.limitations.push('Changed-file count or pagination is unavailable/incomplete.');
            report.checks.push({ id: 'provider-coverage', label: 'GitHub file coverage', status: 'warn', detail: 'Changed-file count or pagination is unavailable/incomplete.' });
        }
        report.coverage.limitations.push('GitHub PR patches use its merge-base comparison; the declared base SHA is the target tip. Repository code/tests were not executed.');
        return report;
    }
    async issue(number) { const r = record((await this.api.request('/issues/' + positiveId(number, 'Issue'))).data); return { number: positiveId(r.number, 'Issue'), title: string(r.title), body: string(r.body || '', 24000), state: string(r.state, 20) }; }
    async comments(number) { const result = await this.api.list('/issues/' + positiveId(number, 'PR') + '/comments', 2); return { items: result.items.map(v => { const r = record(v); return { id: positiveId(r.id, 'Comment'), author: r.user ? login(r.user.login) : 'deleted-user', body: string(r.body || '', 24000), updatedAt: date(r.updated_at) }; }), more: result.truncated, complete: !result.truncated, limitations: result.truncated ? ['Comment pagination reached its limit.'] : [] }; }
    async commit(revision) { const r = record((await this.api.request('/git/commits/' + exactSha(revision))).data); if (r.sha !== revision)
        throw new Error('Commit identity mismatch.'); return { revision, parents: array(r.parents).map(p => exactSha(record(p).sha)) }; }
}
export function safeProviderError(error) { return error instanceof Error && /^(GitHub |Invalid |Missing |Unknown |Commit |Check |Triage |Source |Pull |Reviewed |Review |Cannot load)/.test(error.message) ? terminalText(evidenceText(error.message)).slice(0, 400) : 'GitHub could not complete this signal. Check access, rate limits and network availability.'; }
//# sourceMappingURL=github.js.map