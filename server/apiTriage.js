import { GithubApiError, GithubClient, positiveId } from '../cli/agent/github.js';
import { GithubProvider, safeProviderError } from './providers/github.js';
import { inspectTriage, listTriage, localGithubRepository } from './triage.js';
import { explainTriage, redactTriageValue } from './triageAI.js';
import { getSession } from './sessions.js';
import { sendError, sendJSON } from './http.js';
import { reviewLimits } from './reviewContext.js';
import { prioritize } from '../shared/triage/priority.js';
let running = 0;
export async function handleTriage(res, body, integrations = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        return sendError(res, 400, 'Provide a triage request object.');
    const b = body;
    if (!['list', 'inspect', 'explain'].includes(b.action) || Object.keys(b).some(k => !['action', 'repository', 'scanId', 'number', 'state', 'page', 'limit', 'provider', 'limits', 'humanUrgency'].includes(k)))
        return sendError(res, 400, 'Choose triage list, inspect or explicitly opt-in explain with supported fields.');
    if (b.repository !== undefined && (typeof b.repository !== 'string' || b.repository.length > 150))
        return sendError(res, 400, 'Use owner/name for the GitHub repository.');
    const session = typeof b.scanId === 'string' ? getSession(b.scanId) : null;
    if (b.scanId !== undefined && !session)
        return sendError(res, 404, 'Scan session expired. Scan the repository again.');
    let provider, limits;
    try {
        if (b.action !== 'list')
            positiveId(b.number, 'PR');
        if (b.humanUrgency !== undefined && (!b.humanUrgency || typeof b.humanUrgency !== 'object' || !/^P[0-3]$/.test(b.humanUrgency.priority) || !/^[a-f0-9]{40}$/.test(b.humanUrgency.head) || typeof b.humanUrgency.reason !== 'string' || !b.humanUrgency.reason.trim() || b.humanUrgency.reason.length > 1000))
            throw new Error('Human urgency requires priority, exact head and a bounded reason.');
        if (b.action === 'list' && (b.state !== undefined && !['open', 'closed', 'all'].includes(b.state) || b.page !== undefined && (!Number.isInteger(b.page) || b.page < 1 || b.page > 100) || b.limit !== undefined && (!Number.isInteger(b.limit) || b.limit < 1 || b.limit > 30)))
            throw new Error('Use an open/closed/all page (1–100), with 1–30 PRs.');
        if (b.action === 'explain') {
            limits = reviewLimits(b.limits);
            if (b.provider !== undefined) {
                const p = b.provider;
                if (!p || typeof p !== 'object' || Array.isArray(p) || !['api', 'hermes'].includes(p.connection) || Object.keys(p).some(k => !['connection', 'baseUrl', 'model', 'apiKey'].includes(k)))
                    throw new Error('Choose API or Hermes connection settings.');
                for (const k of ['baseUrl', 'model', 'apiKey'])
                    if (p[k] !== undefined && (typeof p[k] !== 'string' || p[k].length > 4096))
                        throw new Error('Invalid AI connection setting.');
                provider = { connection: p.connection, baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey };
            }
        }
        else if (b.provider !== undefined || b.limits !== undefined)
            throw new Error('AI settings require the explicit explain action.');
    }
    catch (e) {
        return sendError(res, 400, e.message);
    }
    if (running >= 2)
        return sendError(res, 429, 'Two triage requests are already running. Cancel or wait before retrying.');
    const abort = new AbortController(), signal = AbortSignal.any([abort.signal, AbortSignal.timeout(120000)]);
    const close = () => { if (!res.writableEnded)
        abort.abort(); };
    res.once('close', close);
    running++;
    try {
        const repository = b.repository || (session ? await localGithubRepository(session.root, signal) : '');
        // Validates identity before passing it to an authentication callback.
        new GithubClient(repository);
        const client = integrations.githubAutomation ? await integrations.githubAutomation.readClient(repository, signal) : integrations.triageClient ? integrations.triageClient(repository, signal) : new GithubClient(repository, { signal });
        const github = new GithubProvider(client);
        if (github.repository !== repository)
            throw new Error('GitHub client repository identity does not match this request.');
        let result = b.action === 'list' ? await listTriage(github, { state: b.state, page: b.page, limit: b.limit, signal }) : await inspectTriage(github, positiveId(b.number, 'PR'), { root: session?.root, signal, humanUrgency: b.humanUrgency });
        const explanation = b.action === 'explain' ? await explainTriage(github, result, { provider, limits, signal, complete: integrations.reviewComplete }) : undefined;
        if (explanation?.status === 'stale')
            result = prioritize({ ...result, freshness: 'stale' });
        // An allowlist may be revoked while a request is in flight.
        if (integrations.githubAutomation)
            await integrations.githubAutomation.assertReadRepository(repository);
        signal.throwIfAborted();
        const output = explanation ? { item: result, explanation } : result;
        // Never retain provider credentials or unredacted raw patches in an API artifact.
        const redacted = redactTriageValue(output, [provider?.apiKey || '']);
        if (Buffer.byteLength(JSON.stringify(redacted)) > 9 * 1024 * 1024)
            throw new Error('Triage response exceeds 9 MB after redaction. Narrow the inspection.');
        sendJSON(res, 200, redacted);
    }
    catch (e) {
        if (!abort.signal.aborted) {
            if (e instanceof GithubApiError && e.rateLimit) {
                if (e.rateLimit.retryAfterSeconds !== null)
                    res.setHeader('retry-after', String(Math.min(e.rateLimit.retryAfterSeconds, 86400)));
            }
            const message = signal.aborted ? 'Triage exceeded its two-minute limit. Refresh or narrow the inspection.' : safeProviderError(e);
            const rateLimited = e instanceof GithubApiError && e.status === 403 && (e.rateLimit?.remaining === 0 || typeof e.rateLimit?.retryAfterSeconds === 'number');
            sendJSON(res, e instanceof GithubApiError ? rateLimited ? 429 : e.status : 400, { error: message, ...(e instanceof GithubApiError ? { rateLimit: e.rateLimit } : {}) });
        }
    }
    finally {
        running--;
        res.off('close', close);
    }
}
//# sourceMappingURL=apiTriage.js.map