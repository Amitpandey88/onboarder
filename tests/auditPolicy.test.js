import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessAudit } from '../scripts/audit-policy.mjs';

const advisory = { url: 'https://github.com/advisories/GHSA-fixture', severity: 'low' };
const exception = { package: 'katex', version: '0.16.47', ...advisory, expires: '2026-11-09', reason: 'Reviewed mitigation.' };
const now = Date.parse('2026-10-10T00:00:00Z');
const report = { metadata: { vulnerabilities: { total: 2 } }, vulnerabilities: { katex: { via: [advisory] }, mermaid: { via: ['katex'] } } };
test('audit policy reports an explicitly reviewed leaf advisory once, preserving its parent dependency finding', () => {
  const result = assessAudit(report, [exception], { katex: '0.16.47' }, now);
  assert.equal(result.allowed.length, 1); assert.equal(result.blocked.length, 0);
});
test('expired exceptions and changed versions or severity fail the audit', () => {
  for (const [item, versions, date] of [
    [exception, { katex: '0.16.47' }, Date.parse('2026-11-10T00:00:00Z')],
    [exception, { katex: '0.16.48' }, now],
    [{ ...exception, severity: 'moderate' }, { katex: '0.16.47' }, now],
  ]) assert.equal(assessAudit(report, [item], versions, date).blocked.length, 1);
});
test('unreviewed advisories, including new low findings on parent packages, block releases', () => {
  const changed = structuredClone(report); changed.vulnerabilities.mermaid.via.push({ url: 'https://github.com/advisories/GHSA-new', severity: 'low' });
  assert.equal(assessAudit(changed, [exception], { katex: '0.16.47' }, now).blocked.length, 1);
  assert.equal(assessAudit(report, [], { katex: '0.16.47' }, now).blocked.length, 1);
});
test('audit service errors and incomplete vulnerability metadata cannot pass', () => {
  assert.throws(() => assessAudit({ error: { message: 'offline' } }), /Incomplete/);
  assert.throws(() => assessAudit({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {} }), /without usable/);
  assert.equal(assessAudit({ metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} }).blocked.length, 0);
});
