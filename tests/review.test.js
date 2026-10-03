import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getGitDiff, getGitRefs, parseUnifiedDiff } from '../server/gitDiff.js';
import { runReview } from '../server/review.js';
import { buildReview, parseReviewConfig, matchesReviewPath, reviewMarkdown } from '../shared/review/review.js';
import { main } from '../cli/main.js';
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
async function fixture(t, committed = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-review-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'Review fixture'); git(root, 'config', 'user.email', 'fixture@example.test');
  if (committed) { await writeFile(path.join(root, 'app.ts'), 'export const start = 1;\n// unchanged eval(input)\n'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial | pipe title'); }
  return root;
}
test('working review filters unchanged context, retains actual lines, and redacts credentials', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'app.ts'), 'export const start = 1;\n// unchanged eval(input)\nconst password = "fixtureCredential123";\neval(input);\nconsole.log(password);\n');
  const report = await runReview(root);
  assert.equal(report.files.length, 1);
  assert.equal(report.findings.find(f => f.rule === 'eval').line, 4);
  assert.equal(report.findings.filter(f => f.rule === 'eval').length, 1);
  assert.equal(report.findings.find(f => f.rule === 'hardcoded-secret').line, 3);
  assert.ok(!JSON.stringify(report).includes('fixtureCredential123'));
  assert.equal(report.checks.find(c => c.id === 'security').status, 'fail');
  assert.equal(report.checks.find(c => c.id === 'tests').status, 'warn');
  assert.equal(report.fingerprint.length, 64);
});
test('staged reviews read the index, not later unstaged edits', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'app.ts'), 'export const start = 2;\n'); git(root, 'add', '.');
  await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  const staged = await runReview(root, { mode: 'staged' });
  assert.equal(staged.findings.length, 0);
  assert.equal((await runReview(root)).findings[0].rule, 'eval');
});
test('branch comparisons review the committed range even with a dirty tree', async t => {
  const root = await fixture(t); const base = git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(root, 'app.ts'), 'eval(input);\n'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'change');
  await writeFile(path.join(root, 'app.ts'), 'export const safe = 2;\n');
  const report = await runReview(root, { mode: 'range', base, head: 'HEAD' });
  assert.equal(report.findings[0].rule, 'eval');
  assert.equal(report.mode, 'range');
  assert.ok(report.head);
});
test('invalid refs do not silently fall back to clean or working diffs', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  await assert.rejects(getGitDiff(root, { base: 'missing-branch' }), /unavailable/);
  await assert.rejects(getGitDiff(root, { base: '--output=oops' }), /valid branch/);
  await assert.rejects(getGitDiff(root, { mode: 'range', head: '' }), /head reference/);
  await assert.rejects(getGitDiff(root, { base: 'HEAD\n--stat' }), /valid branch/);
});
test('non-git folders report unavailable history and reject review', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-no-git-')); t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await getGitRefs(root)).available, false);
  await assert.rejects(runReview(root), /Git could not/);
});
test('unborn repositories and untracked paths with whitespace and unicode are reviewed', async t => {
  const root = await fixture(t, false);
  await writeFile(path.join(root, 'new café file.ts'), 'eval(input);\n');
  const report = await runReview(root);
  assert.equal(report.files[0].path, 'new café file.ts');
  assert.equal(report.findings[0].line, 1);
  assert.equal(report.coverage.untracked, 1);
});
test('profiles, glob exclusions and guidelines are applied and declared', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'src', 'client.ts'), 'var client = 1;\nconsole.log(client);\n');
  await writeFile(path.join(root, '.onboarder-review.json'), JSON.stringify({ profile: 'thorough', exclude: ['.onboarder-review.json'], instructions: [{ path: 'src/**', instruction: 'Confirm error handling.' }] }));
  const thorough = await runReview(root);
  assert.equal(thorough.findings.length, 2);
  assert.deepEqual(thorough.files.find(f => f.path === 'src/client.ts').instructions, ['Confirm error handling.']);
  assert.equal(thorough.files.find(f => f.path === '.onboarder-review.json').skipped, 'Excluded by repository configuration');
  assert.equal((await runReview(root, { profile: 'focused' })).findings.length, 0);
  assert.ok(reviewMarkdown(thorough).includes('Confirm error handling.'));
});
test('invalid config and oversized untracked files fail explicitly', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, '.onboarder-review.json'), '{oops');
  await assert.rejects(runReview(root), /Invalid .onboarder-review.json/);
  await rm(path.join(root, '.onboarder-review.json'));
  await writeFile(path.join(root, 'huge.ts'), 'x'.repeat(1024 * 1024 + 1));
  await assert.rejects(runReview(root), /exceeds the 1 MB/);
});
test('config symlinks are rejected rather than reading outside the scan', async t => {
  const root = await fixture(t); const secret = path.join(root, '..', path.basename(root) + '.json');
  await writeFile(secret, '{}'); t.after(() => rm(secret, { force: true }));
  await symlink(secret, path.join(root, '.onboarder-review.json'));
  await assert.rejects(runReview(root), /regular JSON file/);
});
test('binary changes are represented as skipped and conflict markers fail their check', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'image.dat'), Buffer.from([0, 1, 2]));
  await writeFile(path.join(root, 'conflict.ts'), '<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> branch\n');
  const report = await runReview(root);
  assert.equal(report.files.find(f => f.path === 'image.dat').skipped, 'Binary content');
  assert.equal(report.checks.find(c => c.id === 'conflicts').status, 'fail');
  assert.equal(report.coverage.skipped, 1);
});
test('Git metadata keeps pipe characters in commit titles', async t => {
  const root = await fixture(t);
  assert.equal((await getGitRefs(root)).commits[0].message, 'initial | pipe title');
});
test('quoted paths and source content beginning with +++ or --- are parsed correctly', () => {
  const parsed = parseUnifiedDiff('diff --git "a/caf\\303\\251 file.ts" "b/caf\\303\\251 file.ts"\n--- "a/caf\\303\\251 file.ts"\n+++ "b/caf\\303\\251 file.ts"\n@@ -1 +1 @@\n---old\n+++new\n');
  assert.equal(parsed.files[0].newPath, 'café file.ts'); assert.equal(parsed.stats.additions, 1); assert.equal(parsed.stats.deletions, 1);
});
test('configuration validates profiles and path match vocabulary', () => {
  assert.throws(() => parseReviewConfig({ profile: 'false-safe' }), /profile/);
  assert.throws(() => parseReviewConfig({ unexpected: true }), /Unknown/);
  assert.throws(() => parseReviewConfig({ instructions: [{ path: '**' }] }), /guideline/);
  for (const p of ['client.ts', 'src/client.ts', 'src/nested/client.ts']) assert.equal(matchesReviewPath(p, '**/*.ts'), true);
  assert.equal(matchesReviewPath('src/nested/client.ts', 'src/*.ts'), false);
  assert.equal(matchesReviewPath('src/a.ts', 'src/?.ts'), true);
});
test('review CLI exports JSON and applies an explicit severity gate', async t => {
  const root = await fixture(t); await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  const output = []; const original = console.log; console.log = v => output.push(v); t.after(() => { console.log = original; });
  assert.equal(await main(['review', root, '--json', '--fail-on', 'high']), 1);
  assert.equal(JSON.parse(output[0]).findings[0].rule, 'eval');
  assert.equal(await main(['review', root, '--json']), 0);
});
test('report fingerprints change after an edit, preventing acknowledgements carrying onto new changes', async t => {
  const root = await fixture(t); await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  const before = await runReview(root); const again = await runReview(root); assert.equal(before.fingerprint, again.fingerprint);
  await writeFile(path.join(root, 'app.ts'), 'eval(other);\n'); const after = await runReview(root); assert.notEqual(before.fingerprint, after.fingerprint);
});

