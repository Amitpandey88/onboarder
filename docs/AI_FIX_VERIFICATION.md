# AI Fix & Verification

Onboarder 1.1.0 connects captured review findings to human-approved, isolated edits and
real verification. Local review remains offline by default. No hosted account,
commercial model, runtime dependency, automatic commit, GitHub write, merge,
publication or deployment is required or performed.

## Workflow and architecture

1. Run a working-tree, staged or commit-range review. Select an actionable finding.
2. Generate a **read-only proposal** with your configured optional connection.
   A tool-free model receives bounded repository context from the existing
   intelligence engine, related callers/tests, policies and complete editable text
   for up to eight relevant files. Repository content is untrusted evidence.
3. Inspect the complete patch, rationale, dependencies, possible breaking changes,
   test recommendations, risk estimate and source fingerprint. These are model
   inferences; they are not evidence that checks executed.
4. Explicitly approve the exact proposal digest. The server validates its owner,
   repository, revision, source fingerprint, file scope, expiration and signature.
   It consumes the approval once, creates an existing-harness Git worktree,
   reproduces the captured working/index overlay, checkpoints files and applies
   the exact approved replacements through hash-checked file operations. No
   implementation model gets a chance to change the patch after approval.
5. Inspect the actual applied diff and fresh deterministic review. Choose checks
   from the displayed allowlist. Authorize their exact plan and acknowledge that
   this repository is trusted in the execution environment.
6. The same selected commands run in separate baseline and result worktrees.
   Receipts include exit/status, time, bounded redacted output, command digest and
   source fingerprints before/after execution. A fresh review compares original,
   unresolved, newly introduced and no-longer-detected findings and architecture
   boundaries. Optional contextual AI re-review requires another explicit opt-in.
7. Accept the checked result or restore its checkpoint. Acceptance records a
   decision; code remains uncommitted in the worktree for manual transfer.

`fixProposal.ts`, `fixSource.ts`, `fixStore.ts` and `fixEngine.ts` implement this
lifecycle. Version 1 contracts are in `shared/review/fixContracts` and do not
change existing review JSON, Markdown or SARIF contracts. The existing
`/api/intelligence/fix` endpoint dispatches finding-linked actions. It reuses the
Hermes harness's worktree preparation, file guards, checkpoints, process cleanup
and permission model. Finding-linked manifests record proposal/finding identity,
allowed paths, revision and digest; generic agent write/check tools cannot bypass
this lifecycle. No model-generated shell command is accepted.

The existing free-task Intelligence/Hermes implementation workflow remains a
separate, explicitly invoked agent workflow with its existing permissions. It
does not produce or approve a finding-linked proposal. `agent implement`, terminal
chat and existing MCP/GitHub workflows keep their previous behavior.

## CLI

Configure the same endpoint and model used by contextual review. For example:

```sh
export ONBOARDER_AI_BASE_URL=http://localhost:11434/v1
export ONBOARDER_AI_MODEL=your-local-model
# Optional, supplied through the environment rather than a saved fix artifact:
export ONBOARDER_AI_API_KEY=your-provider-key
onboarder review . --json > /tmp/review.json
onboarder fix propose . --finding FINDING_ID --report /tmp/review.json --json
# Or: onboarder fix propose . --finding FINDING_ID --ai-connection hermes
```

Existing account endpoint/model settings, `OPENAI_*` environment fallbacks,
`--base-url` and `--model` work too. Hermes uses its installed configured profile;
Onboarder supplies no repository tools to proposal generation. For an AI finding,
save the contextual review JSON and pass `--report`; its locations and hashes are
revalidated against current source. Proposals can also rerun a static comparison:

```sh
onboarder fix propose . --staged --finding FINDING_ID
onboarder fix propose . --base main --head feature --finding FINDING_ID
onboarder fix show . --proposal PROPOSAL_ID
onboarder fix apply . --proposal PROPOSAL_ID --approve EXACT_PROPOSAL_DIGEST
onboarder fix status . --run RUN_ID
onboarder fix verify . --run RUN_ID
```

The last command performs re-review and records unexecuted checks as skipped.
`--yes` never approves a patch. Applying requires the full digest printed with the
preview. To actually execute a reviewed check:

```sh
onboarder fix verify . --run RUN_ID --allow-checks --trust-worktree \
  --check node-test:codec.test.js --check-digest EXACT_CHECK_PLAN_DIGEST
onboarder fix verify . --run RUN_ID --allow-checks --trust-worktree \
  --check test --check typecheck --check-digest EXACT_CHECK_PLAN_DIGEST
onboarder fix verify . --run RUN_ID --ai  # explicit optional AI re-review
onboarder fix accept . --run RUN_ID --approve EXACT_RESULT_FINGERPRINT
onboarder fix rollback . --run RUN_ID
onboarder fix reject . --proposal PROPOSAL_ID --approve EXACT_PROPOSAL_DIGEST
```

