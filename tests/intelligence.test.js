import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { memoizedSource } from '../shared/analyzer/sourceCache.js';
import { ParseCache } from '../shared/analyzer/parseCache.js';
import { IntelligenceWorkspace, hash, boundedSource, compareRevisions } from '../server/intelligence/workspace.js';
import { IntelligenceStore, emptyWorkspaceState, validateWorkspaceState } from '../server/intelligence/store.js';
import { architectureViolations, parseCoverage, parseIntelligenceConfig, ownersFor, detectRoutes } from '../shared/intelligence/analysis.js';
import { runReview } from '../server/review.js';
import { reviewSarif } from '../shared/review/sarif.js';
import { callTool } from '../server/mcp/tools.js';

const git = (root, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim();
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-intelligence-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['src/ui', 'src/db', 'tests', 'packages/shared', 'coverage', '.github']) await mkdir(path.join(root, dir), { recursive: true });
  const files = {
    'package.json': JSON.stringify({ name: 'example', workspaces: ['packages/*'], dependencies: { shared: 'workspace:*', express: '^4' } }),
    'packages/shared/package.json': JSON.stringify({ name: 'shared', dependencies: { express: '^5' } }),
    'src/db/store.ts': 'export function loadUser(id: string) { return { id }; }\n',
    'src/ui/view.ts': 'import { loadUser } from "../db/store.js";\nexport const showUser = () => loadUser("1");\n',
    'tests/user.test.ts': 'import { showUser } from "../src/ui/view.js";\nshowUser();\n',
    'src/routes.ts': 'router.get("/users", requireAuth, showUser);\n',
    'schema.prisma': 'model User {\n id String @id\n}\n',
    'README.md': 'Authentication is enforced by requireAuth before showUser.\n',
    '.github/CODEOWNERS': '/src/db/ @data-team\n',
  };
  for (const [file, content] of Object.entries(files)) await writeFile(path.join(root, file), content);
  await writeFile(path.join(root, '.onboarder.json'), JSON.stringify({ version: 1,
    rules: [{ id: 'ui-db', from: 'src/ui/**', forbid: 'src/db/**', message: 'Use a service boundary.' }],
    knowledge: [{ id: 'store', path: 'src/db/store.ts', text: 'The storage boundary.', hash: hash(files['src/db/store.ts']) }] }));
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'fixture@example.invalid'); git(root, 'config', 'user.name', 'Fixture');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
  return root;
}
test('intelligence discovers authored boundaries, ownership, packages, routes, models and journeys', async t => {
  const root = await fixture(t); const w = new IntelligenceWorkspace(root); const r = await w.refresh();
  assert.equal(r.rules.length, 1); assert.equal(r.rules[0].baseline, false);
  assert.equal(r.knowledge[0].stale, false); assert.deepEqual(r.knowledge[0].owners, ['@data-team']);
  assert.equal(r.packages.packages.length, 2); assert.equal(r.packages.edges[0].to, 'shared');
  assert.deepEqual(r.packages.duplicateDeclarations[0], { name: 'express', ranges: ['^4', '^5'] });
  assert.equal(detectRoutes(new Map([['routes.js', 'export function register(router) { router.get("/users", requireAuth, showUser); }']]))[0].handler, 'showUser');
  assert.equal(r.routes[0].route, '/users'); assert.deepEqual(r.routes[0].middleware, ['requireAuth']);
  assert.equal(r.dataModels[0].name, 'User'); assert.ok(r.journeys.some(j => j.role === 'Backend developer'));
  assert.equal(r.coverage.status, 'unknown'); assert.equal(r.semantic.available, false);
});
test('refresh reuses unchanged parsing and invalidates changed and deleted source', async t => {
  const root = await fixture(t); const w = new IntelligenceWorkspace(root); const first = await w.refresh(); const warm = await w.refresh();
  assert.equal(warm.snapshot.fingerprint, first.snapshot.fingerprint);
  assert.equal(warm.snapshot.metrics.reused, first.snapshot.metrics.files);
  await writeFile(path.join(root, 'src/db/store.ts'), 'export function loadAccount() { return 2; }\n');
  const changed = await w.refresh(); assert.notEqual(changed.snapshot.fingerprint, first.snapshot.fingerprint);
  assert.equal(changed.snapshot.metrics.reused, first.snapshot.metrics.files - 1);
  assert.equal(changed.knowledge[0].stale, true);
  await rm(path.join(root, 'src/db/store.ts')); await w.refresh();
  assert.equal(w.cache.has('src/db/store.ts'), false);
});
test('evidence is bounded, revision-pinned, redacted and includes statically related tests', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'src/auth.ts'), 'export const authentication = 1;\nconst password = "do-not-return-this-secret";\n');
  const w = new IntelligenceWorkspace(root); const r = await w.refresh();
  const answer = w.evidence('loadUser authentication'); assert.equal(answer.fingerprint, r.snapshot.fingerprint);
  assert.ok(answer.evidence.some(e => e.path === 'src/db/store.ts'));
  assert.ok(answer.relatedTests.includes('tests/user.test.ts'));
  assert.equal(JSON.stringify(answer).includes('do-not-return-this-secret'), false);
  assert.ok(answer.evidence.every(e => e.startLine >= 1 && e.endLine >= e.startLine && e.text.length <= 5000));
  assert.throws(() => w.evidence(''), /question/);
});
test('source reader rejects traversal, credential files, symlinks, directories and binary data', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, '.env'), 'password=secret');
  await symlink(path.join(root, 'src/db'), path.join(root, 'link'));
  await writeFile(path.join(root, 'binary.ts'), Buffer.from([0, 1, 2]));
  for (const file of ['../outside', '/etc/passwd', '.env', 'link/store.ts', 'src', 'binary.ts']) await assert.rejects(boundedSource(root, file));
});
test('measured LCOV and Cobertura remain separate from static test reachability', () => {
  const lcov = parseCoverage('SF:src/a.ts\nDA:1,3\nDA:2,0\nBRDA:1,0,0,1\nBRDA:1,0,1,-\nend_of_record\n');
  assert.deepEqual(lcov.files[0], { path: 'src/a.ts', covered: [1], uncovered: [2], branchesCovered: 1, branchesTotal: 2 });
  const xml = parseCoverage('<coverage><class filename="src/a.ts"><lines><line number="2" hits="1" branch="true" condition-coverage="50% (1/2)"/></lines></class></coverage>');
  assert.deepEqual(xml.files[0].covered, [2]); assert.equal(xml.files[0].branchesTotal, 2);
  assert.throws(() => parseCoverage('SF:/private/file.ts\nDA:1,1\n'), /relative/);
  assert.throws(() => parseCoverage('<!DOCTYPE coverage [<!ENTITY x SYSTEM "file:///secret">]><coverage/>'), /DTD/);
  assert.throws(() => parseCoverage('DA:1,1'), /SF/);
});
test('coverage from another revision is stale and missing coverage remains unknown', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'coverage/lcov.info'), 'SF:src/db/store.ts\nDA:1,1\nend_of_record\n');
  const cfg = JSON.parse(await readFile(path.join(root, '.onboarder.json'), 'utf8'));
  cfg.coverage = { path: 'coverage/lcov.info', revision: '0000000000000000000000000000000000000000' };
  await writeFile(path.join(root, '.onboarder.json'), JSON.stringify(cfg));
  assert.equal((await new IntelligenceWorkspace(root).refresh()).coverage.status, 'stale');
});
test('generated coverage metadata matches dirty source and becomes stale after a source edit', async t => {
  const root = await fixture(t); const w = new IntelligenceWorkspace(root);
  const cfg = JSON.parse(await readFile(path.join(root, '.onboarder.json'), 'utf8'));
  cfg.coverage = { path: 'coverage/lcov.info', metadata: 'coverage/onboarder.json' };
  await writeFile(path.join(root, '.onboarder.json'), JSON.stringify(cfg));
  await writeFile(path.join(root, 'coverage/lcov.info'), 'SF:src/db/store.ts\nDA:1,1\nend_of_record\n');
  const initial = await w.refresh();
  await writeFile(path.join(root, 'coverage/onboarder.json'), JSON.stringify({ revision: initial.snapshot.revision, sourceFingerprint: initial.snapshot.sourceFingerprint }));
  assert.equal((await w.refresh()).coverage.status, 'current');
  await writeFile(path.join(root, 'src/db/store.ts'), 'export function loadUser() { return 2; }\n');
  assert.equal((await w.refresh()).coverage.status, 'stale');
});
test('nested project aliases and declared workspace package entry points resolve into real edges', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'packages/app/src'), { recursive: true });
  await mkdir(path.join(root, 'packages/shared/src'), { recursive: true });
  await writeFile(path.join(root, 'packages/shared/package.json'), JSON.stringify({ name: 'shared', main: 'src/index.ts' }));
  await writeFile(path.join(root, 'packages/shared/src/index.ts'), 'export const sharedValue = 1;\n');
  await writeFile(path.join(root, 'packages/app/package.json'), JSON.stringify({ name: 'app', dependencies: { shared: 'workspace:*' } }));
  await writeFile(path.join(root, 'packages/app/tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/*'] } } }));
  await writeFile(path.join(root, 'packages/app/src/utils.ts'), 'export const localValue = 1;\n');
  await writeFile(path.join(root, 'packages/app/src/main.ts'), 'import { localValue } from "@app/utils";\nimport { sharedValue } from "shared";\nexport const value = localValue + sharedValue;\n');
  const report = await new IntelligenceWorkspace(root).refresh({ semantic: Boolean(process.env.ONBOARDER_TYPESCRIPT_MODULE) });
  assert.ok(report.snapshot.edges.some(e => e.from === 'packages/app/src/main.ts' && e.to === 'packages/app/src/utils.ts'));
  assert.ok(report.snapshot.edges.some(e => e.from === 'packages/app/src/main.ts' && e.to === 'packages/shared/src/index.ts'));
  if (process.env.ONBOARDER_TYPESCRIPT_MODULE) assert.ok(report.semantic.references.some(r => r.name === 'localValue' && r.targetPath === 'packages/app/src/utils.ts'));
});
test('configuration enforces schema and architecture baselines do not hide results', () => {
  const config = parseIntelligenceConfig({ version: 1, rules: [{ id: 'r', from: 'ui/**', forbid: 'db/**', message: 'Boundary' }], baseline: ['r:ui/a.ts->db/b.ts'] });
  const violations = architectureViolations([{ from: 'ui/a.ts', to: 'db/b.ts', kind: 'imports', symbols: [] }], config);
  assert.equal(violations.length, 1); assert.equal(violations[0].baseline, true);
  assert.throws(() => parseIntelligenceConfig({ version: 1, execute: 'bad' }), /version 1/);
  assert.throws(() => parseIntelligenceConfig({ version: 1, knowledge: [{ id: 'x', path: '../outside', text: 'bad' }] }), /relative/);
  assert.deepEqual(ownersFor('a/b.ts', '*.ts @all\n/a/ @a'), ['@a']);
});
test('private snapshots and journey state survive reopen and concurrent writes', async t => {
  const root = await fixture(t); const directory = path.join(root, '.state'); const store = new IntelligenceStore(directory);
  const report = await new IntelligenceWorkspace(root).refresh(); const state = emptyWorkspaceState();
  state.notes.general = 'Read the storage boundary'; state.completed = ['backend:route'];
  await Promise.all([store.saveState(root, state), store.saveSnapshot(root, report.snapshot)]);
  const loaded = await new IntelligenceStore(directory).read(root);
  assert.equal(loaded.state.notes.general, state.notes.general); assert.deepEqual(loaded.state.completed, state.completed);
  assert.equal(loaded.snapshots.length, 1);
  assert.throws(() => validateWorkspaceState({ ...state, notes: JSON.parse('{"__proto__":"bad"}') }), /dictionary/);
  await store.clear(root); assert.equal((await store.read(root)).snapshots.length, 0);
});
test('exact revision comparison detects removed contracts and added dependencies without checkout', async t => {
  const root = await fixture(t); const before = git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(root, 'src/db/store.ts'), 'import { showUser } from "../ui/view.js";\nexport const loadAccount = showUser;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'changed');
  const result = await compareRevisions(root, before, 'HEAD');
  assert.ok(result.removedExports.some(e => e.name === 'loadUser'));
  assert.ok(result.addedConnections.includes('src/db/store.ts->src/ui/view.ts'));
  assert.ok(result.introducedCycles.length > 0);
  assert.equal(git(root, 'status', '--porcelain'), '');
});
test('staged review retains its exact patch after working-tree source changes and exports SARIF', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'src/ui/view.ts'), 'export const staged = eval("1");\n');
  git(root, 'add', 'src/ui/view.ts');
  const review = await runReview(root, { mode: 'staged' });
  await writeFile(path.join(root, 'src/ui/view.ts'), 'export const working = 42;\n');
  assert.ok(JSON.stringify(review.comparison).includes('staged'));
  assert.equal(JSON.stringify(review.comparison).includes('working = 42'), false);
  const sarif = reviewSarif(review); assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].results.length, review.findings.length);
});
test('MCP intelligence evidence omits source unless explicitly requested', async t => {
  const root = await fixture(t);
  const result = await callTool('onboarder_intelligence', { path: root, action: 'evidence', question: 'loadUser' });
  assert.ok(result.evidence.length); assert.equal('text' in result.evidence[0], false);
  const source = await callTool('onboarder_intelligence', { path: root, action: 'evidence', question: 'loadUser', includeSource: true });
  assert.equal(typeof source.evidence[0].text, 'string');
});
test('optional compiler resolves cross-file calls against captured files without external reads', async t => {
  if (!process.env.ONBOARDER_TYPESCRIPT_MODULE) return t.skip('Optional compiler integration requires ONBOARDER_TYPESCRIPT_MODULE.');
  const root = await fixture(t); const report = await new IntelligenceWorkspace(root).refresh({ semantic: true });
  assert.equal(report.semantic.available, true);
  assert.ok(report.semantic.definitions.some(d => d.name === 'loadUser'));
  assert.ok(report.semantic.references.some(r => r.name === 'loadUser' && r.path === 'src/ui/view.ts' && r.targetPath === 'src/db/store.ts' && r.kind === 'call'));
});
test('one-scan read sharing and bounded parse retention preserve content and UTF-8 budgets', async () => {
  let reads = 0; let content = 'éé';
  const source = { kind: 'fixture', root: '/fixture', name: 'fixture', list: async () => [], read: async () => { reads++; return content; } };
  const cached = memoizedSource(source, 4);
  await Promise.all([cached.read('file'), cached.read('file')]); assert.equal(reads, 1);
  content = 'new'; assert.equal(await cached.read('file'), 'éé');
  assert.equal(await memoizedSource(source).read('file'), 'new');
  const cache = new ParseCache(4); const analysis = { imports: [], exports: [], functions: [], classes: [] };
  cache.set('unicode', { text: 'éé', analysis }); cache.set('next', { text: 'a', analysis });
  assert.equal(cache.has('unicode'), false); assert.equal(cache.has('next'), true);
  cache.set('oversized', { text: '12345', analysis }); assert.equal(cache.has('oversized'), false);
});
test('real terminal watch emits changed snapshots and cancels without leaving a child process', { timeout: 10000 }, async t => {
  const root = await fixture(t);
  const entry = fileURLToPath(new URL('../bin/onboarder.js', import.meta.url));
  const child = spawn(process.execPath, [entry, 'intelligence', 'watch', root, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const reports = []; let buffer = '';
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.on('data', async chunk => {
      buffer += chunk;
      for (let index = buffer.indexOf('\n'); index >= 0; index = buffer.indexOf('\n')) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try {
          reports.push(JSON.parse(line));
          if (reports.length === 1) await writeFile(path.join(root, 'src/db/store.ts'), 'export function loadUser() { return "updated"; }\n');
          if (reports.length === 2) resolve();
        } catch (error) { reject(error); }
      }
    });
    child.once('exit', code => { if (reports.length < 2) reject(new Error('Watch exited early: ' + code)); });
  });
  const exited = once(child, 'exit'); child.kill('SIGINT'); const [code] = await exited;
  assert.equal(code, 0); assert.notEqual(reports[0].snapshot.fingerprint, reports[1].snapshot.fingerprint);
});
