import { createHash } from 'node:crypto';
import { safeRelative } from '../cli/agent/files.js';
import { evidenceText } from './intelligence/workspace.js';
import type { GitDiff, ReviewConfig, ReviewConfiguration, ReviewReport } from '../shared/review/contracts.js';

/** Same fingerprint inputs and retained, redacted patch policy for local and GitHub reviews. */
export function retainReviewEvidence(report: ReviewReport, diff: GitDiff, config: ReviewConfig, configuration: ReviewConfiguration) {
  report.configuration = configuration;
  report.fingerprint = createHash('sha256').update(diff.raw).update(JSON.stringify({ config, base: diff.base, head: diff.head, mode: diff.mode })).digest('hex');
  for (const file of report.files) file.instructions = file.instructions.map(evidenceText);
  for (const finding of report.findings) finding.excerpt = evidenceText(finding.excerpt);
  report.comparison = { base: report.base, head: report.head, mode: report.mode,
    files: diff.files.map(file => {
      try { safeRelative(file.newPath || file.oldPath); }
      catch { return { ...file, hunks: [], skipReason: 'Credential or out-of-scope path. Patch source withheld.' }; }
      if (report.files.find(f => f.path === (file.newPath || file.oldPath))?.skipped) return { ...file, hunks: [] };
      let privateBlock = false;
      return { ...file, hunks: file.hunks.map(hunk => ({ ...hunk, lines: hunk.lines.map(line => {
        if (/-----BEGIN .*PRIVATE KEY-----/.test(line.text)) privateBlock = true;
        const text = privateBlock ? '[credential content redacted]' : evidenceText(line.text);
        if (/-----END .*PRIVATE KEY-----/.test(line.text)) privateBlock = false;
        return { ...line, text };
      }) })) };
    }) };
  return report;
}
