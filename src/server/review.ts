import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { getGitDiff, gitReviewConfig, GitDiffError } from './gitDiff.js';
import { isInside } from './paths.js';
import { buildReview, DEFAULT_REVIEW_CONFIG, parseReviewConfigText, reviewProfile } from '../shared/review/review.js';
import type { DiffOptions } from './gitDiff.js';
import type { ReviewConfiguration, ReviewProfile } from '../shared/review/contracts.js';
import { retainReviewEvidence } from './reviewEvidence.js';

export async function runReview(root: string, options: DiffOptions & { profile?: ReviewProfile } = {}) {
  const configPath = path.join(root, '.onboarder-review.json');
  const diff = await getGitDiff(root, { ...options, includeUntracked: true });
  let config = DEFAULT_REVIEW_CONFIG;
  let configuration: ReviewConfiguration = { source: diff.mode === 'range' ? 'commit' : diff.mode === 'staged' ? 'index' : 'working-tree', status: 'missing',
    ...(diff.head ? { revision: diff.head } : {}) };
  try {
    if (diff.mode !== 'working') {
      const value = await gitReviewConfig(root, diff.head || '', options.signal);
      if (value.text !== undefined) { config = parseReviewConfigText(value.text); configuration = { ...configuration, status: 'present', blob: value.blob }; }
    } else {
      const st = await lstat(configPath);
      if (!st.isFile() || st.isSymbolicLink() || st.size > 65536 || !isInside(await realpath(root), await realpath(configPath))) throw new GitDiffError('Review configuration must be a regular JSON file inside the repository, under 64 KB.', 400);
      const handle = await open(configPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        if (!(await handle.stat()).isFile()) throw new GitDiffError('Review configuration must be a regular JSON file.', 400);
        const buffer = Buffer.alloc(65537); let size = 0;
        while (size < buffer.length) { options.signal?.throwIfAborted(); const read = await handle.read(buffer, size, buffer.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
        if (size > 65536) throw new GitDiffError('Review configuration exceeds 64 KB.', 400);
        config = parseReviewConfigText(buffer.subarray(0, size).toString('utf8'));
        configuration.status = 'present';
      } finally { await handle.close(); }
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error instanceof GitDiffError ? error : new GitDiffError((error as Error).message, 400);
  }
  if (options.profile) { config = { ...config, profile: reviewProfile(options.profile) }; configuration.profileOverride = config.profile; }
  return retainReviewEvidence(buildReview(diff, config), diff, config, configuration);
}
