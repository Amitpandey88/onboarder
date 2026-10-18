import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { getGitDiff, GitDiffError } from './gitDiff.js';
import { isInside } from './paths.js';
import { buildReview, DEFAULT_REVIEW_CONFIG, parseReviewConfig, reviewProfile } from '../shared/review/review.js';
import type { DiffOptions } from './gitDiff.js';
import type { ReviewProfile } from '../shared/review/contracts.js';
import { redact } from '../cli/agent/process.js';
import { safeRelative } from '../cli/agent/files.js';
import { evidenceText } from './intelligence/workspace.js';

export async function runReview(root: string, options: DiffOptions & { profile?: ReviewProfile } = {}) {
  const configPath = path.join(root, '.onboarder-review.json');
  let config = DEFAULT_REVIEW_CONFIG;
  try {
    const st = await lstat(configPath);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 65536 || !isInside(await realpath(root), await realpath(configPath))) throw new GitDiffError('Review configuration must be a regular JSON file inside the repository, under 64 KB.', 400);
    const text = await readFile(configPath, 'utf8');
    if (Buffer.byteLength(text) > 65536) throw new GitDiffError('Review configuration exceeds 64 KB.', 400);
    try { config = parseReviewConfig(JSON.parse(text)); }
    catch (error) { throw new GitDiffError(`Invalid .onboarder-review.json: ${error instanceof Error ? error.message : 'Invalid JSON'}`, 400); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (options.profile) config = { ...config, profile: reviewProfile(options.profile) };
  const diff = await getGitDiff(root, { ...options, includeUntracked: true });
  const report = buildReview(diff, config);
  report.fingerprint = createHash('sha256').update(diff.raw).update(JSON.stringify({ config, base: diff.base, head: diff.head, mode: diff.mode })).digest('hex');
  // Keep the compared patch with its report. Later clicks never substitute
  // working-tree contents for staged or committed evidence.
  report.comparison = { base: report.base, head: report.head, mode: report.mode,
    files: diff.files.map(file => {
      try { safeRelative(file.newPath || file.oldPath); }
      catch { return { ...file, hunks: [], skipReason: 'Credential or out-of-scope path. Patch source withheld.' }; }
      if (report.files.find(f => f.path === (file.newPath || file.oldPath))?.skipped) return { ...file, hunks: [] };
      let privateBlock = false;
      return { ...file, hunks: file.hunks.map(hunk => ({
        ...hunk, lines: hunk.lines.map(line => {
          if (/-----BEGIN .*PRIVATE KEY-----/.test(line.text)) privateBlock = true;
          const text = privateBlock ? '[credential content redacted]' : evidenceText(redact(line.text));
          if (/-----END .*PRIVATE KEY-----/.test(line.text)) privateBlock = false;
          return { ...line, text };
        }),
      })) };
    }) };
  return report;
}
