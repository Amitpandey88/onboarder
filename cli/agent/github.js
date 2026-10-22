export class GithubApiError extends Error {
    status;
    rateLimit;
    constructor(message, status, rateLimit) {
        super(message);
        this.status = status;
        this.rateLimit = rateLimit;
        this.name = 'GithubApiError';
    }
}
export function githubToken(env = process.env) {
    return [env.GITHUB_TOKEN, env.GH_TOKEN].map(t => (t || '').trim()).find(t => t && !t.startsWith('${')) || '';
}
export function repositoryFromRemote(remote) {
    const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
    return match && validRepository(`${match[1]}/${match[2]}`) ? `${match[1]}/${match[2]}` : null;
}
function validRepository(value) {
    const [owner, name, extra] = value.split('/');
    return !extra && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner || '') && /^[A-Za-z0-9_.-]{1,100}$/.test(name || '') && name !== '.' && name !== '..';
}
export function positiveId(value, label) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value)))
        throw new Error(`${label} must be a positive integer.`);
    const id = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
        throw new Error(`${label} must be a positive integer.`);
    return id;
}
export class GithubClient {
    repository;
    options;
    rateLimit;
    constructor(repository, options = {}) {
        this.repository = repository;
        this.options = options;
        if (!validRepository(repository))
            throw new Error('Use a GitHub repository in owner/name form.');
    }
    async request(route, method = 'GET', body) {
        if ((route !== '' && !route.startsWith('/')) || route.includes('..') || route.includes('#') || route.includes('\\') || /%(?:2e|2f|5c)/i.test(route.split('?')[0]))
            throw new Error('Invalid GitHub route.');
        const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'onboarder-hermes' };
        const token = this.options.token ?? githubToken();
        if (token)
            headers.authorization = `Bearer ${token}`;
        if (body !== undefined)
            headers['content-type'] = 'application/json';
        const signal = this.options.signal ? AbortSignal.any([this.options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
        const res = await (this.options.fetchImpl || fetch)(`https://api.github.com/repos/${this.repository}${route}`, {
            method, headers, signal, redirect: 'error', ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const count = (name) => { const raw = res.headers.get(name); return raw !== null && /^\d{1,12}$/.test(raw) ? Number(raw) : null; };
        const reset = count('x-ratelimit-reset');
        this.rateLimit = { remaining: count('x-ratelimit-remaining'), resetAt: reset !== null ? new Date(reset * 1000).toISOString() : null, retryAfterSeconds: count('retry-after') };
        if (!res.ok) {
            const reasons = { 401: 'GitHub authentication failed. Set GITHUB_TOKEN or GH_TOKEN.', 403: 'GitHub denied the request or its rate limit was reached.', 404: 'GitHub could not find this repository or resource; private repositories require a token.', 422: 'GitHub rejected the request. Check the issue, branch, or pull-request fields.' };
            await res.body?.cancel().catch(() => { });
            throw new GithubApiError(reasons[res.status] || `GitHub returned ${res.status}.`, res.status, this.rateLimit);
        }
        if (Number(res.headers.get('content-length')) > 2 * 1024 * 1024)
            throw new Error('GitHub response exceeds the size limit.');
        if (res.status === 204)
            return { data: null, more: false };
        const reader = res.body?.getReader();
        let bytes = 0, text = '';
        const decoder = new TextDecoder();
        if (reader) {
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    bytes += value.byteLength;
                    if (bytes > 2 * 1024 * 1024)
                        throw new Error('GitHub response exceeds the size limit.');
                    text += decoder.decode(value, { stream: true });
                }
                text += decoder.decode();
            }
            finally {
                await reader.cancel().catch(() => { });
            }
        }
        let data;
        try {
            data = JSON.parse(text);
        }
        catch {
            throw new Error('GitHub returned an unreadable response.');
        }
        return { data, more: /rel="next"/.test(res.headers.get('link') || '') };
    }
    async list(route, pages = 2) {
        const items = [];
        let more = false;
        for (let page = 1; page <= pages; page++) {
            const response = await this.request(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
            if (!Array.isArray(response.data))
                throw new Error('GitHub returned an unreadable list.');
            items.push(...response.data);
            more = response.more;
            if (!more)
                break;
        }
        return { items, truncated: more };
    }
}
//# sourceMappingURL=github.js.map