test('credentials are redacted from other rule excerpts on the same line', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'app.ts'), 'const password = "fixtureCredential123"; eval(password);\n');
  const report = await runReview(root);
  assert.equal(report.findings.length, 2);
  assert.ok(!JSON.stringify(report).includes('fixtureCredential123'));
  assert.ok(report.findings.every(f => f.excerpt === '[credential content redacted]'));
});
test('subfolder scans cannot expose diffs from outside the scanned capability', async t => {
  const root = await fixture(t); await mkdir(path.join(root, 'subfolder'));
  await assert.rejects(runReview(path.join(root, 'subfolder')), /repository root/);
});
test('untracked symlinks are visible as skipped without reading the target', async t => {
  const root = await fixture(t); await symlink('../not-a-real-file', path.join(root, 'link.ts'));
  const report = await runReview(root);
  assert.equal(report.files[0].skipped, 'Untracked symlink: target not read');
  assert.equal(report.coverage.untracked, 1);
});
test('canceling a review interrupts Git operations', async t => {
  const root = await fixture(t);
  await assert.rejects(runReview(root, { signal: AbortSignal.abort() }), { name: 'AbortError' });
});
test('path glob matching remains bounded for adversarial star patterns', () => {
  assert.equal(matchesReviewPath('a'.repeat(4000) + '.ts', '*a'.repeat(90) + 'b'), false);
  assert.equal(matchesReviewPath('foofile.ts', '**/file.ts'), false);
  assert.equal(matchesReviewPath('foo/file.ts', '**/file.ts'), true);
});
test('review API applies session, validation, origin, and explicit Git failure guards', async t => {
  const { createServer } = await import('../server/index.js');
  const { openSession } = await import('../server/sessions.js');
  const root = await fixture(t); await writeFile(path.join(root, 'app.ts'), 'eval(input);\n');
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`; const scanId = openSession({ root });
  const post = body => fetch(endpoint + '/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await post({ scanId }); assert.equal(result.status, 200); assert.equal((await result.json()).findings[0].rule, 'eval');
  assert.equal((await post({ scanId, mode: 'wrong' })).status, 400);
  assert.equal((await post({ scanId, profile: 'wrong' })).status, 400);
  assert.equal((await post({ scanId, base: {} })).status, 400);
  assert.equal((await post({ scanId: 'missing' })).status, 404);
  assert.equal((await fetch(endpoint + '/api/review', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: JSON.stringify({ scanId }) })).status, 403);
  const badDiff = await fetch(endpoint + `/api/diff?scan=${scanId}&base=missing`); assert.equal(badDiff.status, 422); assert.match((await badDiff.json()).error, /unavailable/);
});

test('patch file markers disambiguate paths containing Git header delimiters', () => {
  const diff = parseUnifiedDiff('diff --git a/a b/file.ts b/a b/file.ts\n--- a/a b/file.ts\t\n+++ b/a b/file.ts\t\n@@ -1 +1 @@\n-old\n+new\n');
  assert.equal(diff.files[0].oldPath, 'a b/file.ts');
  assert.equal(diff.files[0].newPath, 'a b/file.ts');
});
