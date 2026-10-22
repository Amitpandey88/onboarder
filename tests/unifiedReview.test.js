import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { GithubClient } from '../cli/agent/github.js';
import { GithubAutomation } from '../server/intelligence/githubAutomation.js';
import { githubReviewConfig, githubReviewDiff } from '../server/intelligence/githubReview.js';
import { runReview } from '../server/review.js';
import { buildReview, parseReviewConfig, parseReviewConfigText, reviewMarkdown } from '../shared/review/review.js';
import { reviewSarif } from '../shared/review/sarif.js';

const repository = 'fixture/repo', head = 'a'.repeat(40), base = 'b'.repeat(40), treeSha = 'c'.repeat(40);
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const blobId = text => createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
const changed = (filename = 'app.ts', line = 'eval(input);') => ({ filename, status: 'modified', additions: 1, deletions: 1,
  patch: '@@ -1 +1 @@\n-export const safe = 1;\n+' + line });
async function temp(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-unified-review-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
async function repo(t) {
  const root = await temp(t);
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'Review fixture'); git(root, 'config', 'user.email', 'review@example.test');
  await writeFile(path.join(root, 'app.ts'), 'export const safe = 1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base'); return root;
}
function configResponses(text, commitSha = head) {
  const id = text === undefined ? null : blobId(text);
  return {
    ['/git/commits/' + commitSha]: { sha: commitSha, tree: { sha: treeSha } },
    ['/git/trees/' + treeSha]: { sha: treeSha, truncated: false, tree: id ? [{ path: '.onboarder-review.json', type: 'blob', mode: '100644', sha: id, size: Buffer.byteLength(text) }] : [] },
    ...(id ? { ['/git/blobs/' + id]: { sha: id, size: Buffer.byteLength(text), encoding: 'base64', content: Buffer.from(text).toString('base64') } } : {}),
  };
}
async function automationFixture(t, options = {}) {
  const root = await temp(t), file = path.join(root, 'automation.json');
  await writeFile(file, JSON.stringify({ version: 1, publish: options.publish ?? false, repositories: { [repository]: {} } }));
  const reviewedHead = options.head || head, reviewedBase = options.base || base;
  const responses = configResponses(options.config, reviewedHead), requests = [], writes = [];
  const pr = { state: 'open', changed_files: options.expectedFiles ?? (options.files || [changed()]).length,
    head: { sha: reviewedHead, repo: { full_name: options.fork ? 'fork/repo' : repository } }, base: { sha: reviewedBase, repo: { full_name: repository } } };
  let prReads = 0;
  const client = new GithubClient(repository, { token: 'test-only-token', fetchImpl: async (url, init) => {
    const route = new URL(url).pathname.replace('/repos/' + repository, '') + new URL(url).search;
    requests.push({ route, method: init.method });
    if (init.method !== 'GET') { const body = JSON.parse(init.body); writes.push({ route, method: init.method, body }); return Response.json({ id: 42 }); }
    if (route === '/pulls/3') {
      prReads++;
      const value = options.prAt ? await options.prAt(prReads, structuredClone(pr)) : pr;
      return Response.json(value);
    }
    if (route.startsWith('/pulls/3/files?')) {
      if (options.beforeFiles) await options.beforeFiles({ file, pr });
      const page = Number(new URL(url).searchParams.get('page'));
      return Response.json(options.pages ? options.pages[page - 1] || [] : options.files || [changed()],
        { headers: options.truncated || options.pages && page < options.pages.length ? { link: '<https://api.github.com/ignored>; rel="next"' } : {} });
    }
    if (route.includes('/check-runs')) {
      if (options.beforeLookup) await options.beforeLookup({ file, pr });
      return Response.json({ check_runs: options.checks || [] }, { headers: options.checkPages ? { link: '<https://api.github.com/ignored>; rel="next"' } : {} });
    }
    if (Object.hasOwn(responses, route)) {
      const response = options.configResponse ? options.configResponse(route, structuredClone(responses[route])) : responses[route];
      return response instanceof Response ? response : Response.json(response);
    }
    throw new Error('Unexpected mocked GitHub route: ' + route);
  } });
  const automation = new GithubAutomation(file, 'test-only-secret-at-least-24-characters', target => { assert.equal(target, repository); return client; });
  const payload = { action: 'synchronize', repository: { full_name: repository }, number: 3,
    pull_request: { head: pr.head, base: pr.base } };
  const run = async () => { await automation.accept('pull_request', payload); await automation.idle(); return (await automation.jobs())[0]; };
  return { root, file, client, automation, payload, requests, writes, run, responses, pr };
}

