// Offline, synthetic fixtures only. Model responses are mocked; no GitHub writes.
// Build first. Usage: node scripts/audit-readiness.mjs performance|quality|e2e [output.json]
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const here = fileURLToPath(import.meta.url), project = path.dirname(path.dirname(here));
const git = (root, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z', GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z' } }).trim();
const round = n => Number(n.toFixed(3));
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture(parent, count) {
  const root = path.join(parent, 'repo-' + count); await mkdir(root); await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  for (let i = 0; i < count; i++) await writeFile(path.join(root, 'src', `f${i}.ts`),
    (i ? `import {f${i-1}} from './f${i-1}';\n` : '') + `export function f${i}(value: number): number { return ${i ? `f${i-1}(value)` : 'value'}; }\n`);
  git(root, 'init', '-q', '-b', 'main'); git(root, 'add', '.'); git(root, '-c', 'user.name=Readiness fixture', '-c', 'user.email=audit@example.invalid', 'commit', '-qm', 'baseline');
  await writeFile(path.join(root, 'src/f0.ts'), 'export async function f0(value: number): Promise<number> { return value; }\n');
  return root;
}
async function worker(scenario, root) {
  const start = performance.now(); let detail;
  if (scenario === 'server-startup') {
    const { createServer } = await import('../server/index.js');
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try { const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`); assert.equal(res.status, 200); detail = { health: res.status }; }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  } else if (scenario === 'graph-10000') {
    const { GraphIndex } = await import('../public/js/graphScene.js');
    const nodes = Array.from({ length: 10000 }, (_, i) => ({ path: `src/f${i}.ts`, fanIn: 6, fanOut: 6 }));
    const edges = nodes.flatMap((n, i) => Array.from({ length: 6 }, (_, j) => ({ from: n.path, to: nodes[(i+j+1)%nodes.length].path })));
    const index = new GraphIndex(nodes, edges); const views = ['', 'f9999', 'src/f1'].map(q => index.select(q));
    assert.ok(views.every(v => v.nodes.length <= 700 && v.edges.length <= 1800));
    detail = { inputNodes: nodes.length, inputEdges: edges.length, views: views.map(v => ({ nodes: v.nodes.length, edges: v.edges.length, matches: v.matches, limited: v.limited })), rendering: 'Projection only; browser layout/rendering excluded.' };
  } else if (scenario.startsWith('scan-')) {
    const { scanRepo } = await import('../shared/analyzer/scan.js'); const { nodeFileSource } = await import('../server/fileSourceNode.js');
    const report = await scanRepo(nodeFileSource(root)); detail = { files: report.files.length, edges: report.edges.length, skips: report.stats.skips, truncated: report.stats.truncated, defaultMaxFiles: 4000 };
  } else if (scenario === 'semantic-100') {
    const { semanticAnalysis } = await import('../server/intelligence/semantic.js'); const texts = new Map();
    for (let i = 0; i < 100; i++) texts.set(`src/f${i}.ts`, await readFile(path.join(root, `src/f${i}.ts`), 'utf8'));
    const result = await semanticAnalysis(root, texts); assert.equal(result.available, true, result.reason);
    detail = { available: result.available, definitions: result.definitions.length, references: result.references.length, compiler: '5.9.3' };
  } else if (scenario === 'review-context-1000') {
    const { runReview } = await import('../server/review.js'); const { collectReviewContext, reviewLimits } = await import('../server/reviewContext.js');
    const reviewStart = performance.now(); const report = await runReview(root); const reviewMs = performance.now() - reviewStart;
    const contextStart = performance.now(); const { context, assertCurrent } = await collectReviewContext(root, report, reviewLimits()); await assertCurrent();
    detail = { reviewMs: round(reviewMs), retrievalMs: round(performance.now() - contextStart), findings: report.findings.length, contextBytes: Buffer.byteLength(JSON.stringify(context)), excerpts: context.evidence.length, coverage: context.coverage, modelRequests: 0 };
  } else if (scenario === 'repeated-analysis-1000') {
    const { analyzeRepository, clearAnalysisCache } = await import('../server/mcp/analysis.js'); clearAnalysisCache(); global.gc?.();
    const before = process.memoryUsage(); const times = [];
    for (let i = 0; i < 10; i++) { const at = performance.now(); const report = await analyzeRepository(root); times.push(round(performance.now()-at)); assert.equal(report.scan.files.length, 1000); }
    global.gc?.(); detail = { coldMs: times[0], warmMs: times.slice(1), retainedHeapMiB: round((process.memoryUsage().heapUsed-before.heapUsed)/1048576), note: 'Ten cached operations, not a sustained memory-leak or filesystem-change invalidation test.' };
  } else throw new Error('Unknown scenario');
  return { scenario, durationMs: round(performance.now()-start), maxRssMiB: round(process.resourceUsage().maxRSS/1024), detail };
}
function subprocess(args, env) {
  return new Promise((resolve, reject) => {
    const at = performance.now(); const child = spawn(process.execPath, args, { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 120000);
    child.stdout.on('data', data => { out += data; }); child.stderr.on('data', data => { err += data; });
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); if (code) reject(new Error(`Worker exited ${code}: ${err.slice(-1500)}`)); else resolve({ wallMs: round(performance.now()-at), out }); });
  });
}
async function performanceAudit(parent) {
  const roots = new Map(); for (const count of [100, 1000, 5000]) roots.set(count, await fixture(parent, count));
  const env = { ...process.env, ONBOARDER_INTELLIGENCE_HOME: path.join(parent, 'intelligence') }; const rows = [];
  for (const scenario of ['cli-startup', 'server-startup', 'scan-100', 'scan-1000', 'scan-5000', 'graph-10000', 'semantic-100', 'review-context-1000', 'repeated-analysis-1000']) {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const root = roots.get(Number(scenario.split('-').at(-1))) || roots.get(1000);
      const result = await subprocess(scenario === 'cli-startup' ? ['bin/onboarder.js', '--version'] : ['--expose-gc', here, '--worker', scenario, root], env);
      samples.push(scenario === 'cli-startup' ? { wallMs: result.wallMs, version: result.out.trim() } : { wallMs: result.wallMs, ...JSON.parse(result.out.trim().split('\n').at(-1)) });
    }
    const sorted = samples.map(s=>s.wallMs).sort((a,b)=>a-b);
    rows.push({ scenario, medianWallMs: sorted[1], rangeWallMs: [sorted[0], sorted[2]], samples });
    console.error(`Measured ${scenario}: ${sorted[1]} ms median`);
  }
  return { method: 'Three sequential fresh processes per scenario; fixture generation excluded, module imports included. OS filesystem cache may be warm. RSS is process high-water mark, not incremental heap. No model or provider network.', host: { platform: process.platform, arch: process.arch, cpus: os.cpus().length, memoryGiB: round(os.totalmem()/1073741824) }, rows };
}
async function qualityAudit(parent) {
  const { runReview } = await import('../server/review.js'); const { changedLines } = await import('../server/reviewContext.js');
  const cases = JSON.parse(await readFile(new URL('../tests/fixtures/readiness/cases.json', import.meta.url), 'utf8')); const rows = [];
  for (const spec of cases) {
    const root = path.join(parent, spec.id); await mkdir(root); await writeFile(path.join(root, 'change.js'), spec.before+'\n');
    if (spec.related) await writeFile(path.join(root, 'caller.js'), spec.related+'\n');
    git(root, 'init', '-q', '-b', 'main'); git(root, 'add', '.'); git(root, '-c', 'user.name=Quality fixture', '-c', 'user.email=audit@example.invalid', 'commit', '-qm', 'before');
    await writeFile(path.join(root, 'change.js'), spec.after+'\n'); const at = performance.now(); const report = await runReview(root);
    const lines = spec.after.split('\n'); const added = changedLines(report, 'change.js');
    const evidenceAccurate = report.findings.every(f => f.path === 'change.js' && f.line >= 1 && f.line <= lines.length && added.includes(f.line));
    rows.push({ id: spec.id, knownBug: spec.bug, expectedRule: spec.expectedRule || null, expectedRuleMatched: spec.expectedRule ? report.findings.some(f=>f.rule===spec.expectedRule) : null, detected: report.findings.length > 0, rules: report.findings.map(f=>f.rule), evidenceAccurate, findings: report.findings.length, runtimeMs: round(performance.now()-at), fingerprint: report.fingerprint });
  }
  const bugs = rows.filter(r=>r.knownBug), clean = rows.filter(r=>!r.knownBug);
  return { mode: 'deterministic-review', corpusHash: sha(JSON.stringify(cases)), limitations: 'Sixteen explicitly labelled synthetic cases. Clean constant-eval and comment cases deliberately test lexical false positives. Detection means at least one finding on a known-bug case; this is not a representative population estimate or measured model quality.', detection: { cases: bugs.length, detected: bugs.filter(r=>r.detected).length, casesWithExpectedRule: bugs.filter(r=>r.expectedRule).length, matchedExpectedRule: bugs.filter(r=>r.expectedRuleMatched).length }, falsePositives: { cleanCases: clean.length, flaggedCases: clean.filter(r=>r.detected).length, findings: clean.reduce((n,r)=>n+r.findings,0) }, evidence: { findings: rows.reduce((n,r)=>n+r.findings,0), casesWithInvalidEvidence: rows.filter(r=>!r.evidenceAccurate).length }, modelRequests: 0, modelTokens: null, rows };
}
async function e2eAudit(parent) {
  const { fixFixture, bad, good } = await import('../tests/helpers/fixFixture.mjs');
  const { analyzeRepository, clearAnalysisCache } = await import('../server/mcp/analysis.js');
  const { applyFix, verifyFix, fixStatus, rollbackFix, acceptFix } = await import('../server/fixEngine.js');
  const { runAgent } = await import('../cli/agent/runner.js'); const cleanup = []; const rows = [];
  process.env.ONBOARDER_INTELLIGENCE_HOME = path.join(parent, 'intelligence');
  try {
    const f = await fixFixture({ after: fn=>cleanup.push(fn) }); const original = git(f.root, 'status', '--porcelain');
    clearAnalysisCache(); const analysis = await analyzeRepository(f.root); assert.equal(analysis.scan.files.length, 3);
    rows.push({ stage: 'open-and-analyze', status: 'passed', files: analysis.scan.files.length });
    rows.push({ stage: 'engineering-plan', status: 'missing', reason: 'No dedicated Phase 4C planner. Existing agent dry-run is a permission plan, not an engineering planner.' });
    rows.push({ stage: 'review', status: 'passed', finding: f.finding.rule, fingerprint: f.report.fingerprint });
    const p = await f.propose(); assert.equal(await readFile(path.join(f.root, 'codec.js'), 'utf8'), bad); assert.equal(git(f.root, 'status', '--porcelain'), original);
    rows.push({ stage: 'propose', status: 'passed', model: 'mocked replacement; real proposal validation, context and source checks', readOnly: true });
    await assert.rejects(applyFix(f.identity, p.id, ''), /approval/); const run = await applyFix(f.identity, p.id, p.digest); assert.equal(run.status, 'applied'); assert.notEqual(run.workspace, f.root);
    rows.push({ stage: 'approve-and-implement', status: 'passed', isolatedWorktree: true, checkpoint: Boolean(run.checkpointId) });
    const skipped = await verifyFix(f.identity, run.id); assert.equal(skipped.status, 'inconclusive');
    const result = await verifyFix(f.identity, run.id, { allowChecks: true, trustWorktree: true, checks: ['node-test:codec.test.js'], checkDigest: run.checkPlan.digest });
    assert.equal(result.status, 'verified-by-checks'); assert.equal(result.checks[0].status, 'failed'); assert.equal(result.checks.at(-1).status, 'passed');
    rows.push({ stage: 'execute-checks', status: 'passed', unapproved: skipped.status, receipts: result.checks.map(c=>({ phase:c.phase, status:c.status, sourceMatches: c.phase === 'result' ? c.sourceBefore===result.resultFingerprint && c.sourceAfter===result.resultFingerprint : null })) });
    assert.ok(result.comparison.noLongerDetected.some(x=>x.id===f.finding.id)); rows.push({ stage:'re-review', status:'passed', noLongerDetected: result.comparison.noLongerDetected.length, note:'No-longer-detected is not proof of correctness; real regression checks supply separate evidence.' });
    assert.equal((await fixStatus(f.identity, run.id)).id, run.id); rows.push({ stage:'saved-run-resumption', status:'passed' });
    const restored = await rollbackFix(f.identity, run.id); assert.equal(restored.status,'rolled-back'); assert.equal(await readFile(path.join(run.workspace,'codec.js'),'utf8'),bad);
    rows.push({ stage:'rollback', status:'passed', restored:restored.restoration.map(r=>r.status) });
    const q = await f.propose(), second = await applyFix(f.identity,q.id,q.digest);
    const checked = await verifyFix(f.identity,second.id,{allowChecks:true,trustWorktree:true,checks:['node-test:codec.test.js'],checkDigest:second.checkPlan.digest});
    assert.equal((await acceptFix(f.identity,second.id,checked.resultFingerprint)).status,'accepted');
    git(f.root,'remote','add','origin','https://github.com/fixture/readiness.git');
    const plan = await runAgent({mode:'pr',root:f.root,task:'Prepare a reviewable PR draft for this checked fix.',dryRun:true},{home:path.join(parent,'agent'),env:{PATH:process.env.PATH}});
    assert.equal(plan.permissions.github,false); await writeFile(path.join(parent,'local-pr-draft.md'), '# Synthetic fix\n\nReplace executable parsing with JSON parsing. Baseline regression failed; result passed.\n\n'+second.actualDiff);
    rows.push({ stage:'prepare-pr', status:'partial', localDraft:true, agentPermissionPlan:plan.dryRun, githubWrites:false, reason:'Local draft and PR permission plan verified; live Hermes PR drafting and external PR creation were not exercised.' });
    assert.equal(await readFile(path.join(f.root,'codec.js'),'utf8'),bad); assert.equal(await readFile(path.join(second.workspace,'codec.js'),'utf8'),good);
    rows.push({stage:'original-checkout-preserved',status:'passed'});
  } finally { for(const fn of cleanup.reverse()) await fn(); }
  return { model:'mocked; no live provider evaluation', checks:'Real Node.js tests executed against isolated baseline and result worktrees.', externalWrites:0, completeRequestedWorkflow:false, rows };
}
if (process.argv[2] === '--worker') {
  console.log(JSON.stringify(await worker(process.argv[3],process.argv[4])));
} else {
  const mode = process.argv[2]; if (!['performance','quality','e2e'].includes(mode)) throw new Error('Choose performance, quality or e2e.');
  const parent = await mkdtemp(path.join(os.tmpdir(),'onboarder-readiness-'));
  try {
    const result = { schemaVersion:1, auditedAt:new Date().toISOString(), node:process.version, mode, ...(await ({performance:performanceAudit,quality:qualityAudit,e2e:e2eAudit}[mode])(parent)) };
    const json = JSON.stringify(result,null,2)+'\n'; if(process.argv[3]) await writeFile(process.argv[3],json); console.log(json);
  } finally { await rm(parent,{recursive:true,force:true}); }
}