Every action supports `--json`. Exit 2 means stale, inconclusive or failed
verification; cancellation returns 130 when handled during an operation. Reopen
saved proposals with `show`, runs with `status`, and repeat verification with new
explicit permission. No automatic fix retry occurs.

Supported checks are explicit `test`, `typecheck`, `lint` and `build` package
scripts and up to twenty discovered `.test`/`.spec` JavaScript Node test files.
The operator reviews the command definitions and trusts repository code before
execution. npm scripts can invoke other scripts/tools. TypeScript/ESLint must
already be installed/configured in that worktree; dependencies are never copied
or installed automatically. Changed check definitions between baseline and result
are refused. Arbitrary project commands and model-generated strings are not an
execution interface. Set up dependencies manually in the isolated environment
before approving checks when necessary.

## Web Review workspace

Each finding has **Explain & propose fix**. Explanation is available before any
model call. **Generate proposed fix** opts into model submission. The panel shows
complete before/after source, file navigation, full unified patch, risk, rationale,
dependency effects and suggested tests. It uses the already loaded Monaco diff
editor when available and an accessible complete text preview otherwise.

Approval/rejection, execution permission, selected checks, optional AI re-review,
activity/cancellation, actual diff, check receipts, before/after findings,
architecture results, checkpoint history, rollback and final acceptance are
separate actions. **Resume saved fix** loads proposal/run IDs in the same browser
session and repository. Browser identity lives in session storage; after losing
that session, old proposals cannot be adopted by another browser. Existing signed
owner authentication and repository scan capabilities also apply. Named team
members cannot invoke fix execution. Export contains the proposal and run JSON.

## What the states mean

| State | Meaning |
| --- | --- |
| proposed | Read-only proposal saved; source unchanged |
| approved | Exact authorization consumed; application preparing |
| applied | Approved replacements written; fresh static review recorded; checks not yet authorized |
| checks-pending | Verification attempt in progress |
| verified-by-checks | Selected result checks actually passed against matching captured source; review gates passed |
| verification-failed | Executed check failed/timed out/errored, target static finding remains or a regression gate failed |
| inconclusive | Checks unexecuted/cancelled, incomplete source/review coverage or execution/recovery failure |
| stale | Approval/source/check fingerprints no longer match |
| rejected | Proposal cannot be applied |
| rolled-back | Checkpoint restored; checks not rerun |
| accepted | Human accepted the checked result; no source transfer/commit occurred |

Passing selected checks does not establish complete correctness. A static finding
disappearing is labeled **no longer detected**, not proven fixed. AI findings
remain unresolved by static analysis even when an AI re-review omits them.

## Security, privacy and limits

- A worktree isolates file edits, **not process execution**. Only trusted
  repositories may execute locally after explicit permission. For untrusted code,
  run Onboarder inside an independently prepared container/VM or other appropriate
  OS isolation; this engine does not supply one. Authorized tests can access local
  resources or network according to that environment. They are not run by default.
- Git hooks, fsmonitor and configured clean/smudge/process filters are disabled
  for review source reads and worktree creation. Source is not executed to infer
  relationships. Symlink, traversal, credential-file and policy edits are refused.
- Known secrets/environment credentials are redacted from model context and
  receipts. Secret-bearing editable/overlay source is refused. Provider keys are
  never put into proposal/run JSON. Redaction cannot identify every unknown secret;
  inspect source before opting into an external provider. Subprocess environments
  omit inherited model/GitHub credentials and preload hooks. OS home access still
  depends on the execution environment.
- Private artifacts/checkpoints live under the existing agent home (default
  `~/.config/onboarder/agent`, override `ONBOARDER_AGENT_HOME`), with private file
  permissions. They contain approved source patches, so protect this directory.
  Proposal/run envelopes are authenticated with a separate private signing key;
  checkpoint digests and current file hashes protect rollback. They are not encrypted.
- Approval expires after 24 hours and binds the exact patch, owner, workspace,
  revision and paths. Altered, stale, cross-session and replayed approvals fail.
  Rollback preflights every file and refuses newer edits; restoration receipts
  record failures and completed files if a later restoration step fails.
- Defaults: 60 KB model context, 3,000 requested output tokens, 60 seconds and one
  tool-free model request per proposal; API/CLI contextual review limit controls
  also apply (`--ai-max-context-bytes`, `--ai-max-tokens`, `--ai-timeout-ms`). Up to
  two proposal requests may be active, with three admissions per repository/minute.
  Hermes has byte/time bounds but no bridge token-usage/output-token enforcement.
- Snapshot limits: 4,000 paths, 24 MB eligible text, 128 KB/file; clean assets and
  large lockfiles receive hashes only (8 MB/file, 64 MB total), never model text.
  Working/index
  overlays: 100 changed files/2 MB. Editable full-source context: eight existing
  files, 20 KB each; replacements: 96 KB combined. Unsupported binary/symlink or
  oversized dirty source fails explicitly. Source that cannot be fingerprinted
  prevents a verified verdict. No new/deleted file or policy-changing proposals
  are supported yet.
