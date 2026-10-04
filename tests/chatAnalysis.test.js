import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChatAnalysis, analysisSelection } from '../cli/chat/analysis.js';
import { ChatController } from '../cli/chat/controller.js';
import { ChatStore } from '../cli/chat/store.js';
import { completeChat } from '../cli/chat/commands.js';
import { runExternalAnalysis } from '../server/tools/scan.js';
import { clearDetectionCache, runTool } from '../server/tools.js';

const sample = () => ({ ms: 20, ranCount: 1, totalTools: 2, source: 'external', unavailable: [{ id: 'gitleaks', label: 'Gitleaks', reason: 'Not installed' }],
  passes: [{ id: 'semgrep', label: 'Semgrep', ok: true, available: true, findings: [{ path: 'app.ts', line: 5, severity: 'high', rule: 'eval', message: 'Untrusted input reaches eval', tool: 'semgrep' }] },
    { id: 'gitleaks', label: 'Gitleaks', ok: false, available: false, reason: 'Not installed', findings: [] }],
  findings: [{ path: 'app.ts', line: 5, severity: 'high', rule: 'eval', message: 'Untrusted input reaches eval', tool: 'semgrep' }],
});
async function fixture(t, ports = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-analysis-chat-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = await fs.realpath(temp), home = path.join(root, 'private'), progress = [], calls = [];
  const run = async (folder, options) => {
    calls.push({ folder, options });
    options.onProgress({ phase: 'start', label: 'Semgrep' });
    const report = sample(); options.onProgress({ phase: 'complete', label: 'Semgrep', pass: report.passes[0] });
    return report;
  };
  const analysis = new ChatAnalysis({ home, progress: text => progress.push(text), run, ...ports });
  const signal = new AbortController().signal;
  return { root, home, calls, progress, analysis, signal };
}

test('chat analyzer selection accepts only registry engines and typed web UI settings', () => {
  assert.deepEqual(analysisSelection(['security']), { kinds: ['security'] });
  assert.deepEqual(analysisSelection(['all']), {});
  assert.deepEqual(analysisSelection(['semgrep,gitleaks']), { tools: ['semgrep', 'gitleaks'] });
  assert.deepEqual(analysisSelection(['gitleaks', 'redact=false', 'history=true']).options, { gitleaks: { redact: false, history: true } });
  assert.equal(analysisSelection(['vulture', 'minConfidence=90']).options.vulture.minConfidence, 90);
  assert.deepEqual(analysisSelection(['knip', 'include=files,exports']).options.knip.include, ['files', 'exports']);
  for (const args of [['fake'], ['all', 'semgrep'], ['security', 'history=true'], ['gitleaks', 'history=no'], ['vulture', 'minConfidence=101'], ['semgrep', 'config=/tmp/evil'], ['semgrep', 'path=/elsewhere'], ['knip', 'include=fake'], ['depcheck', 'skipMissing=true', 'skipMissing=false']]) assert.throws(() => analysisSelection(args));
  assert.deepEqual(completeChat('/deep se')[0], ['security', 'semgrep']);
  assert.deepEqual(completeChat('/deep options gi')[0], ['gitleaks']);
  assert.deepEqual(completeChat('/deep results hi')[0], ['high']);
});

test('picker, selected engines, progress, coverage and settings use the shared analyzer contract', async t => {
  let offered;
  const f = await fixture(t, { choose: async choices => { offered = choices; return 'semgrep'; }, status: () => ({ semgrep: { available: true, how: 'path' } }) });
  await assert.rejects(f.analysis.execute('deep', ['all'], f.root, f.signal, false), /permissions checks/);
  assert.equal(f.calls.length, 0);
  const response = await f.analysis.execute('deep', [], f.root, f.signal, true);
  assert.ok(offered.some(c => c.value === 'security')); assert.ok(offered.some(c => c.value === 'vulture'));
  assert.equal(f.calls[0].folder, f.root); assert.deepEqual(f.calls[0].options.tools, ['semgrep']);
  assert.equal(f.calls[0].options.signal, f.signal);
  assert.match(f.progress.join('\n'), /Semgrep: starting/); assert.match(f.progress.join('\n'), /Semgrep: 1 findings/);
  assert.match(response.text, /Gitleaks.*unavailable/); assert.match(response.text, /app.ts:5/); assert.match(response.text, /Untrusted input/);
  await f.analysis.execute('deep', ['semgrep', 'severity=ERROR'], f.root, f.signal, true);
  assert.equal(f.calls[1].options.options.semgrep.severity, 'ERROR');
  assert.match((await f.analysis.execute('deep', ['options', 'gitleaks'], f.root, f.signal, false)).text, /history=false/);
});

