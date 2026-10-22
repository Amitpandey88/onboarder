import { GithubApiError, GithubClient, positiveId } from './agent/github.js';
import { GithubProvider, safeProviderError } from '../server/providers/github.js';
import { inspectTriage, listTriage, localGithubRepository } from '../server/triage.js';
import { explainTriage, triageMask, redactTriageValue } from '../server/triageAI.js';
import { filterTriage, prioritize } from '../shared/triage/priority.js';
import { configuredReviewProvider } from './review.js';
import { expandHome } from '../server/paths.js';
import type { TriageItem } from '../shared/triage/contracts.js';
import { reviewLimits } from '../server/reviewContext.js';

export const TRIAGE_HELP = `Onboarder PR triage — read-only GitHub queue
  onboarder triage list [folder|owner/repo] --json
  onboarder triage inspect [folder|owner/repo] --pr NUMBER --json
  --repo owner/repo         Explicit repository (folder enables local architecture)
  --state open|closed|all   List state (default open)
  --page 1 --limit 10       One page; limit 1–30, page 1–100
  --queue all|immediate|security|waiting-review|waiting-author|failing-checks|human-approval|stale
  --sort priority|updated|oldest|size --search "text"
  --ai                     Inspect: optional bounded model explanation, no score changes
  --urgency P0..P3 --urgency-head SHA --urgency-reason "reason"
                           Human minimum priority for this exact inspected head
GitHub: GITHUB_TOKEN or GH_TOKEN; public access works without a token.
AI: existing settings/environment or --ai-connection hermes; source excerpts are not submitted.
Metadata-only queue priorities are provisional. Inspect each PR to retrieve review/CI/ownership.
No code, tests, GitHub writes, commits or repository fetches are executed.`;
export async function triageCommand(action: string, target: string, flags: Record<string, any>) {
  if (flags.help || !action) { console.log(TRIAGE_HELP); return 0; }
  const abort = new AbortController(), cancel = () => abort.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(120000)]);
  try {
    if (!['list', 'inspect'].includes(action)) throw new Error('Use triage list or inspect.');
    const explicit = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target) && !target.startsWith('.') && !target.startsWith('/');
    const root = explicit ? undefined : expandHome(target || '.');
    const repository = flags.repo || (explicit ? target : await localGithubRepository(root!, signal));
    const client = new GithubClient(repository, { signal }), provider = new GithubProvider(client);
    if (flags.ai && action !== 'inspect') throw new Error('--ai requires triage inspect. Queue loading never invokes a model.');
    if (action === 'list') {
      const page = await listTriage(provider, { page: flags.page === undefined ? 1 : Number(flags.page), limit: flags.limit === undefined ? 10 : Number(flags.limit), state: flags.state || 'open', signal });
      const items = filterTriage(page.items, { view: flags.queue, sort: flags.sort, query: flags.search });
      const result = { ...page, items, visible: items.length };
      console.log(flags.json ? JSON.stringify(redactTriageValue(result), null, 2) : triageMask(`${repository} · page ${page.page} · ${items.length}/${page.coverage.returned} visible · ${page.hasNext ? 'more pages available' : 'last page'}\n` + items.map(i => `${i.priority}${i.provisional ? '?' : ''} #${i.pull.number} ${i.pull.title} · @${i.pull.author} · ${i.readiness}`).join('\n') + '\n' + page.coverage.limitations.join('\n')));
      return 0;
    }
    let humanUrgency: TriageItem['humanUrgency'];
    if (flags.urgency || flags.urgencyHead || flags.urgencyReason) {
      if (!/^P[0-3]$/.test(flags.urgency || '') || !/^[a-f0-9]{40}$/.test(flags.urgencyHead || '') || typeof flags.urgencyReason !== 'string' || !flags.urgencyReason.trim() || flags.urgencyReason.length > 1000) throw new Error('Supply --urgency P0..P3, --urgency-head SHA and --urgency-reason.');
      humanUrgency = { priority: flags.urgency, head: flags.urgencyHead, reason: flags.urgencyReason };
    }
    let item = await inspectTriage(provider, positiveId(flags.pr, 'PR'), { root, signal, humanUrgency });
    const limitInput = {};
    for (const [flag, key] of Object.entries({ aiMaxContextBytes: 'maxContextBytes', aiMaxTokens: 'maxOutputTokens', aiTimeoutMs: 'timeoutMs', aiMaxRequestsPerMinute: 'maxRequestsPerMinute' })) if (flags[flag] !== undefined) limitInput[key] = Number(flags[flag]);
    const explanation = flags.ai ? await explainTriage(provider, item, { signal, provider: await configuredReviewProvider(flags), limits: reviewLimits(limitInput) }) : undefined;
    if (explanation?.status === 'stale') item = prioritize({ ...item, freshness: 'stale' });
    console.log(flags.json ? JSON.stringify(redactTriageValue(explanation ? { item, explanation } : item), null, 2) : triageMask(
      `${repository} #${item.pull.number}: ${item.pull.title}\n${item.priority}${item.provisional ? ' (provisional)' : ''} · score ${item.score} · ${item.readiness} · CI ${item.checks.state}\nBase ${item.pull.base}\nHead ${item.pull.head}\n` +
      item.factors.map(f => `+${f.points} ${f.reason}`).join('\n') + '\n' + item.missingSignals.join('\n') + '\n' + item.limitations.join('\n') + (explanation ? '\nAI inference (' + explanation.status + '): ' + explanation.summary + '\n' + explanation.claims.map(c => c.text + ' [' + c.evidenceIds.join(', ') + ']').join('\n') : '')));
    return explanation && explanation.status !== 'completed' || item.freshness === 'stale' || !item.report ? 2 : 0;
  } catch (e) {
    const error = abort.signal.aborted ? 'Triage cancelled.' : signal.aborted ? 'Triage timed out.' : e instanceof Error && /^(Use |Choose |Supply |Human |--ai|PR must|Unknown triage|GitHub|Invalid|Triage)/.test(e.message) ? triageMask(e.message) : safeProviderError(e);
    if (flags.json) console.log(JSON.stringify({ error, ...(e instanceof GithubApiError ? { status: e.status, rateLimit: e.rateLimit } : {}) })); else console.error(error);
    return 2;
  } finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}
