import { runReview } from './review.js';
import { revisionPair } from './intelligence/workspace.js';
import { semanticAnalysis } from './intelligence/semantic.js';
import { buildChangeStack } from '../shared/changeStack/analysis.js';
import type { ChangeStackResult } from '../shared/changeStack/contracts.js';
import type { SemanticResult } from '../shared/intelligence/contracts.js';

export interface ChangeStackOptions { base: string; head: string; semantic?: boolean; signal?: AbortSignal }

/**
 * Compare two immutable Git revisions and attach the exact Review evidence.
 * The Review snapshot is the source of patch text, stats and skipped-file reasons,
 * so Change Stack never presents a second, differently-bounded diff.
 */
export async function changeStack(root: string, options: ChangeStackOptions): Promise<ChangeStackResult> {
  const review = await runReview(root, { mode: 'range', base: options.base, head: options.head, signal: options.signal });
  if (!review.comparison) throw new Error('Review did not capture a comparison for this range.');
  const pair = await revisionPair(root, review.comparison.base, review.comparison.head, { signal: options.signal });
  let semantic: { before: SemanticResult; after: SemanticResult } | undefined;
  if (options.semantic) {
    const before = await semanticAnalysis(root, pair.beforeTexts, options.signal);
    const after = before.available ? await semanticAnalysis(root, pair.afterTexts, options.signal) : before;
    semantic = { before, after };
    options.signal?.throwIfAborted();
  }
  const stack = buildChangeStack({ before: pair.before, after: pair.after, patches: review.comparison.files, ...(semantic ? { semantic } : {}) });
  if (review.coverage.status === 'partial') stack.coverage.status = 'partial';
  const coverageLimitations = [...new Set([...stack.coverage.limitations, ...review.coverage.limitations])];
  const limitations = [...new Set([...stack.limitations, 'Review findings are static pattern matches over captured patches; they do not establish that the change is safe.'])];
  stack.coverage.limitations = coverageLimitations;
  stack.limitations = limitations;
  return { ...stack, review };
}