test('local range and GitHub reviews apply the same pinned config, exclusions, profiles and guidelines', async t => {
  const root = await repo(t), start = git(root, 'rev-parse', 'HEAD');
  const config = JSON.stringify({ profile: 'thorough', exclude: ['generated/**', '.onboarder-review.json'],
    instructions: [{ path: '**/*.ts', instruction: 'Check input validation.' }] });
  await mkdir(path.join(root, 'generated')); await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  await writeFile(path.join(root, 'generated', 'skip.ts'), 'eval(input);\n');
  await writeFile(path.join(root, 'src', 'quality.ts'), 'var a = 1;\n');
  await writeFile(path.join(root, '.onboarder-review.json'), config);
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'review'); const end = git(root, 'rev-parse', 'HEAD');
  const files = [changed(), { filename: 'generated/skip.ts', status: 'added', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+eval(input);' },
    { filename: 'src/quality.ts', status: 'added', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+var a = 1;' },
    { filename: '.onboarder-review.json', status: 'added', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+' + config }];
  const fixture = await automationFixture(t, { config, files, head: end, base: start });
  // Later working-tree rules must never change a committed review.
  await writeFile(path.join(root, '.onboarder-review.json'), '{broken-working-config');
  const local = await runReview(root, { mode: 'range', base: start, head: end });
  const job = await fixture.run(); assert.equal(job.status, 'completed', job.error);
  const remote = job.report;
  assert.equal(local.profile, remote.profile);
  assert.deepEqual(local.findings.map(({ id, path, line, rule, severity, excerpt }) => ({ id, path, line, rule, severity, excerpt })),
    remote.findings.map(({ id, path, line, rule, severity, excerpt }) => ({ id, path, line, rule, severity, excerpt })));
  assert.deepEqual(local.files.map(({ path, skipped, instructions }) => ({ path, skipped, instructions })),
    remote.files.map(({ path, skipped, instructions }) => ({ path, skipped, instructions })));
  assert.equal(local.configuration.blob, remote.configuration.blob); assert.equal(remote.configuration.revision, end);
  assert.ok(fixture.requests.some(r => r.route === '/git/commits/' + end));
  assert.ok(fixture.requests.every(r => !r.route.includes('/contents/') && !r.route.includes('fork/')));
  assert.equal(fixture.writes.length, 0);
});

test('staged review uses index config and range review uses head config when the working file disagrees', async t => {
  const root = await repo(t), start = git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  await writeFile(path.join(root, '.onboarder-review.json'), JSON.stringify({ exclude: ['app.ts'] })); git(root, 'add', '.');
  await writeFile(path.join(root, '.onboarder-review.json'), '{}');
  const staged = await runReview(root, { mode: 'staged' });
  assert.equal(staged.findings.length, 0); assert.equal(staged.configuration.source, 'index');
  assert.equal((await runReview(root)).findings.length, 1);
  git(root, 'commit', '-qm', 'staged config');
  const range = await runReview(root, { mode: 'range', base: start, head: 'HEAD' });
  assert.equal(range.findings.length, 0); assert.equal(range.configuration.source, 'commit');
  assert.equal(range.configuration.revision, git(root, 'rev-parse', 'HEAD'));
});

test('missing configuration preserves balanced defaults and records confirmed absence', async t => {
  const root = await repo(t); await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  const local = await runReview(root), remote = await (await automationFixture(t)).run();
  assert.equal(local.profile, 'balanced'); assert.equal(remote.report.profile, 'balanced');
  assert.equal(local.configuration.status, 'missing'); assert.equal(remote.report.configuration.status, 'missing');
  assert.equal(remote.report.findings[0].id, local.findings[0].id);
});

test('invalid JSON, schemas and explicit null configuration fail without leaking source', async t => {
  for (const config of ['{broken "private-value-not-for-output"', '{"exclude":null}', '{"profile":"unknown"}', '{"instructions":[{"path":"**","instruction":"x","typo":true}]}']) {
    const fixture = await automationFixture(t, { config, publish: true });
    const job = await fixture.run(); assert.equal(job.status, 'failed'); assert.match(job.error, /Invalid .onboarder-review.json/);
    assert.equal(job.report, undefined); assert.equal(fixture.writes.length, 0); assert.ok(!job.error.includes('private-value-not-for-output'));
  }
  assert.throws(() => parseReviewConfig({ exclude: null }));
  assert.throws(() => parseReviewConfigText('{bad "private-value-not-for-output"'), error => !error.message.includes('private-value-not-for-output'));
});

test('fork head config uses only the granted repository and fails closed on unavailable objects or permissions', async t => {
  const fork = await automationFixture(t, { fork: true, config: '{"exclude":["app.ts"]}' });
  const accepted = await fork.run(); assert.equal(accepted.status, 'completed', accepted.error); assert.equal(accepted.report.findings.length, 0);
  for (const status of [401, 403, 404, 429]) {
    const fixture = await automationFixture(t, { fork: true, publish: true, configResponse: () => new Response('', { status }) });
    const job = await fixture.run(); assert.equal(job.status, 'failed'); assert.match(job.error, /Cannot load/); assert.equal(fixture.writes.length, 0);
  }
});

test('GitHub config refuses symlinks, directories, oversized blobs, truncated trees and mismatched object data', async t => {
  const mutations = [
    (route, data) => route.startsWith('/git/trees/') ? { ...data, truncated: true } : data,
    (route, data) => route.startsWith('/git/trees/') ? { ...data, tree: [{ ...data.tree[0], mode: '120000' }] } : data,
    (route, data) => route.startsWith('/git/trees/') ? { ...data, tree: [{ ...data.tree[0], type: 'tree', mode: '040000' }] } : data,
    (route, data) => route.startsWith('/git/trees/') ? { ...data, tree: [{ ...data.tree[0], size: 65537 }] } : data,
    (route, data) => route.startsWith('/git/commits/') ? { ...data, sha: base } : data,
    (route, data) => route.startsWith('/git/blobs/') ? { ...data, encoding: 'utf-8' } : data,
    (route, data) => route.startsWith('/git/blobs/') ? { ...data, content: Buffer.from('[]').toString('base64') } : data,
    (route, data) => route.startsWith('/git/blobs/') ? { ...data, content: 'not base64!' } : data,
  ];
  for (const configResponse of mutations) {
    const fixture = await automationFixture(t, { config: '{}', configResponse, publish: true });
    const job = await fixture.run(); assert.equal(job.status, 'failed'); assert.equal(fixture.writes.length, 0);
  }
});

test('finding identities, revision evidence and fingerprints are repeatable and preserve legacy consumers', async t => {
  const root = await repo(t); await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  const first = await runReview(root), again = await runReview(root);
  assert.equal(first.findings[0].id, 'app.ts:1:eval'); assert.equal(first.findings[0].id, again.findings[0].id);
  assert.equal(first.fingerprint, again.fingerprint); assert.equal(first.findings[0].evidence.method, 'static-pattern');
  assert.equal(first.findings[0].evidence.freshness, 'captured'); assert.equal(first.evidence.mode, 'working');
  const legacy = JSON.parse(JSON.stringify(first)); delete legacy.evidence; delete legacy.configuration; delete legacy.coverage.status;
  for (const finding of legacy.findings) delete finding.evidence;
  assert.ok(reviewMarkdown(legacy).includes('app.ts:1')); assert.equal(reviewSarif(legacy).runs[0].results[0].partialFingerprints['onboarderFinding/v1'], first.findings[0].id);
  const sarif = reviewSarif(first); assert.equal(sarif.runs[0].results[0].properties.evidence.source, 'git-diff');
  await writeFile(path.join(root, '.onboarder-review.json'), '{"profile":"thorough"}');
  assert.notEqual((await runReview(root)).fingerprint, first.fingerprint);
  const fixture = await automationFixture(t), job = await fixture.run();
  assert.equal(job.report.evidence.freshness, 'current'); assert.equal(job.report.findings[0].evidence.head, head);
});

test('concurrent duplicate webhook deliveries create one receipt, one analysis and one check', async t => {
  const fixture = await automationFixture(t, { publish: true });
  const replies = await Promise.all(Array.from({ length: 12 }, () => fixture.automation.accept('pull_request', fixture.payload)));
  await fixture.automation.idle();
  assert.equal(new Set(replies.map(r => r.id)).size, 1); assert.equal(replies.filter(r => r.duplicate).length, 11);
  assert.equal((await fixture.automation.jobs()).length, 1); assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.requests.filter(r => r.route.startsWith('/git/commits/')).length, 1);
});

test('stale heads, changed bases and closed PRs never publish, including a head change during check lookup', async t => {
  for (const [at, field] of [[1, 'head'], [2, 'head'], [3, 'head'], [2, 'base'], [2, 'state']]) {
    const fixture = await automationFixture(t, { publish: true, prAt: (read, pr) => {
      if (read >= at) { if (field === 'state') pr.state = 'closed'; else pr[field].sha = 'd'.repeat(40); } return pr;
    } });
    const job = await fixture.run(); assert.equal(job.status, 'stale'); assert.equal(fixture.writes.length, 0);
    if (job.report) { assert.equal(job.report.evidence.freshness, 'stale'); assert.ok(job.report.findings.every(f => f.evidence.freshness === 'stale')); }
  }
});

test('new PR commits get distinct durable jobs and check identities', async t => {
  const fixture = await automationFixture(t, { publish: true }); const first = await fixture.run();
  const newHead = 'e'.repeat(40); fixture.pr.head.sha = newHead;
  Object.assign(fixture.responses, configResponses(undefined, newHead));
  fixture.payload.pull_request.head = { sha: newHead };
  const accepted = await fixture.automation.accept('pull_request', fixture.payload); await fixture.automation.idle();
  assert.notEqual(accepted.id, first.id); assert.equal((await fixture.automation.jobs()).length, 2);
  assert.equal(fixture.writes.length, 2); assert.notEqual(fixture.writes[0].body.external_id, fixture.writes[1].body.external_id);
  assert.equal(fixture.writes[1].body.head_sha, newHead);
});

test('missing, truncated and malformed PR patches stay visible and produce neutral incomplete checks', async t => {
  const cases = [
    { files: [{ filename: 'binary.dat', status: 'added', additions: 0, deletions: 0 }] },
    { files: [{ ...changed(), patch: '@@ -1,2 +1,2 @@\n-old\n+eval(input);' }] },
    { files: [changed()], expectedFiles: 2 },
    { files: [changed()], pages: [[changed()], [], []], truncated: true },
    { files: [changed()], config: '{"exclude":["app.ts"]}' },
  ];
  for (const options of cases) {
    const fixture = await automationFixture(t, { ...options, publish: true });
    const job = await fixture.run(); assert.equal(job.status, 'completed', job.error);
    assert.equal(job.report.coverage.status, 'partial'); assert.equal(job.report.checks.find(c => c.id === 'coverage').status, 'warn');
    assert.equal(fixture.writes[0].body.conclusion, 'neutral');
    assert.match(fixture.writes[0].body.output.summary, /Patch coverage: partial/);
    if (job.report.coverage.skipped) {
      assert.ok(job.report.files[0].skipped);
      assert.ok(fixture.writes[0].body.output.summary.includes(job.report.files[0].skipped));
    }
  }
});

test('GitHub adapter preserves renames, additions, deletion metadata and available line counts', () => {
  const diff = githubReviewDiff([{ ...changed('new café.ts'), status: 'renamed', previous_filename: 'old café.ts' },
    { filename: 'deleted.ts', status: 'removed', additions: 0, deletions: 1, patch: '@@ -1 +0,0 @@\n-eval(old);' }], base, head);
  assert.equal(diff.files[0].status, 'renamed'); assert.equal(diff.files[0].oldPath, 'old café.ts');
  assert.equal(diff.files[1].status, 'deleted'); assert.deepEqual(diff.stats, { filesChanged: 2, additions: 1, deletions: 2 });
  const report = buildReview(diff); assert.equal(report.findings.length, 1); assert.match(report.files.find(f => f.path === 'deleted.ts').skipped, /Deleted/);
  assert.throws(() => githubReviewDiff([changed('../escape.ts')], base, head), /path/);
  assert.throws(() => githubReviewDiff([changed(), changed()], base, head), /Duplicate/);
});

test('publication rechecks repository grant and publish setting after analysis', async t => {
  for (const revoke of [true, false]) {
    const fixture = await automationFixture(t, { publish: true, beforeLookup: async ({ file }) => {
      await writeFile(file, JSON.stringify({ version: 1, publish: false, repositories: revoke ? {} : { [repository]: {} } }));
    } });
    const job = await fixture.run(); assert.equal(job.status, revoke ? 'failed' : 'completed'); assert.equal(fixture.writes.length, 0);
    if (revoke) assert.match(job.error, /grant changed/);
  }
});

test('unauthorized webhook repositories and mismatched base repositories are rejected', async t => {
  const fixture = await automationFixture(t);
  await assert.rejects(fixture.automation.accept('pull_request', { ...fixture.payload, repository: { full_name: 'other/repo' } }), /not enabled/);
  await assert.rejects(fixture.automation.accept('pull_request', { ...fixture.payload, pull_request: { ...fixture.payload.pull_request, base: { sha: base, repo: { full_name: 'other/repo' } } } }), /Invalid/);
  assert.equal((await fixture.automation.jobs()).length, 0); assert.equal(fixture.requests.length, 0);
});

test('restart recovery reuses an existing Check Run without appending annotations', async t => {
  const fixture = await automationFixture(t, { publish: true }); const first = await fixture.run();
  const receipt = path.join(fixture.root, 'github-jobs', first.id + '.json');
  await writeFile(receipt, JSON.stringify({ ...first, status: 'running' }));
  const client = { request: async (route, method = 'GET', body) => {
    if (method !== 'GET') { fixture.writes.push({ route, method, body }); return { data: { id: 42 } }; }
    if (route.includes('/check-runs')) return { data: { check_runs: [{ id: 42, name: 'Onboarder', head_sha: head, external_id: first.id }] }, more: false };
    return fixture.client.request(route);
  }, list: (...args) => fixture.client.list(...args) };
  const recovered = new GithubAutomation(fixture.file, 'test-only-secret-at-least-24-characters', () => client);
  await Promise.all([recovered.start(), recovered.start()]); await recovered.idle();
  assert.equal((await recovered.jobs())[0].status, 'completed'); assert.equal(fixture.writes.length, 2);
  assert.equal(fixture.writes[1].method, 'PATCH'); assert.equal(fixture.writes[1].route, '/check-runs/42');
  assert.equal(Object.hasOwn(fixture.writes[1].body.output, 'annotations'), false);
});

test('bounded check lookup fails transparently when deduplication cannot be established', async t => {
  const fixture = await automationFixture(t, { publish: true, checkPages: true });
  const job = await fixture.run(); assert.equal(job.status, 'failed'); assert.match(job.error, /lookup is incomplete/); assert.equal(fixture.writes.length, 0);
});

test('GitHub retained evidence and malformed configuration errors redact credentials', async t => {
  const fixture = await automationFixture(t, { files: [changed('app.ts', 'const password = "fixtureCredential123"; eval(password);')] });
  const job = await fixture.run(); assert.equal(job.status, 'completed');
  assert.equal(JSON.stringify(job).includes('fixtureCredential123'), false); assert.ok(job.report.comparison.files[0].hunks.length);
  assert.equal(job.report.findings[0].evidence.source, 'github-pr-patch');
});

test('committed and staged configuration symlinks and oversized config fail explicitly', async t => {
  const root = await repo(t), start = git(root, 'rev-parse', 'HEAD');
  await symlink('app.ts', path.join(root, '.onboarder-review.json')); git(root, 'add', '.');
  await assert.rejects(runReview(root, { mode: 'staged' }), /regular JSON/);
  git(root, 'commit', '-qm', 'symlink');
  await assert.rejects(runReview(root, { mode: 'range', base: start, head: 'HEAD' }), /regular JSON/);
  await rm(path.join(root, '.onboarder-review.json')); await writeFile(path.join(root, '.onboarder-review.json'), ' '.repeat(65537)); git(root, 'add', '.');
  await assert.rejects(runReview(root, { mode: 'staged' }), /64 KB/);
  await assert.rejects(runReview(root), /64 KB/);
});

test('GitHub config requests retain cancellation and bounded client responses', async () => {
  const cancelled = new GithubClient(repository, { signal: AbortSignal.abort(), token: '', fetchImpl: async (_url, init) => { init.signal.throwIfAborted(); throw new Error('unreachable'); } });
  await assert.rejects(githubReviewConfig(cancelled, head), /abort/i);
  const oversized = new GithubClient(repository, { token: '', fetchImpl: async () => Response.json({}, { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }) });
  await assert.rejects(githubReviewConfig(oversized, head), /size limit/);
});

test('large retained evidence respects receipt bounds and oversized report metadata fails before publication', async t => {
  const instructions = Array.from({ length: 15 }, () => ({ path: '**', instruction: 'Review ' + 'x'.repeat(1990) }));
  const files = Array.from({ length: 170 }, (_, index) => changed('file-' + index + '.ts', '// ' + 'x'.repeat(19000)));
  const fixture = await automationFixture(t, { publish: true, config: JSON.stringify({ instructions }), files,
    pages: [files.slice(0, 100), files.slice(100)] });
  const job = await fixture.run(); assert.equal(job.status, 'completed', job.error);
  assert.equal(job.report.comparison, undefined); assert.ok(job.report.coverage.limitations.some(l => l.includes('receipt limit')));
  const receipt = await readFile(path.join(fixture.root, 'github-jobs', job.id + '.json'));
  assert.ok(receipt.byteLength < 8 * 1024 * 1024);
  const oversized = await automationFixture(t, { publish: true, config: JSON.stringify({ instructions: [...instructions, ...instructions] }),
    files: files.map(f => ({ ...f, patch: changed(f.filename, '// safe').patch })),
    pages: [files.slice(0, 100).map(f => changed(f.filename, '// safe')), files.slice(100).map(f => changed(f.filename, '// safe'))] });
  const failed = await oversized.run(); assert.equal(failed.status, 'failed'); assert.match(failed.error, /receipt size limit/);
  assert.equal(oversized.writes.length, 0); assert.equal(failed.report, undefined);
});
