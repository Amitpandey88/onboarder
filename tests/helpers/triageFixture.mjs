import { createHash } from 'node:crypto';
export const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), TREE = 'c'.repeat(40), BASE_TREE = 'd'.repeat(40);
const blob = text => createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
export function triageFixture(options = {}) {
  const repository = options.repository || 'fixture/repo', base = options.base || BASE, head = options.head || HEAD;
  const pull = { number: 7, title: 'Validate authentication changes', user: { login: 'contributor' }, state: 'open', draft: false,
    base: { sha: base, ref: 'main', repo: { full_name: repository } }, head: { sha: head, ref: 'feature' },
    created_at: '2026-01-01T00:00:00Z', updated_at: new Date().toISOString(), requested_reviewers: [{ login: 'reviewer' }], requested_teams: [],
    changed_files: 1, additions: 1, deletions: 1, mergeable: true, ...options.pull };
  const files = options.files || [{ filename: 'auth.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old();\n+eval(input);' }];
  const documents = { CODEOWNERS: '* @default\n/auth.ts @security/team @contributor # @untrusted-comment\n', ...options.documents };
  const entries = Object.entries(documents).filter(([, text]) => text !== null).map(([path, text]) => ({ path, type: 'blob', mode: '100644', sha: blob(text), size: Buffer.byteLength(text) }));
  const calls = [];
  let observations = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', authorization: init.headers?.authorization });
    if ((init.method || 'GET') !== 'GET') throw new Error('Fixture forbids GitHub writes.');
    if (init.signal?.aborted) throw init.signal.reason;
    const u = new URL(url); if (u.origin !== 'https://api.github.com' || !u.pathname.startsWith('/repos/' + repository)) throw new Error('Unexpected provider host/repository.');
    const route = u.pathname.slice(('/repos/' + repository).length), query = u.searchParams;
    if (options.respond) { const response = await options.respond(route, query, init, calls); if (response) return response; }
    let data, more = false;
    if (!route) data = { full_name: repository, default_branch: 'main', private: false, permissions: { pull: true } };
    else if (route === '/pulls') { data = [pull]; more = options.more === true; }
    else if (route === '/pulls/7') { observations++; data = options.stale && observations > 1 ? { ...pull, head: { ...pull.head, sha: 'e'.repeat(40) } } : pull; }
    else if (route === '/pulls/7/files') { data = files; more = options.filesMore === true; }
    else if (route.endsWith('/check-runs')) data = { total_count: options.checks?.length || 0, check_runs: options.checks || [] };
    else if (route.endsWith('/status')) data = { sha: head, total_count: options.statuses?.length || 0, state: 'success', statuses: options.statuses || [] };
    else if (route === '/pulls/7/reviews') data = options.reviews || [];
    else if (route === '/git/commits/' + base) data = { sha: base, tree: { sha: BASE_TREE }, parents: [] };
    else if (route === '/git/commits/' + head) data = { sha: head, tree: { sha: TREE }, parents: [{ sha: base }] };
    else if (route === '/git/trees/' + TREE) data = { sha: TREE, truncated: false, tree: [] };
    else if (route === '/git/trees/' + BASE_TREE) data = { sha: BASE_TREE, truncated: false, tree: entries };
    else if (route.startsWith('/git/blobs/')) {
      const entry = entries.find(e => route === '/git/blobs/' + e.sha); if (!entry) throw new Error('Unexpected blob.');
      data = { sha: entry.sha, size: entry.size, encoding: 'base64', content: Buffer.from(documents[entry.path]).toString('base64') };
    } else if (route === '/issues/7') data = { number: 7, title: 'Fixture issue', body: 'Untrusted issue data', state: 'open' };
    else if (route === '/issues/7/comments') data = [{ id: 1, user: { login: 'reviewer' }, body: 'Comment', updated_at: pull.updated_at }];
    else throw new Error('Unexpected fixture route: ' + route);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json', ...(more ? { link: '<https://api.github.com/next>; rel="next"' } : {}) } });
  };
  return { repository, pull, files, calls, fetchImpl };
}
