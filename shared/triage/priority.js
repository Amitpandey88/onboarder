export const DEFAULT_TRIAGE_POLICY = {
    version: 1, thresholds: { P0: 100, P1: 50, P2: 15 }, staleDays: 14, largeLines: 500, largeFiles: 25,
    weights: { critical: 100, high: 50, sensitive: 20, large: 15, dependency: 15, architecture: 30, breaking: 30, failedCI: 25, stale: 15, incomplete: 15, policy: 50 },
};
const object = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
export function triagePolicy(value) {
    if (value === undefined)
        return structuredClone(DEFAULT_TRIAGE_POLICY);
    if (!object(value) || value.version !== 1 || Object.keys(value).some(k => !Object.hasOwn(DEFAULT_TRIAGE_POLICY, k)))
        throw new Error('Unsupported triage policy. Use version 1.');
    const result = structuredClone(DEFAULT_TRIAGE_POLICY);
    for (const name of ['staleDays', 'largeLines', 'largeFiles'])
        if (value[name] !== undefined) {
            if (!Number.isInteger(value[name]) || value[name] < 1 || value[name] > 10000)
                throw new Error('Invalid triage policy limit.');
            result[name] = value[name];
        }
    for (const name of ['thresholds', 'weights'])
        if (value[name] !== undefined) {
            if (!object(value[name]) || Object.keys(value[name]).some(k => !Object.hasOwn(result[name], k)))
                throw new Error('Unknown triage score factor.');
            for (const [key, number] of Object.entries(value[name])) {
                if (!Number.isInteger(number) || Number(number) < 0 || Number(number) > 1000)
                    throw new Error('Triage score values must be integers from 0 to 1000.');
                result[name][key] = number;
            }
        }
    if (!(result.thresholds.P0 > result.thresholds.P1 && result.thresholds.P1 > result.thresholds.P2 && result.thresholds.P2 > 0))
        throw new Error('Triage thresholds must satisfy P0 > P1 > P2 > 0.');
    return result;
}
export const sensitivePath = (p) => /(?:^|[/. _-])(?:auth(?:entication|orization)?|security|permissions?|sessions?|tokens?|secrets?|crypto|payments?)(?:[/. _-]|$)/i.test(p);
export const policyPath = (p) => /(?:^|\/)(?:CODEOWNERS|\.onboarder(?:-review|-triage)?\.json)$/.test(p);
export function prioritize(item, now = Date.now()) {
    const policy = item.policy.value, factors = [], missing = [];
    const add = (id, reason, paths) => factors.push({ id, points: policy.weights[id], reason, ...(paths ? { paths } : {}) });
    const findings = item.report?.findings || [];
    if (findings.some(f => f.severity === 'critical'))
        add('critical', 'At least one critical review finding requires immediate human attention.');
    if (findings.some(f => f.severity === 'high'))
        add('high', 'At least one high-severity review finding requires human attention.');
    const sensitive = item.files.filter(f => sensitivePath(f.path) || f.previousPath && sensitivePath(f.previousPath)).map(f => f.path);
    if (sensitive.length)
        add('sensitive', 'Declared sensitive paths changed; this is a path heuristic, not a confirmed vulnerability.', sensitive);
    const policies = item.files.filter(f => policyPath(f.path) || f.previousPath && policyPath(f.previousPath)).map(f => f.path);
    if (policies.length)
        add('policy', 'Review policy or ownership declarations change; inspect these changes explicitly.', policies);
    if ((item.pull.additions ?? 0) + (item.pull.deletions ?? 0) >= policy.largeLines || (item.pull.changedFiles ?? 0) >= policy.largeFiles)
        add('large', 'Changed-line or file count exceeds the configured review-size threshold.');
    if ((item.architecture.boundaryViolations ?? 0) > 0 || (item.architecture.newCycles ?? 0) > 0)
        add('architecture', 'Revision-pinned analysis found new boundary violations or dependency cycles.');
    if (item.architecture.breakingExports.length)
        add('breaking', 'Previously exported names disappeared; these are compatibility candidates requiring inspection.', item.architecture.breakingExports);
    if (item.architecture.affectedCallers.length >= 5)
        add('dependency', 'At least five modules statically depend on changed files; reachability does not prove runtime impact.', item.architecture.affectedCallers);
    if (item.checks.state === 'failed')
        add('failedCI', 'At least one observed check or commit status failed.');
    if (now - Date.parse(item.pull.updatedAt) >= policy.staleDays * 86400000)
        add('stale', `No PR update for at least ${policy.staleDays} days.`);
    if (!item.inspected)
        missing.push('Changed-file patches, review findings, checks, reviewers and ownership have not been inspected.');
    if (!item.report || item.report.coverage.status === 'partial')
        missing.push('Deterministic review coverage is unavailable or partial.');
    if (!item.checks.complete || item.checks.state === 'unknown')
        missing.push('Observed CI status is unavailable, empty or incomplete.');
    if (item.checks.limitations.some(l => l.includes('required-check completeness are not established')))
        missing.push('Required branch checks and protection rules have not been established; merge readiness is unknown.');
    if (item.owners.status === 'unavailable')
        missing.push('Ownership declaration could not be inspected.');
    if (item.limitations.some(l => l.startsWith('Priority configuration:')))
        missing.push('Target-revision triage configuration is unavailable or invalid; defaults are shown.');
    if (!item.reviews.complete || ['unknown', 'outdated'].includes(item.reviews.state))
        missing.push('Current-head review decisions are unavailable or outdated.');
    if (item.architecture.status !== 'available')
        missing.push('Complete revision-pinned architecture impact is unavailable.');
    if (item.freshness === 'stale')
        missing.push('PR revisions changed during inspection; captured findings apply to the old revisions.');
    if (item.pull.mergeable === null)
        missing.push('GitHub has not established mergeability.');
    if (item.inspected && missing.length)
        add('incomplete', 'Required analysis signals are incomplete; a low observed score does not establish readiness.');
    let score = factors.reduce((n, f) => n + f.points, 0);
    let priority = score >= policy.thresholds.P0 ? 'P0' : score >= policy.thresholds.P1 ? 'P1' : score >= policy.thresholds.P2 ? 'P2' : 'P3';
    // Repository-provided weights never downgrade critical/high findings or changed trust policy.
    if (findings.some(f => f.severity === 'critical'))
        priority = 'P0';
    else if ((findings.some(f => f.severity === 'high') || policies.length) && priority > 'P1')
        priority = 'P1';
    if (item.humanUrgency) {
        if (item.humanUrgency.head !== item.pull.head || !/^P[0-3]$/.test(item.humanUrgency.priority) || !item.humanUrgency.reason.trim() || item.humanUrgency.reason.length > 1000)
            throw new Error('Human urgency must name this exact head revision and include a bounded reason.');
        factors.push({ id: 'human', points: 0, reason: 'Human-assigned minimum priority ' + item.humanUrgency.priority + ': ' + item.humanUrgency.reason });
        if (item.humanUrgency.priority < priority)
            priority = item.humanUrgency.priority;
    }
    const blocked = findings.some(f => ['critical', 'high'].includes(f.severity)) || item.checks.state === 'failed' || item.reviews.state === 'changes-requested' || item.pull.mergeable === false || policies.length > 0;
    const readiness = item.pull.state !== 'open' ? 'closed' : blocked ? 'blocked' : item.pull.draft ? 'waiting-review' : missing.length ? 'unknown' :
        item.checks.state === 'passed' && item.reviews.state === 'approved' && item.pull.mergeable === true ? 'human-approval' : 'waiting-review';
    const queues = ['all'];
    if (priority === 'P0' || priority === 'P1')
        queues.push('immediate');
    if (sensitive.length || findings.some(f => ['secret', 'security', 'injection', 'crypto', 'xss', 'deserialization', 'redirect'].includes(f.category)))
        queues.push('security');
    if (item.pull.draft || item.reviews.state === 'changes-requested' || item.checks.state === 'failed')
        queues.push('waiting-author');
    else if (item.pull.state === 'open' && readiness !== 'human-approval')
        queues.push('waiting-review');
    if (item.checks.state === 'failed')
        queues.push('failing-checks');
    if (readiness === 'human-approval')
        queues.push('human-approval');
    if (factors.some(f => f.id === 'stale') || item.freshness === 'stale')
        queues.push('stale');
    return { ...item, score, priority, factors, missingSignals: missing, provisional: missing.length > 0, readiness, queues };
}
export function filterTriage(items, input = {}) {
    const views = ['all', 'immediate', 'security', 'waiting-review', 'waiting-author', 'failing-checks', 'human-approval', 'stale'];
    if (input.view && !views.includes(input.view))
        throw new Error('Unknown triage queue view.');
    if (input.sort && !['priority', 'updated', 'size', 'oldest'].includes(input.sort))
        throw new Error('Unknown triage sort.');
    const words = (input.query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter(item => (!input.view || item.queues.includes(input.view)) && words.every(w => `${item.pull.number} ${item.pull.title} ${item.pull.author} ${item.files.map(f => f.path).join(' ')}`.toLowerCase().includes(w)))
        .sort((a, b) => input.sort === 'updated' ? Date.parse(b.pull.updatedAt) - Date.parse(a.pull.updatedAt) : input.sort === 'oldest' ? Date.parse(a.pull.updatedAt) - Date.parse(b.pull.updatedAt) : input.sort === 'size' ?
        (b.pull.additions ?? -1) + (b.pull.deletions ?? -1) - (a.pull.additions ?? -1) - (a.pull.deletions ?? -1) : a.priority.localeCompare(b.priority) || Number(a.provisional) - Number(b.provisional) || Date.parse(b.pull.updatedAt) - Date.parse(a.pull.updatedAt));
}
//# sourceMappingURL=priority.js.map