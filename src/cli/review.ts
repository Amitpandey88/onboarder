import { readSettings } from '../server/config.js';
import { runReview } from '../server/review.js';
import { applyAIReview } from '../server/reviewAI.js';
import type { ReviewProvider } from '../server/reviewAI.js';
import { reviewLimits } from '../server/reviewContext.js';
import { reviewMarkdown, reviewProfile, SEVERITY_RANK } from '../shared/review/review.js';
import { reviewSarif } from '../shared/review/sarif.js';
import { expandHome } from '../server/paths.js';

export async function configuredReviewProvider(flags: Record<string, any>, env: NodeJS.ProcessEnv = process.env): Promise<ReviewProvider | undefined> {
  if (flags.aiConnection === 'hermes') return { connection: 'hermes' };
  if (flags.aiConnection && flags.aiConnection !== 'api') throw new Error('Choose --ai-connection api or hermes.');
  const settings = await readSettings(flags.config);
  const baseUrl = flags.baseUrl || env.ONBOARDER_AI_BASE_URL || env.OPENAI_BASE_URL || (settings.account.provider === 'none' ? '' : settings.account.baseUrl);
  const model = flags.model || env.ONBOARDER_AI_MODEL || env.OPENAI_MODEL || (settings.account.provider === 'none' ? '' : settings.account.model);
  return baseUrl && model ? { connection: 'api', baseUrl, model, apiKey: env.ONBOARDER_AI_API_KEY || env.OPENAI_API_KEY || '' } : undefined;
}

export async function reviewCommand(folder: string, flags: Record<string, any>, env: NodeJS.ProcessEnv = process.env) {
  if (flags.staged && flags.head) throw new Error('Choose either --staged or --head.');
  if (flags.failOn && !Object.hasOwn(SEVERITY_RANK, flags.failOn)) throw new Error('Choose a valid --fail-on severity: critical, high, medium, low, or info.');
  const root = expandHome(folder);
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const options = { base: flags.base || 'HEAD', head: flags.head || '', mode: flags.staged ? 'staged' as const : flags.head ? 'range' as const : 'working' as const,
      profile: flags.profile ? reviewProfile(flags.profile) : undefined, signal: abort.signal };
    const report = await runReview(root, options);
    if (flags.ai === true) {
      const input = {};
      for (const [flag, key] of Object.entries({ aiMaxContextBytes: 'maxContextBytes', aiMaxExcerpts: 'maxExcerpts', aiMaxChangedFiles: 'maxChangedFiles',
        aiMaxTokens: 'maxOutputTokens', aiTimeoutMs: 'timeoutMs', aiMaxRequestsPerMinute: 'maxRequestsPerMinute' })) if (flags[flag] !== undefined) input[key] = Number(flags[flag]);
      const limits = reviewLimits(input);
      const provider = await configuredReviewProvider(flags, env);
      await applyAIReview(root, report, { ...options, provider, limits, onProgress: phase => { if (!flags.json && !flags.sarif && process.stderr.isTTY) process.stderr.write(phase + '…\n'); } });
    }
    console.log(flags.sarif ? JSON.stringify(reviewSarif(report), null, 2) : flags.json ? JSON.stringify(report, null, 2) : reviewMarkdown(report));
    if (report.ai && !['completed', 'skipped'].includes(report.ai.status)) return 2;
    return flags.failOn && report.findings.some(f => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[flags.failOn]) || report.checks.some(c => c.id === 'conflicts' && c.status === 'fail') ? 1 : 0;
  } finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}
