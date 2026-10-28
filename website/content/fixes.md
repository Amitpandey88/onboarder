The finding-linked fix workflow connects evidence to an exact patch, human approval, isolated changes and real verification. Asking for an explanation or preview never applies a fix.

## Review, explain and propose

Configure [optional AI](/docs/ai-review/) and save a current finding report:

```sh
onboarder review . --json > /tmp/onboarder-review.json
onboarder fix propose . --finding FINDING_ID --report /tmp/onboarder-review.json --json
onboarder fix show . --proposal PROPOSAL_ID
```

Use IDs from actual output. For an AI finding, save the `--ai --json` report and pass `--report`. Staged/base-head comparisons and `--ai-connection hermes` are supported.

Generation is read-only. The model receives bounded evidence and allowed source, then proposes replacement text, not shell commands. Inspect the full patch, finding, exact revision/fingerprint, dependencies, tests, risk, side effects and requests for human investigation.

## Approve the exact patch

```sh
onboarder fix apply . --proposal PROPOSAL_ID --approve EXACT_PROPOSAL_DIGEST
onboarder fix status . --run RUN_ID --json
```

Use the full preview digest. `--yes` does not approve a patch. Server-side approval binds the owner/session, workspace, revision, source, allowed paths and exact proposal; stale, altered, expired or replayed authorization is refused.

Application creates an isolated Git worktree, reproduces the captured overlay, checkpoints files and applies the approved changes through hash-checked file operations. The original checkout stays untouched. Inspect the actual diff and fresh deterministic review. Worktrees separate files; they are not operating-system sandboxes.

## Authorize checks separately

```sh
onboarder fix verify . --run RUN_ID
```

This re-reviews and displays a check plan. It does not grant execution permission; unexecuted checks are skipped. Choose commands from the inspected allowlist, never model-generated shell text.

To execute a reviewed plan in an environment where you trust the repository:

```sh
onboarder fix verify . --run RUN_ID --allow-checks --trust-worktree \
  --check test --check typecheck --check-digest EXACT_CHECK_PLAN_DIGEST
```

Use actual check IDs and digest from the plan. Supported selections include configured `test`, `typecheck`, `lint` and `build` scripts and discovered JavaScript Node test files. Tests execute repository code; use an appropriate isolated execution environment for untrusted repositories.

Checks run against baseline and result worktrees. Receipts retain passing, failing, skipped or timed-out status, bounded output and source fingerprints. Changed script definitions or source invalidate old permission/receipts. Fresh review compares original, unresolved, no-longer-detected and new findings and available architecture impacts.

Optional contextual re-review needs another opt-in:

```sh
onboarder fix verify . --run RUN_ID --ai
```

A finding disappearing from AI output is not proof of repair. **Verified by checks** requires defined checks to succeed against the exact resulting source; it does not prove complete correctness.

## Accept, reject or roll back

```sh
onboarder fix accept . --run RUN_ID --approve EXACT_RESULT_FINGERPRINT
onboarder fix rollback . --run RUN_ID
onboarder fix reject . --proposal PROPOSAL_ID --approve EXACT_PROPOSAL_DIGEST
```

Acceptance records a decision; changes remain uncommitted in the worktree. Transfer, commit and PR publication are separate actions. No automatic second fix attempt, commit, push, merge, deployment or GitHub comment occurs.

Rollback verifies hashes, refuses conflicting newer edits and records successful/failed restorations. Inspect partial failures before recovery. Rollback completion does not mean tests passed; no destructive reset runs on your checkout.

## Web workspace and recovery

In **Review**, use **Explain → Propose fix → Preview → Approve**, inspect the applied diff, then separately approve checks. The panel shows files, risk, activity/cancellation, baseline/result checks, re-review, checkpoints and rollback. Failed, stale and inconclusive runs remain distinct from verified results.

Resume proposals with `show` and runs with `status`. All actions support JSON. Model context, time, output, files and execution are bounded; no unlimited agent loop exists. The [version-pinned guide](https://github.com/Amitpandey88/onboarder/blob/v1.1.0/docs/AI_FIX_VERIFICATION.md) records exact limits and states.

Proposal/checkpoint artifacts can retain source and patches with private file permissions, not encryption. Provider credentials remain outside them. The existing free-task Hermes implementation flow remains separate with its own permissions.