test('reports survive reopening, remain workspace-specific, filter and export privately, and redact known credentials', async t => {
  const f = await fixture(t, { env: { ONBOARDER_AI_API_KEY: 'fixture-report-secret' }, run: async () => {
    const report = sample(); report.findings[0].message = 'fixture-report-secret'; return report;
  } });
  await f.analysis.execute('deep', ['semgrep'], f.root, f.signal, true);
  const reopened = new ChatAnalysis({ home: f.home });
  const report = await reopened.execute('deep', ['results', 'high'], f.root, f.signal, false);
  assert.match(report.text, /Snapshot/); assert.ok(!report.text.includes('fixture-report-secret')); assert.match(report.text, /redacted/);
  assert.match((await reopened.execute('deep', ['results', 'low'], f.root, f.signal, false)).text, /0 findings/);
  await assert.rejects(reopened.execute('deep', ['results'], f.home, f.signal, false), /No deep-analysis report/);
  const exported = await reopened.execute('deep', ['export'], f.root, f.signal, false);
  const file = exported.text.slice('Deep-analysis report exported: '.length), saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.root, f.root); assert.equal(saved.report.findings.length, 1);
  if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});

test('report explanations carry bounded findings and missing-engine evidence into Hermes without dumping raw evidence in the composer', async t => {
  const f = await fixture(t, { run: async () => {
    const report = sample(); report.findings = Array.from({ length: 1000 }, (_, line) => ({ path: 'app.ts', line, message: 'x'.repeat(200), severity: 'high' })); return report;
  } });
  await f.analysis.execute('deep', ['security'], f.root, f.signal, true);
  const explained = await f.analysis.execute('deep', ['explain', 'Which', 'fix', 'first?'], f.root, f.signal, false);
  assert.ok(explained.explain.length < 16000); assert.match(explained.explain, /gitleaks/); assert.match(explained.explain, /Not installed/); assert.match(explained.explain, /untrusted evidence/);
  const events = [], requests = [];
  const controller = new ChatController({ root: f.root, mode: 'ask', checks: false, github: false, timeout: 30, maxTurns: 4 }, {
    output: event => events.push(event), store: new ChatStore(f.home), analysis: (...args) => f.analysis.execute(...args),
    run: async request => { requests.push(request); return { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'completed', mode: 'ask', answer: 'Prioritize the verified high finding.', sessionId: null, workspace: f.root, branch: null, repository: null, auditFile: '', completedAt: new Date().toISOString() }; },
  });
  await controller.accept('/deep explain Which fix first?');
  assert.match(requests[0].task, /Coverage:/); assert.equal(events.find(e => e.type === 'start').prompt, 'Explain deep analysis: Which fix first?');
  assert.equal(controller.record.turns[0].prompt, 'Explain deep analysis: Which fix first?');
});

test('cancelled deep analysis preserves the previous snapshot and releases chat for another command', async t => {
  const f = await fixture(t); await f.analysis.execute('deep', ['all'], f.root, f.signal, true);
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const slow = new ChatAnalysis({ home: f.home, run: async (_root, options) => {
    started(); await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true })); options.signal.throwIfAborted();
  } });
  const events = [];
  const c = new ChatController({ root: f.root, mode: 'ask', checks: true, github: false, timeout: 30, maxTurns: 4 }, {
    output: e => events.push(e), store: new ChatStore(f.home), analysis: (...args) => slow.execute(...args),
  });
  const task = c.accept('/deep all'); await ready; await c.accept('/cancel'); await task;
  assert.equal(c.busy, false); assert.ok(events.some(e => e.text === 'Task cancelled.'));
  assert.match((await f.analysis.execute('deep', ['results'], f.root, f.signal, false)).text, /app.ts:5/);
});

