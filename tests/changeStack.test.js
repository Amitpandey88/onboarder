import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { buildChangeStack } from '../shared/changeStack/analysis.js';
import { changeStack } from '../server/changeStack.js';
import { handleIntelligence } from '../server/apiIntelligence.js';
import { openSession } from '../server/sessions.js';
import { callTool } from '../server/mcp/tools.js';

function snapshot(revision, files, edges = []) {
  return {
    schemaVersion: 1, id: 'snapshot-' + revision, createdAt: '2026-01-01T00:00:00.000Z', revision,
    fingerprint: 'fingerprint-' + revision, analyzerVersion: 'test',
    scanCoverage: { truncated: false, unavailable: 0, unsupported: 0 },
    files: files.map(file => ({ path: file.path, hash: file.hash, exports: file.exports || [] })),
    edges: edges.map(edge => ({ from: edge.from, to: edge.to, kind: edge.kind || 'static-import', symbols: edge.symbols || [] })),
    cycles: [], violations: [], metrics: { files: files.length, connections: edges.length, unresolved: 0, security: 0, reused: 0 },
  };
}
function patch(oldPath, newPath, status = 'modified', additions = 1, deletions = 1) {
  return { oldPath, newPath, status, additions, deletions, hunks: [{ header: '@@ -1 +1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, heading: '', lines: [{ type: 'add', text: 'changed' }] }] };
}
function semantic(definitions, references = [], available = true) {
  return { available, reason: available ? undefined : 'engine unavailable', engine: available ? 'typescript' : undefined, truncated: false, definitions, references };
}

const build = (before, after, patches, extra = {}) => buildChangeStack({ before, after, patches, generatedAt: '2026-01-02T00:00:00.000Z', ...extra });

test('Change Stack aligns a Git rename and compares exports under the new path', () => {
  const before = snapshot('base', [
    { path: 'src/store.ts', hash: 'old-store', exports: ['loadUser'] },
    { path: 'src/ui.ts', hash: 'ui', exports: [] },
  ], [{ from: 'src/ui.ts', to: 'src/store.ts', symbols: ['loadUser'] }]);
  const after = snapshot('head', [
    { path: 'src/account.ts', hash: 'new-store', exports: ['loadAccount'] },
    { path: 'src/ui.ts', hash: 'ui-2', exports: [] },
  ], [{ from: 'src/ui.ts', to: 'src/account.ts', symbols: ['loadAccount'] }]);
  const report = build(before, after, [patch('src/store.ts', 'src/account.ts', 'renamed')]);

  assert.equal(report.files.length, 1);
  assert.deepEqual(report.files[0].oldPath, 'src/store.ts');
  assert.deepEqual(report.files[0].newPath, 'src/account.ts');
  assert.equal(report.files[0].movement, 'renamed');
  assert.deepEqual(report.files[0].exportsRemoved, ['loadUser']);
  assert.deepEqual(report.files[0].exportsAdded, ['loadAccount']);
  assert.equal(report.files[0].groupId, 'contracts');
  assert.equal(report.architecture.removedExports[0].path, 'src/account.ts');
  assert.equal(report.architecture.addedConnections.length, 0, 'an aligned rename is not a new import');
  assert.equal(report.overlay.nodes.find(node => node.afterPath === 'src/account.ts').status, 'renamed');
  assert.equal(report.overlay.nodes.find(node => node.afterPath === 'src/ui.ts').status, 'modified');
  assert.equal(report.semantic.status, 'not-requested');
  assert.match(report.limitations.join(' '), /No repository code or tests were executed/);
});

test('Change Stack pairs identical deleted and added content without a Git rename record', () => {
  const before = snapshot('base', [{ path: 'src/old.ts', hash: 'same', exports: ['run'] }]);
  const after = snapshot('head', [{ path: 'src/new.ts', hash: 'same', exports: ['run'] }]);
  const report = build(before, after, [patch('src/old.ts', 'src/old.ts', 'deleted', 0, 3), patch('src/new.ts', 'src/new.ts', 'added', 3, 0)]);

  assert.equal(report.files.length, 1);
  assert.deepEqual(report.files[0].movementEvidence, ['Identical content hash in base and head']);
  assert.deepEqual(report.files[0].exportsRemoved, []);
  assert.deepEqual(report.files[0].exportsAdded, []);
  assert.equal(report.summary.fileMoves, 1);
});

test('Change Stack reports compiler-supported symbol moves and inferred renames', () => {
  const before = snapshot('base', [
    { path: 'src/load.ts', hash: 'a', exports: ['loadUser'] },
    { path: 'src/ui.ts', hash: 'b', exports: [] },
  ], [{ from: 'src/ui.ts', to: 'src/load.ts', symbols: ['loadUser'] }]);
  const after = snapshot('head', [
    { path: 'src/account.ts', hash: 'c', exports: ['loadAccount'] },
    { path: 'src/ui.ts', hash: 'd', exports: [] },
  ], [{ from: 'src/ui.ts', to: 'src/account.ts', symbols: ['loadAccount'] }]);
  const beforeSemantic = semantic([{ name: 'loadUser', path: 'src/load.ts', line: 2, kind: 'function' }], [{ name: 'loadUser', path: 'src/ui.ts', line: 3, targetPath: 'src/load.ts', targetLine: 2, kind: 'call' }]);
  const afterSemantic = semantic([{ name: 'loadAccount', path: 'src/account.ts', line: 2, kind: 'function' }], [{ name: 'loadAccount', path: 'src/ui.ts', line: 3, targetPath: 'src/account.ts', targetLine: 2, kind: 'call' }]);
  const moved = build(before, after, [patch('src/load.ts', 'src/load.ts', 'deleted', 0, 4), patch('src/account.ts', 'src/account.ts', 'added', 4, 0)], { semantic: { before: beforeSemantic, after: afterSemantic } });

  assert.equal(moved.semantic.status, 'available');
  assert.equal(moved.symbolChanges.length, 1, 'a different name is a rename candidate, not an exact move');
  assert.equal(moved.symbolChanges[0].kind, 'renamed');
  assert.equal(moved.symbolChanges[0].confidence, 'candidate');

  const sameNameAfter = semantic([{ name: 'loadUser', path: 'src/account.ts', line: 2, kind: 'function' }], [{ name: 'loadUser', path: 'src/ui.ts', line: 3, targetPath: 'src/account.ts', targetLine: 2, kind: 'call' }]);
  const afterSameName = snapshot('head', [
    { path: 'src/account.ts', hash: 'c', exports: ['loadUser'] },
    { path: 'src/ui.ts', hash: 'd', exports: [] },
  ], [{ from: 'src/ui.ts', to: 'src/account.ts', symbols: ['loadUser'] }]);
  const exactMove = build(before, afterSameName, [patch('src/load.ts', 'src/load.ts', 'deleted', 0, 4), patch('src/account.ts', 'src/account.ts', 'added', 4, 0)], { semantic: { before: beforeSemantic, after: sameNameAfter } });
  assert.equal(exactMove.symbolChanges.length, 1);
  assert.equal(exactMove.symbolChanges[0].kind, 'renamed');
  assert.equal(exactMove.symbolChanges[0].confidence, 'compiler-supported');
  assert.equal(exactMove.symbolChanges[0].references.length, 1);
});

test('Change Stack only calls a same-file symbol rename when references retarget', () => {
  const before = snapshot('base', [{ path: 'src/api.ts', hash: 'a', exports: ['loadUser'] }, { path: 'src/ui.ts', hash: 'b', exports: [] }], [{ from: 'src/ui.ts', to: 'src/api.ts', symbols: ['loadUser'] }]);
  const after = snapshot('head', [{ path: 'src/api.ts', hash: 'c', exports: ['loadAccount'] }, { path: 'src/ui.ts', hash: 'd', exports: [] }], [{ from: 'src/ui.ts', to: 'src/api.ts', symbols: ['loadAccount'] }]);
  const beforeSemantic = semantic([{ name: 'loadUser', path: 'src/api.ts', line: 1, kind: 'function' }], [{ name: 'loadUser', path: 'src/ui.ts', line: 2, targetPath: 'src/api.ts', targetLine: 1, kind: 'call' }]);
  const afterSemantic = semantic([{ name: 'loadAccount', path: 'src/api.ts', line: 1, kind: 'function' }], [{ name: 'loadAccount', path: 'src/ui.ts', line: 2, targetPath: 'src/api.ts', targetLine: 1, kind: 'call' }]);
  const report = build(before, after, [patch('src/api.ts', 'src/api.ts')], { semantic: { before: beforeSemantic, after: afterSemantic } });

  assert.equal(report.symbolChanges.length, 1);
  assert.equal(report.symbolChanges[0].previousName, 'loadUser');
  assert.equal(report.symbolChanges[0].kind, 'renamed');
  assert.equal(report.files[0].groupId, 'contracts');
  assert.deepEqual(report.files[0].semanticChangeIds, ['symbol-1']);
});

test('Change Stack bounds overlays and reports their true size', () => {
  const files = Array.from({ length: 170 }, (_, index) => ({ path: `src/f${String(index).padStart(3, '0')}.ts`, hash: 'h' + index, exports: [] }));
  const report = build(snapshot('base', files), snapshot('head', files), files.map(file => patch(file.path, file.path)));

  assert.equal(report.overlay.nodes.length, 160);
  assert.equal(report.overlay.totalNodes, 170);
  assert.equal(report.overlay.truncated, true);
  assert.equal(report.coverage.status, 'complete');
  assert.match(report.limitations.join(' '), /bounded to 160 nodes/);
});

test('Change Stack marks partial semantic coverage without inventing symbol moves', () => {
  const before = snapshot('base', [{ path: 'src/a.ts', hash: 'a', exports: ['a'] }]);
  const after = snapshot('head', [{ path: 'src/a.ts', hash: 'b', exports: ['b'] }]);
  const unavailable = semantic([], [], false);
  const report = build(before, after, [patch('src/a.ts', 'src/a.ts')], { semantic: { before: unavailable, after: unavailable } });

  assert.equal(report.semantic.status, 'unavailable');
  assert.equal(report.symbolChanges.length, 0);
  assert.equal(report.coverage.status, 'partial');
  assert.match(report.semantic.reasons.join(' '), /engine unavailable/);
});

test('Change Stack captures a real renamed range and ignores the dirty working tree', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-change-stack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Change fixture'); git('config', 'user.email', 'fixture@example.test');
  await mkdir(path.join(root, 'src'));
  const stable = Array.from({ length: 8 }, (_, index) => `const value${index} = ${index};`).join('\n') + '\n';
  await writeFile(path.join(root, 'src/store.ts'), stable + 'export function loadUser() { return value0; }\n');
  await writeFile(path.join(root, 'src/ui.ts'), "import { loadUser } from './store.js';\nconsole.log(loadUser());\n");
  git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  git('mv', 'src/store.ts', 'src/account.ts');
  await writeFile(path.join(root, 'src/account.ts'), stable + 'export function loadAccount() { return value0; }\n');
  await writeFile(path.join(root, 'src/ui.ts'), "import { loadAccount } from './account.js';\nconsole.log(loadAccount());\n");
  git('add', '.'); git('commit', '-qm', 'rename and change contract');
  const head = git('rev-parse', 'HEAD');
  await writeFile(path.join(root, 'src/ui.ts'), "import { loadAccount } from './account.js';\nconsole.log('dirty');\n");

  const report = await changeStack(root, { base, head });
  const moved = report.files.find(file => file.newPath === 'src/account.ts');
  assert.equal(report.base, base);
  assert.equal(report.head, head);
  assert.ok(moved, 'the renamed file is in the stack');
  assert.equal(moved.movement, 'renamed');
  assert.deepEqual(moved.exportsRemoved, ['loadUser']);
  assert.deepEqual(moved.exportsAdded, ['loadAccount']);
  assert.equal(moved.groupId, 'contracts');
  assert.equal(report.review.comparison.base, base);
  assert.equal(report.review.comparison.head, head);
  assert.ok(report.review.comparison.files.some(file => file.newPath === 'src/account.ts'));
  assert.equal(report.overlay.nodes.find(node => node.afterPath === 'src/account.ts').beforePath, 'src/store.ts');
  assert.ok(!JSON.stringify(report.review).includes("console.log('dirty')"), 'working-tree edits are not part of the range');
  assert.equal(report.semantic.status, 'not-requested');
  assert.match(report.limitations.join(' '), /exact Git snapshots/);
});

test('intelligence API dispatches Change Stack with its captured Review evidence', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-change-stack-api-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Change API fixture'); git('config', 'user.email', 'fixture@example.test');
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src/api.ts'), 'export const version = 1;\n');
  git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  await writeFile(path.join(root, 'src/api.ts'), 'export const version = 2;\neval("2");\n');
  git('add', '.'); git('commit', '-qm', 'head');
  const head = git('rev-parse', 'HEAD');
  const scanId = openSession({ root });
  const call = (body) => new Promise(resolve => {
    const res = new EventEmitter();
    res.writableEnded = false;
    res.writeHead = status => { res.status = status; };
    res.end = raw => { res.writableEnded = true; resolve({ status: res.status, body: JSON.parse(raw) }); };
    void handleIntelligence(res, { scanId, action: 'change-stack', ...body });
  });

  const result = await call({ base, head });
  assert.equal(result.status, 200);
  assert.equal(result.body.base, base);
  assert.equal(result.body.head, head);
  assert.equal(result.body.review.evidence.source, 'git-diff');
  assert.equal(result.body.review.comparison.head, head);
  assert.ok(result.body.files.some(file => file.newPath === 'src/api.ts'));

  const withoutSource = await callTool('onboarder_intelligence', { path: root, action: 'change-stack', base, head });
  assert.equal(withoutSource.mcp.sourceIncluded, false);
  assert.equal(withoutSource.review.comparison, undefined);
  assert.ok(withoutSource.review.findings.length, 'the fixture produces a static finding');
  assert.equal('excerpt' in withoutSource.review.findings[0], false);
  assert.equal(withoutSource.mcp.totals.files, withoutSource.files.length);

  const withSource = await callTool('onboarder_intelligence', { path: root, action: 'change-stack', base, head, includeSource: true });
  assert.equal(withSource.mcp.sourceIncluded, true);
  assert.ok(withSource.review.comparison.files[0].hunks.length);
  assert.equal(typeof withSource.review.findings[0].excerpt, 'string');

  const invalid = await call({ base, head, semantic: 'yes' });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /Semantic analysis is on or off/);
});