- At most five explicitly chosen checks, 120 seconds and 256 KB subprocess output
  per check, 16 KB retained output, five-minute verification budget and five
  verification attempts per run. There is no automatic dependency installation,
  model fix retry, GitHub publication, source-checkout rollback or Git reset.
  Ignored dependencies, external services and runtime state are outside the source
  fingerprint. There is no cache shared across source revisions.

## Recovery and validation

Cancellation preserves saved run/checkpoint receipts. `status` exposes partial
application; `rollback` restores only files whose current hashes still match an
approved before/after state. Repeating verification requires fresh permission and
matching result source. A process crash can leave a private `.lock` file. Inspect
the saved run, ensure the recorded PID is no longer running, then remove only that
lock before resuming. Worktrees are retained for inspection and manual cleanup;
the engine never destructively resets a user's checkout.

Run `npm run check`, `npm run security:audit` and the targeted
`node --test tests/fixEngine.test.js tests/fixIntegration.test.js` suite. Model
responses in these tests are mocked. Git worktrees, guarded writes, checkpoints,
Node/npm checks, HTTP and CLI processes are real. The regression fixture starts
with unsafe expression evaluation: the baseline test rejects the bug, JSON parsing
fixes it, the result test passes and fresh pattern review drops the evaluation
finding. Another fixture checks a cross-file async authorization regression.

Remaining work includes a dedicated container executor, more command adapters,
new-file/rename support, richer calibrated fix risk, semantic test selection,
worktree lifecycle management and verified reproduction assertions for model
findings. These are candidates for Phase 4, not guarantees of this release.

## Local implementation and verification — 2026-10-21

This historical section records development on `codex/ai-fix-verification`, when
the package was still 1.0.5 and unpublished. The functionality is included in
1.1.0; see [the release notes](RELEASE_1.1.0.md) for current scope and limitations.

New source modules:

- `src/shared/review/fixContracts.ts`: versioned proposal, run, check and comparison contracts.
- `src/server/fixSource.ts`: bounded revision snapshots and fingerprints.
- `src/server/fixStore.ts`: private authenticated artifacts and operation locks.
- `src/server/fixProposal.ts`: context retrieval, tool-free generation and validation.
- `src/server/fixEngine.ts`: approval, exact application, check orchestration, re-review, acceptance and recovery.
- `src/cli/agent/workspace.ts`, `checks.ts`, `gitSafety.ts`: shared worktree preparation, real check receipts and Git execution guards.
- `src/cli/fix.ts`: terminal workflow and JSON output.
- `src/public/js/reviewFix.ts`: existing Review workspace's fix panel.
- `tests/fixEngine.test.js`, `tests/fixIntegration.test.js`, `tests/helpers/fixFixture.mjs`: deterministic models with real temporary repositories and execution.

Extended source modules are `apiFix`, `router`, server `index`, shared intelligence
`workspace`, `gitDiff`, CLI `main`/`review`, agent `runner`/`contracts`/`tools`/
`checkpoints`/`command`, and browser `reviewView`/`reviewAI`. Styling is in the
existing `public/workbench.css`. README, this guide, Advanced Features, package
contents and supply-chain guard fixtures describe and package the actual behavior.
Generated JavaScript/declarations use the TypeScript build, never manual edits.

Validation on Node 24.20.0:

- `npm ci --ignore-scripts`: passed (locked development dependencies; no lifecycle scripts).
- `npm run check`: 996 tests, 995 passed, zero failed, one optional separately
  installed TypeScript semantic-compiler test skipped. Type checks, 448 generated
  files, supply-chain guard and architecture checks passed.
- `npm run security:audit`: zero unaccepted advisories. The existing low-severity
  Mermaid-bundled KaTeX advisory remains explicitly tracked through 2026-11-09;
  this work does not claim to fix it.
- Nineteen fix tests cover privacy, invalid output, approval/replay/scope, stale
  revisions, partial application, rollback conflicts/tampering, real passing/failing/
  timed-out/cancelled checks, source mutation, re-review regressions, clean asset
  hashing, staged/range source, HTTP/CLI and the cross-file authorization fixture.
- A locally packed archive passes the independent CLI proposal/apply/real-check/
  rollback smoke test with no runtime dependencies. Browser checks exercise the
  actual Review panel, permissions, baseline failure/result pass, rollback,
  resumption, keyboard close, dark theme and 390px width without horizontal overflow
  or page errors.
- The existing four-case contextual-review mock benchmark still reports 2/2 buggy
  fixtures detected and no findings on 2/2 clean fixtures, with 2,613–2,693 context
  bytes and 215.59–287.67 ms measured pipeline latency in this run. These are canned
  model harness results, not live model accuracy or cost measurements. Tokens are
  unavailable in this benchmark.

No live commercial/local model or authenticated Hermes provider was used for these
tests. Model generation is mocked; subprocess tests, Git operations and HTTP/CLI
transport are real. Node 20 compatibility is maintained in source/package targets;
this validation run used Node 24 rather than claiming a separate Node 20 execution.
