// Default: canned model outputs exercise retrieval/validation, not model quality.
// --live is an explicit request to transmit these synthetic fixtures to the configured model.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { runReview } from '../server/review.js';
import { applyAIReview } from '../server/reviewAI.js';
import { readSettings } from '../server/config.js';
import { fixture, contextFrom, authFinding, response } from '../tests/helpers/contextualReview.mjs';
const live = process.argv.includes('--live');
const cases = JSON.parse(await readFile(new URL('../tests/fixtures/contextual-review/cases.json', import.meta.url), 'utf8'));
const rows = [];
let provider;
if (live) {
  const settings = await readSettings();
  const baseUrl = process.env.ONBOARDER_AI_BASE_URL || process.env.OPENAI_BASE_URL || settings.account.baseUrl;
  const model = process.env.ONBOARDER_AI_MODEL || process.env.OPENAI_MODEL || settings.account.model;
  if (!baseUrl || !model) throw new Error('Live benchmark requires a configured endpoint/model. No source was sent.');
  provider = { baseUrl, model, apiKey: process.env.ONBOARDER_AI_API_KEY || process.env.OPENAI_API_KEY || '' };
}
for (const spec of cases) {
  const cleanup = []; const t = { after: fn => cleanup.push(fn) };
  try {
    const { root } = await fixture(t, spec); const start = performance.now();
    const report = await runReview(root);
    await applyAIReview(root, report, { provider,
      ...(!live ? { complete: async messages => { const context = contextFrom(messages); return response(spec.buggy ? [authFinding(context)] : []); } } : {}) });
    const findings = report.findings.filter(f => f.source === 'ai');
    rows.push({ id: spec.id, buggy: spec.buggy, status: report.ai.status, expectedDetected: Boolean(spec.expectedRule && findings.some(f => f.rule === spec.expectedRule)),
      findings: findings.length, rejected: report.ai.rejected, contextBytes: report.ai.usage.contextBytes, latencyMs: Number((performance.now() - start).toFixed(2)),
      requests: report.ai.usage.requests, inputTokens: report.ai.usage.inputTokens ?? null, outputTokens: report.ai.usage.outputTokens ?? null,
      retrievedFiles: [...new Set(report.ai.context?.evidence.map(e => e.path) || [])] });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
}
const bugs = rows.filter(r => r.buggy), clean = rows.filter(r => !r.buggy);
const result = { schemaVersion: 1, mode: live ? 'live-provider' : 'mock-pipeline', node: process.version,
  disclaimer: live ? 'Synthetic fixture evaluation of the selected model; four cases do not establish production accuracy.' :
    'Canned model responses test context retrieval, evidence validation and reporting. Detection/false-positive counts are harness outcomes, not measured model intelligence. No live provider or token usage was exercised.',
  detection: { detected: bugs.filter(r => r.expectedDetected).length, knownBugCases: bugs.length },
  falsePositives: { findingsOnCleanCases: clean.reduce((n, r) => n + r.findings, 0), cleanCases: clean.length },
  cases: rows };
const json = JSON.stringify(result, null, 2);
const output = process.argv.indexOf('--output'); if (output >= 0 && process.argv[output + 1]) await writeFile(process.argv[output + 1], json + '\n');
console.log(json);
if (rows.some(r => ['failed', 'stale', 'not-configured'].includes(r.status))) process.exitCode = 1;
