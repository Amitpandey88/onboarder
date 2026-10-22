import { prioritize, triagePolicy } from '../shared/triage/priority.js';
import { ownersFor, compareSnapshots, parseIntelligenceConfig, emptyIntelligenceConfig } from '../shared/intelligence/analysis.js';
import { evidenceText, gitRead, revisionFileSource, revisionSnapshot } from './intelligence/workspace.js';
import { repositoryFromRemote } from '../cli/agent/github.js';
import { safeProviderError } from './providers/github.js';
export async function localGithubRepository(root, signal) {
    const remote = (await gitRead(root, ['remote', 'get-url', 'origin'], signal)).trim();
    const repository = repositoryFromRemote(remote);
    if (!repository)
        throw new Error('Use a repository with a GitHub origin remote or specify owner/name explicitly.');
    return repository;
}
function emptyArchitecture(pull) {
    return { status: 'unavailable', head: pull.head, addedDependencies: null, removedDependencies: null, newCycles: null,
        boundaryViolations: null, affectedCallers: [], relevantTests: [], breakingExports: [], limitations: ['Revision-pinned local architecture has not been analyzed.'] };
}
export function observedPull(pull, now = Date.now()) {
    return prioritize({ schemaVersion: 1, pull, inspected: false, observedAt: new Date(now).toISOString(), freshness: 'observed',
        priority: 'P3', score: 0, provisional: true, factors: [], missingSignals: [], readiness: 'unknown', queues: [], files: [],
        checks: { revision: pull.head, state: 'unknown', complete: false, checks: [], limitations: ['Select Inspect to retrieve checks for this exact head.'] },
        reviews: { state: 'unknown', complete: false, reviewers: [], limitations: ['Review decisions have not been retrieved.'] },
        owners: { revision: pull.base, path: null, status: 'unavailable', suggestions: [], limitations: ['Ownership has not been retrieved.'] },
        architecture: emptyArchitecture(pull), limitations: ['Queue rows initially contain metadata only. Inspect individual PRs to calculate findings and risk.'],
        policy: { source: 'default', revision: pull.base, value: triagePolicy() } }, now);
}
export async function listTriage(provider, options = {}) {
    options.signal?.throwIfAborted();
    const page = options.page ?? 1, limit = options.limit ?? 10;
    const result = await provider.pulls(options.state || 'open', page, limit);
    options.signal?.throwIfAborted();
    const now = Date.now();
    return { schemaVersion: 1, repository: provider.repository, page, limit, hasNext: result.more, observedAt: new Date(now).toISOString(),
        items: result.items.map(p => observedPull(p, now)), coverage: { scope: 'one-provider-page', returned: result.items.length,
            complete: result.complete, limitations: [...result.limitations, 'Sorting and filters apply to this loaded page. Uninspected rows have provisional metadata-only priorities.'] } };
}
async function ownership(provider, item) {
    const result = { revision: item.pull.base, path: null, status: 'missing', suggestions: [], limitations: [] };
    for (const file of ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']) {
        const doc = await provider.document(file, item.pull.base);
        if (!doc)
            continue;
        result.path = file;
        result.status = 'available';
        if (Buffer.byteLength(doc.text) > 65536)
            throw new Error('Source CODEOWNERS exceeds the 64 KB triage limit.');
        const lines = [];
        for (const line of doc.text.split('\n')) {
            const clean = line.split('#')[0].trim();
            if (!clean)
                continue;
            if (/[!\[\]\\]/.test(clean.split(/\s+/)[0])) {
                result.status = 'partial';
                continue;
            }
            lines.push(clean);
        }
        if (lines.length > 1000 || lines.some(line => line.split(/\s+/)[0].length > 256))
            return { ...result, status: 'partial', limitations: ['Ownership exceeds 1,000 rules or a 256-character pattern. Suggestions withheld; inspect CODEOWNERS directly.'] };
        const people = new Map();
        const patterns = lines.reduce((n, line) => n + line.split(/\s+/)[0].length + 6, 0);
        let work = 0;
        for (const f of item.files) {
            work += patterns * f.path.length * (f.path.split('/').length + 1);
            if (work > 50000000) {
                result.status = 'partial';
                result.limitations.push('Ownership reached its bounded matching budget; remaining changed paths were not evaluated.');
                break;
            }
            for (const owner of ownersFor(f.path, lines.join('\n'))) {
                if (owner.toLowerCase() === '@' + item.pull.author.toLowerCase())
                    continue;
                if (!/^@[\w-]+(?:\/[\w-]+)?$/.test(owner) && !/^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(owner)) {
                    result.status = 'partial';
                    continue;
                }
                if (!people.has(owner) && people.size >= 100) {
                    result.status = 'partial';
                    continue;
                }
                const paths = people.get(owner) || [];
                paths.push(f.path);
                people.set(owner, paths);
            }
        }
        result.suggestions = [...people].slice(0, 100).map(([reviewer, paths]) => ({ reviewer, paths }));
        result.limitations.push('Declared owners at the target revision; membership, write permission and review availability are not established. No reviewers were assigned.');
        if (result.status === 'partial')
            result.limitations.push('Unsupported ownership patterns/handles or suggestions beyond 100 reviewers were omitted.');
        return result;
    }
    result.limitations.push('No CODEOWNERS declaration found at the target revision. Authorship is not used as ownership.');
    return result;
}
async function architecture(root, item, signal) {
    const unavailable = emptyArchitecture(item.pull);
    if (!root)
        return unavailable;
    try {
        if ((await localGithubRepository(root, signal)).toLowerCase() !== item.pull.repository.toLowerCase())
            throw new Error('Local origin does not match this PR repository.');
        const base = (await gitRead(root, ['merge-base', item.pull.base, item.pull.head], signal)).trim();
        if (!/^[a-f0-9]{40}$/.test(base))
            throw new Error('Merge base unavailable.');
        const source = await revisionFileSource(root, item.pull.base, signal);
        let config = emptyIntelligenceConfig();
        try {
            config = parseIntelligenceConfig(JSON.parse(await source.source.read('.onboarder.json')));
        }
        catch (e) {
            if (e.message !== 'File unavailable at this revision.')
                throw e;
        }
        const before = await revisionSnapshot(root, base, config, { signal, maxFiles: 500 });
        const after = await revisionSnapshot(root, item.pull.head, config, { signal, maxFiles: 500 });
        const delta = compareSnapshots(before, after), changed = new Set(item.files.flatMap(f => [f.path, ...(f.previousPath ? [f.previousPath] : [])]));
        const reached = new Set(changed), queue = [...changed], reverse = new Map();
        for (const e of [...before.edges, ...after.edges]) {
            const paths = reverse.get(e.to) || new Set();
            paths.add(e.from);
            reverse.set(e.to, paths);
        }
        for (let i = 0; i < queue.length; i++)
            for (const from of reverse.get(queue[i]) || [])
                if (!reached.has(from)) {
                    reached.add(from);
                    queue.push(from);
                }
        const partial = [before, after].some(s => s.scanCoverage?.truncated || s.scanCoverage?.unavailable || s.scanCoverage?.unsupported || s.metrics.unresolved > 0);
        return { status: partial ? 'partial' : 'available', base, head: item.pull.head,
            addedDependencies: delta.addedConnections.length, removedDependencies: delta.removedConnections.length,
            newCycles: delta.introducedCycles.length, boundaryViolations: delta.newViolations.length,
            affectedCallers: [...reached].filter(p => !changed.has(p)).sort(),
            relevantTests: [...reached].filter(p => /(?:^|\/)(?:__tests__|tests?)\/|[.-](?:spec|test)\./.test(p)).sort(),
            breakingExports: delta.removedExports.filter(f => changed.has(f.path)).map(f => f.path + ':' + f.name),
            limitations: ['Static import reachability and syntax-level export changes are candidates, not proof of runtime impact. No code was executed. Architecture rules are pinned to target base; comparison starts at the local merge base.',
                ...(partial ? ['A 500-file scan ceiling, unreadable/unsupported files or unresolved imports limits architecture coverage.'] : [])] };
    }
    catch {
        signal?.throwIfAborted();
        return { ...unavailable, limitations: ['Exact commits, matching origin, or supported architecture configuration are unavailable locally. Fetch the PR revisions explicitly before retrying; triage never fetches or changes the checkout.'] };
    }
}
export async function inspectTriage(provider, number, options = {}) {
    options.signal?.throwIfAborted();
    const item = observedPull(await provider.pull(number));
    item.inspected = true;
    item.limitations = [];
    const capture = async (name, work) => {
        try {
            options.signal?.throwIfAborted();
            await work();
        }
        catch (e) {
            options.signal?.throwIfAborted();
            item.limitations.push(name + ': ' + safeProviderError(e));
        }
    };
    // Sequential requests share one finite provider budget and avoid bursts against GitHub.
    await capture('Changed files / review', async () => {
        const files = await provider.files(number);
        item.files = files.items.map(({ patch: _patch, ...metadata }) => metadata);
        item.limitations.push(...files.limitations);
        item.report = await provider.review(item.pull, files);
        if (Buffer.byteLength(JSON.stringify(item.report)) > 7 * 1024 * 1024) {
            item.report = undefined;
            throw new Error('Review report exceeds 7 MB. Narrow the analysis.');
        }
    });
    await capture('CI', async () => { item.checks = await provider.checks(item.pull.head); });
    await capture('Review decisions', async () => { item.reviews = await provider.reviews(number, item.pull.head); });
    await capture('Ownership', async () => { item.owners = await ownership(provider, item); });
    await capture('Priority configuration', async () => {
        const doc = await provider.document('.onboarder-triage.json', item.pull.base);
        if (doc) {
            if (Buffer.byteLength(doc.text) > 16384)
                throw new Error('Triage policy exceeds 16 KB.');
            item.policy = { source: 'base-commit', revision: item.pull.base, hash: doc.hash, value: triagePolicy(JSON.parse(doc.text)) };
        }
    });
    item.architecture = await architecture(options.root, item, options.signal);
    // Never call captured data current when its second observation fails.
    item.freshness = 'stale';
    await capture('Freshness', async () => {
        const current = await provider.pull(number);
        if (current.head === item.pull.head && current.base === item.pull.base && current.updatedAt === item.pull.updatedAt && current.state === item.pull.state)
            item.freshness = 'current';
        else
            item.limitations.push('PR changed while signals were read. Refresh before making decisions.');
    });
    if (options.humanUrgency)
        item.humanUrgency = { ...options.humanUrgency, reason: evidenceText(options.humanUrgency.reason) };
    options.signal?.throwIfAborted();
    return prioritize(item);
}
//# sourceMappingURL=triage.js.map