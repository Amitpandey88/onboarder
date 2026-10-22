import { promises as fs } from 'node:fs';
import { proposeFix } from '../server/fixProposal.js';
import { showFixProposal, applyFix, verifyFix, fixStatus, rollbackFix, rejectFix, acceptFix } from '../server/fixEngine.js';
import { runReview } from '../server/review.js';
import { configuredReviewProvider } from './review.js';
import { FixStore } from '../server/fixStore.js';
import { hash } from '../server/intelligence/workspace.js';
import { expandHome } from '../server/paths.js';
import { reviewProfile } from '../shared/review/review.js';
import { privateText } from '../server/fixSource.js';
import type { FixProposal, FixRun } from '../shared/review/fixContracts.js';
import { terminalText } from './agent/process.js';

export const FIX_HELP = `onboarder fix propose [folder] --finding ID [--report review.json] [--staged | --base REF --head REF]
onboarder fix show [folder] --proposal ID [--json]
onboarder fix apply [folder] --proposal ID --approve EXACT_PROPOSAL_DIGEST
onboarder fix verify [folder] --run ID [--allow-checks --trust-worktree --check ID --check-digest EXACT_PLAN_DIGEST]
onboarder fix status [folder] --run ID
onboarder fix reject [folder] --proposal ID --approve EXACT_PROPOSAL_DIGEST
onboarder fix rollback [folder] --run ID
onboarder fix accept [folder] --run ID --approve EXACT_RESULT_FINGERPRINT

Proposals use your optional configured AI connection and never change source files.
Apply requires the digest shown with the complete patch. Checks are separate and opt-in.
--check can be repeated (maximum five). --ai explicitly enables optional contextual re-review.
Worktrees isolate file edits, not code execution. Only trust reviewed checks in an appropriate environment.
Nothing commits, pushes, merges or modifies the source checkout. Use --json for saved records.
`;
function format(value: FixProposal | FixRun) {
  if ('edits' in value) return `Proposal ${value.id} · ${value.status}\nFinding: ${value.finding.id}\nRevision: ${value.revision}\nSource: ${value.sourceFingerprint}\nRisk: ${value.risk}${value.investigationRequired ? ' · human investigation required' : ''}\n${value.rationale}\n${value.patch}\nSide effects: ${value.sideEffects.join('; ') || 'none stated'}\nDependencies: ${value.affectedDependencies.join('; ') || 'none stated'}\nBreaking changes: ${value.breakingChanges.join('; ') || 'none stated'}\nRecommended tests: ${value.tests.join('; ')}\n${value.limitations.join('\n')}\nApproval digest: ${value.digest}\n`;
  return `Run ${value.id} · ${value.status}\n${value.message}\nWorktree: ${value.workspace || 'not created'}\nBranch: ${value.branch || 'none'}\nCheckpoint: ${value.checkpointId || 'none'}\nResult fingerprint: ${value.resultFingerprint || 'unavailable'}\n${value.actualDiff}\n${value.checks.map(c => `${c.phase} ${c.id}: ${c.status} (${c.durationMs}ms)\n${c.output}`).join('\n')}\n${value.comparison ? `Fresh review: ${value.comparison.noLongerDetected.length} no longer detected, ${value.comparison.unresolved.length} unresolved, ${value.comparison.introduced.length} introduced.\n${value.comparison.explanation}\n` : ''}${value.checkPlan ? `Check-plan digest: ${value.checkPlan.digest}\n${value.checkPlan.checks.map(c => `${c.id}: ${c.command} ${c.args.join(' ')}${c.script ? '\n  Script: ' + c.script : ''}`).join('\n')}\n${value.checkPlan.notice}` : ''}\n`;
}
export async function fixCommand(action: string, folder: string, flags: Record<string, any>) {
  if (!action || flags.help) { console.log(FIX_HELP); return 0; }
  const abort = new AbortController(), cancel = () => abort.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const root = expandHome(folder), store = new FixStore(), identity = { root, owner: hash('cli:' + (process.getuid?.() ?? process.env.USERNAME ?? 'local')), store };
  try {
    let value: FixProposal | FixRun;
    switch (action) {
      case 'propose': {
        if (!flags.finding) throw new Error('Provide --finding from a current review.');
        if (flags.staged && flags.head) throw new Error('Choose staged or a head revision.');
        let report;
        if (flags.report) {
          const file = expandHome(flags.report), stat = await fs.lstat(file);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new Error('Review report must be a regular JSON file under 2 MB.');
          report = JSON.parse(await fs.readFile(file, 'utf8'));
        } else report = await runReview(root, { mode: flags.staged ? 'staged' : flags.head ? 'range' : 'working', base: flags.base || 'HEAD', head: flags.head || '', profile: flags.profile ? reviewProfile(flags.profile) : undefined, signal: abort.signal });
        value = await proposeFix(root, identity.owner, report, flags.finding, { store, signal: abort.signal, provider: await configuredReviewProvider(flags),
          limits: { ...(flags.aiMaxTokens ? { maxOutputTokens: Number(flags.aiMaxTokens) } : {}), ...(flags.aiMaxContextBytes ? { maxContextBytes: Number(flags.aiMaxContextBytes) } : {}), ...(flags.aiTimeoutMs ? { timeoutMs: Number(flags.aiTimeoutMs) } : {}) } }); break;
      }
      case 'show': value = await showFixProposal(identity, flags.proposal); break;
      case 'apply':
        if (!flags.approve) throw new Error('Inspect fix show, then explicitly pass --approve with its complete proposal digest. --yes does not approve a patch.');
        value = await applyFix(identity, flags.proposal, flags.approve, abort.signal); break;
      case 'verify': value = await verifyFix(identity, flags.run, { allowChecks: flags.allowChecks === true, trustWorktree: flags.trustWorktree === true, checks: flags.check || [], checkDigest: flags.checkDigest,
        ai: flags.ai ? { provider: await configuredReviewProvider(flags) } : undefined }, abort.signal); break;
      case 'status': value = await fixStatus(identity, flags.run); break;
      case 'rollback': value = await rollbackFix(identity, flags.run); break;
      case 'reject': value = await rejectFix(identity, flags.proposal, flags.approve); break;
      case 'accept': value = await acceptFix(identity, flags.run, flags.approve); break;
      default: throw new Error(FIX_HELP);
    }
    console.log(flags.json ? JSON.stringify(value, null, 2) : terminalText(format(value)));
    return abort.signal.aborted ? 130 : ['verification-failed', 'inconclusive', 'stale'].includes(value.status) ? 2 : 0;
  } catch (e) {
    if (!flags.json) throw new Error(terminalText(privateText((e as Error).message)));
    console.log(JSON.stringify({ schemaVersion: 1, status: abort.signal.aborted ? 'cancelled' : 'error', error: privateText((e as Error).message) }));
    return abort.signal.aborted ? 130 : 2;
  } finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}