test('shared analyzer cancellation stops a running process and avoids starting pre-aborted tools', async () => {
  const abort = new AbortController(); abort.abort();
  assert.equal((await runTool([process.execPath, '-e', 'throw new Error("must not start")'], { signal: abort.signal })).cancelled, true);
  const active = new AbortController();
  const promise = runTool([process.execPath, '-e', 'setInterval(()=>{},1000)'], { signal: active.signal });
  setTimeout(() => active.abort(), 100);
  const result = await promise; assert.equal(result.ok, false); assert.equal(result.cancelled, true);
  await assert.rejects(runExternalAnalysis('.', { tools: ['gitleaks'], signal: abort.signal }), /abort/i);
});
test('analyzer cancellation also kills spawned descendant processes', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), started = path.join(f.root, 'started'), escaped = path.join(f.root, 'escaped');
  const childScript = `const fs=require('fs');fs.writeFileSync(${JSON.stringify(started)},String(process.pid));setTimeout(()=>fs.writeFileSync(${JSON.stringify(escaped)},'escaped'),500);setInterval(()=>{},1000);`;
  const parentScript = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'});setInterval(()=>{},1000);`;
  const abort = new AbortController();
  const running = runTool([process.execPath, '-e', parentScript], { signal: abort.signal });
  t.after(async () => { abort.abort(); const pid = Number(await fs.readFile(started, 'utf8').catch(() => '')); if(pid) { try { process.kill(pid, 'SIGKILL'); } catch {} } });
  for (let i = 0; i < 100 && !await fs.access(started).then(() => true).catch(() => false); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(await fs.access(started).then(() => true).catch(() => false), 'Descendant started');
  abort.abort(); assert.equal((await running).cancelled, true);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await fs.access(escaped).then(() => true).catch(() => false), false, 'Descendant cannot continue after cancellation');
});

test('shared orchestration reports real analyzer options, progress, failure and cancellation using a fixture binary', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), bin = path.join(f.root, 'bin'); await fs.mkdir(bin);
  const executable = path.join(bin, 'gitleaks');
  await fs.writeFile(executable, `#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);fs.writeFileSync(${JSON.stringify(path.join(f.root,'argv.json'))},JSON.stringify(args));fs.writeFileSync(args[args.indexOf('--report-path')+1],JSON.stringify([{RuleID:'fixture-secret',Description:'secret found',File:'app.ts',StartLine:3,Secret:'never-relay-this'}]));`, { mode: 0o700 });
  const before = process.env.PATH; process.env.PATH = bin; clearDetectionCache();
  t.after(() => { process.env.PATH = before; clearDetectionCache(); });
  const progress = [];
  const report = await runExternalAnalysis(f.root, { tools: ['gitleaks'], options: { gitleaks: { history: true } }, onProgress: e => progress.push(e) });
  assert.equal(report.ranCount, 1); assert.equal(report.findings[0].severity, 'critical'); assert.ok(!JSON.stringify(report).includes('never-relay-this'));
  const args = JSON.parse(await fs.readFile(path.join(f.root, 'argv.json'), 'utf8')); assert.ok(!args.includes('--no-git')); assert.ok(args.includes('--redact'));
  assert.deepEqual(progress.map(e => e.phase), ['start', 'complete']);
  await fs.writeFile(executable, `#!${process.execPath}\nprocess.stderr.write('fixture failure');process.exit(2);`, { mode: 0o700 });
  const failed = await runExternalAnalysis(f.root, { tools: ['gitleaks'] });
  assert.equal(failed.ranCount, 0); assert.equal(failed.passes[0].available, true); assert.match(failed.passes[0].reason, /fixture failure/);
  await fs.writeFile(executable, `#!${process.execPath}\nsetInterval(()=>{},1000);`, { mode: 0o700 });
  const controller = new AbortController(); setTimeout(() => controller.abort(), 100);
  await assert.rejects(runExternalAnalysis(f.root, { tools: ['gitleaks'], signal: controller.signal }), /abort/i);
});
