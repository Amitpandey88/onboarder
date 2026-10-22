# Phase 5A — production readiness audit

Audit date: **2026-10-22**. Verdict: **Not Ready for the complete Phase 1–4 public beta**.

The local review, fix and triage implementations work in the tested scope. The
complete platform does not exist yet: the dedicated Change Stack is partial,
the engineering planner and post-merge draft workflows are missing, and team and
editor capabilities cover only subsets of Phase 4. Passing local tests cannot
establish live model quality, a configured GitHub App, or an internet deployment's
security. A narrower, explicitly scoped local beta is feasible after the release
identity and remaining validation gates below are resolved. No new major feature
was implemented as part of this audit.

## Scope and release identity

- Inspected source, tests, recent commits, working changes and feature branches.
  Started from local Phase 4A development, preserving all existing uncommitted
  Phase 1–4A work and unrelated assets. Created `codex/production-readiness-audit`.
- HEAD is `44556a8` (`Release 1.0.5: repository intelligence and lighter graphs`).
  The unified-review, contextual-review, fix-verification and advanced-platform
  feature branches all point at that same commit. Their new implementation is
  present in the **uncommitted working tree**, not independent committed releases.
  Package version remains 1.0.5; this archive is an unpublished development build,
  not evidence that the published 1.0.5 contains these features.
- [Source manifest](audits/phase5a/source-manifest.json) records SHA-256 hashes for
  351 source, test, script, editor and build/config files. Its combined digest is
  `d90710fb9f1541a81b0caf1c36ac49ab29d820a6cafc05b70788800ed301623e`.
  This identifies the audited source snapshot without publishing local memory.
- No push, merge, npm/Marketplace publication, deployment, production-setting
  change, GitHub App installation, comment, issue, PR or other GitHub content write
  occurred. Real GitHub calls were public, unauthenticated reads. AI calls used
  canned responses or a local mock HTTP provider. No real model received source.

## Phase 1–4 verification matrix

“Implemented and Verified” describes the stated tested boundary, not every
possible integration or a proof of correctness. “Partial” means meaningful working
foundations exist but the requested capability is incomplete. No remaining
capability is labelled Broken merely because a dependency is optional. Defects
that were reproduced and repaired are listed separately.

| Capability | Classification | Actual implementation and evidence | Limits / missing work |
| --- | --- | --- | --- |
| Phase 1: Unified Review Foundation | **Implemented and Verified** | Shared contracts/rules, `server/review`, exact Git comparisons, captured redacted patches, configuration, fingerprints, CLI/HTTP, JSON/Markdown/SARIF; `review`, `unifiedReview`, `intelligence` tests and clean archive smoke. | Pattern analysis of added lines; skips and incomplete patches remain explicit. No execution or comprehensive bug guarantee. |
| Phase 2: Contextual AI Code Review pipeline | **Implemented and Verified** | `reviewContext`, `reviewAI`, optional provider/Hermes adapters; bounded callers/dependencies/tests, optional compiler references, source hashes/revisions, structured citation validation, duplicate suppression, CLI/web controls. Contextual unit/HTTP/CLI tests pass. | Model completions mocked; quotes and locations are validated, behavior is not proven. Default retrieval indexes at most 2,000 files and 32 MiB of source. |
| Phase 2: live model correctness and provider compatibility | **Implemented but Unverified** | HTTP request dialects, redaction, errors, limits and mocked Anthropic/Gemini/OpenAI-compatible framing tested. Real compiler API exercised. | No live commercial/local model, live token billing, quality calibration or actual vendor account was exercised. Provider URL tests do not establish live vendor compatibility. |
| Phase 3: AI Fix & Verification | **Implemented and Verified** | Finding-linked read-only proposals; server-enforced exact digest/session/root/source approval; isolated worktrees; checkpoints; real baseline/result checks; fresh review; recovery/rollback/acceptance. CLI, HTTP, browser and installed archive workflows execute. | Model patch generation mocked. Existing text-file replacements only; no new/deleted files or sensitive/policy edits. Passing selected checks is limited evidence, not complete correctness. |
| Phase 3: live Hermes implementation integration | **Implemented but Unverified** | Existing harness, scoped tools, structured events, process cleanup, saved jobs and checkpoints are exercised with controlled subprocess fixtures. | No real Hermes/model session was run in this audit. Legacy explicit free-task implementation remains distinct from finding-linked patch approval. |
| Phase 4A: PR Triage Dashboard | **Implemented and Verified** | Real GitHub adapter, queue/inspection, P0–P3 factors, filters, target-revision CODEOWNERS, exact-head CI/reviews, optional explanation; mocked contract/auth tests and live public queue + PR #7 inspection. | One bounded page at a time. Required branch/ruleset completeness remains unknown; architecture requires matching local commits. Live App/private authentication unverified. |
| Phase 4B: Change Stack | **Partial** | Existing revision comparison, removed exports, dependency differences, captured patch navigation, grouping and graph primitives pass tests. | No dedicated end-to-end Change Stack with semantic rename/move analysis, before/after overlays and its own connected navigation/explanations. |
| Phase 4C: AI Engineering Planner | **Missing** | No dedicated plan contracts, editable saved plan service, revision history, milestone approval or planner UI found. | Agent permission dry-runs and generic chat prompts are not a repository-grounded editable engineering planner. Full workflow stops at this stage. |
| Phase 4D: Developer Integrations | **Partial** | CLI, MCP consistency/stdin, safe editor command adapters, evidence navigation and triage tested; VSIX packages successfully. Existing coding-agent/MCP guidance is present. | Approved plan/fix handoff is incomplete; real VS Code GUI and external coding-agent/editor installations unverified. GitLab/Bitbucket/Azure DevOps adapters absent. |
| Phase 4E: Team Intelligence | **Partial** | Named viewer/reviewer credentials, repository grants, revocation, member workspace isolation, role-gated comments and private storage pass actual HTTP tests. | No full shared review queue/decisions, maintainer workflow, saved plans, reversible learnings, ownership/activity/analytics platform. Comment fingerprints are caller-supplied labels, not server-verified proof of a current revision. |
| Phase 4F: Post-Merge Automations | **Missing** | Pre-merge webhook HMAC, durable jobs/deduplication, opt-in checks publication foundations exist and pass controlled tests. | Accepted PR actions exclude merged/closed events. No merged-PR local release-note/architecture draft orchestrator or its controls. Pre-merge check jobs are not post-merge automation. |
| Unified Phase 4 workspace | **Partial** | Explore/Intelligence/Review/Graph and Triage-to-captured-Review navigation exist; browser scan→review→fix works. | Plan/Change Stack/Team/Activity journey and complete PR→plan→implementation handoff absent. |

Primary implementation: `src/shared/review/`, `src/server/review*.ts`,
`src/server/fix*.ts`, `src/cli/agent/`, `src/server/providers/`,
`src/server/triage*.ts`, `src/server/intelligence/`, `src/public/js/review*.ts`,
`src/public/js/triageView.ts`, `src/server/mcp/`, and `integrations/vscode/`.

## Security assessment and repaired regressions

No remaining critical exploit was demonstrated in the tested boundaries. This is
a code/regression audit, not a penetration-test certification. The following
confirmed defects were repaired without weakening existing protections:

| ID / priority | Reproduced behavior before repair | Repair and evidence |
| --- | --- | --- |
| SEC-01 / high | Legacy chat proxy forwarded provider error bodies and credential-bearing endpoint diagnostics; fetch followed redirects. This could expose credentials/source to an unintended redirect or expose private upstream diagnostics to the browser. Its safeguards lagged the newer review adapter. | Disable redirects; withhold response bodies/error causes; retain bounded sanitized request IDs; redact configured credentials and known secret/environment content before submission and in structured responses; validate input and bound response/event/backpressure buffers; register disconnect cancellation before fetch. New mocked transport regressions pass. No live credential was used in reproduction. |
| AUTH-01 / high-risk approval hardening | Changing a raw package check script could leave the check-plan digest identical when redaction made both displayed scripts the same. A digest did not fully identify executable definitions. | Hash raw pre/main/post script definitions into the approved plan, retaining only the hash and redacted display. Existing source-fingerprint gates limited exploitability; **this audit did not demonstrate arbitrary command execution bypassing those additional gates**. Regression proves a changed definition now changes the digest. Old plan approvals need regeneration. |
| REL-01 / high compatibility regression | Under Node 20, an unresponsive triage completion left no referenced event-loop handles; the process ended before its timeout returned. Initial targeted run: 63 pass, 6 cancelled. Review/fix callbacks that ignored the abort signal could also remain pending. | Referenced operation deadline with explicit cleanup; abortable waits for review, fix and triage completions. Full Node 20 rerun: 1,041 pass, no cancellations. New regression covers uncooperative review/fix adapters. Built-in fetch/Hermes cancellation still propagates; an arbitrary injected adapter must cooperate to stop its own outside work. |
| PRIV-01 / medium | A GitHub App job minted a token with check-write permission even with publication disabled. No content write was observed. | Disabled publication requests a read-only installation token. Test signs a synthetic App JWT, intercepts token permissions, and verifies downstream calls remain GET-only. Explicit opt-in publication keeps the existing grant/head checks. |
| REL-02 / medium | Legacy browser API streaming could accept premature EOF, ignore malformed frames, miss Anthropic/Gemini text, and evade its size limit through many complete frames. Gemini non-streaming URLs used an invalid key delimiter; compatible endpoint paths could mishandle Azure query parameters. | Require explicit completion; reject malformed/token-truncated output; parse tested provider dialects; count cumulative bytes; build URL/query components correctly. These are controlled transport tests, not live model integrations. |

The first 11 new regression scenarios failed against the original code. Fourteen
audit regressions now pass; the additional cases cover URL construction,
malformed events and uncooperative adapters. Generated JavaScript was produced
only through the TypeScript build.

Existing boundaries inspected and retained:

| Boundary | Assessment / test evidence | Practical limits |
| --- | --- | --- |
| Authentication, host and origin | Router host/rebinding and cross-origin gates; remote signed HttpOnly sessions/Bearer authentication; member revocation. Actual HTTP security/member tests pass. Loopback exemption requires loopback connection and Host. | Local owner and processes on the host remain trusted. Internet TLS, reverse-proxy policy, operator access-key strength and abuse/rate controls need deployment-specific validation; no production settings changed. |
| Cross-user authorization | Exact canonical repository grants, allowed scan files, role gates, separate member intelligence storage; owner-only AI credentials, fix execution, triage/settings. Cross-repository/member/origin/revoked-session tests pass. | Current team subsystem is not a full multi-tenant service. Comments' caller-supplied revision labels must not be used as an approval or freshness credential. |
| GitHub App/webhooks | Raw-byte HMAC, minimum configured secret length, bounded bodies, allowlists, revocation, dedupe/durable state, exact-head checks before opt-in publication. New least-privilege regression passes. | Real App installation/private repos/publishing not exercised. Public unauthenticated triage GETs were exercised. |
| Prompt injection/model exposure | Untrusted-data system instructions; tool-free review/fix generation; bounded redacted source, validated evidence/paths/schema; malicious source-comment fixtures cannot authorize sensitive edits/tools. Offline review makes no model call. | These tests show privilege boundaries hold under adversarial outputs, not that a model cannot be influenced. Secret recognition is heuristic, not comprehensive DLP; unknown secret formats/encoded secrets may evade recognition. Hermes transcripts can retain source under the operator's profile. |
| Files and approvals | Scoped regular-file/hash checks, traversal/sensitive-file/symlink rejection, private authenticated proposal/run artifacts, expiring one-use approval bound to session/workspace/source/allowed paths. Tampering/replay/stale/cross-owner tests pass. | Does not defend against a hostile OS administrator or promise an OS sandbox. Proposals support a deliberately narrow file operation set. |
| Execution/worktrees | Passive scan/context never execute repository code. Patch-only implementation and checkpoint recovery use existing scoped tools. Checks are a separate reviewed allowlist/digest with explicit trust and execution permission; environment minimization and process budgets/cleanup retained. | Worktrees isolate edits, **not process privileges or network/filesystem access**. Authorized repository scripts execute arbitrary project code with operator privileges. Untrusted checks require an appropriate external isolation environment; no container sandbox is supplied by this core. |
| Rollback/recovery | Before-state checkpoints, content authentication, expected-result hashes, per-restoration receipts, refusal to overwrite newer edits; cancellation and partial application recovery tests pass. | Rollback is not verification; final acceptance does not merge/copy/commit code into the original checkout. |
| Supply chain | Zero core runtime dependencies, exact optional tools, vendor integrity inventory, script-disabled installs, regenerated build consistency all pass. | One existing accepted low KaTeX advisory remains: [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), review due **2026-11-09**. Strict Mermaid configuration/output sanitization and existing regression tests mitigate relevant preconditions. The embedded vulnerable library is **not fixed**. |

## End-to-end, failure and recovery results

[Structured workflow result](audits/phase5a/e2e.json),
[browser result](audits/phase5a/browser.json), and
[live GitHub observation](audits/phase5a/live-github.json).

| Requested stage | Result |
| --- | --- |
| Open repository → Analyze | Passed on real temporary Git repositories; browser opens/scans the same realistic three-file fixture. |
| Plan | **Unavailable:** no engineering planner. No substitute was claimed. |
| Review → Propose fix | Real deterministic `eval` finding; mock model generates a JSON-parser replacement; actual context/schema/hash/patch validation executes. Proposal leaves files and Git status unchanged. |
| Approve → Implement | Missing/wrong/stale/session-mismatched/replayed approval rejected. Explicit digest approval applies the exact patch in a separate worktree and records checkpoint + actual diff. |
| Run checks | Without permission, checks skipped and result inconclusive. Explicit allowlist/trust/digest approval runs a real Node test: baseline fails with a missing expected exception, JSON-parser result passes. Executed before/after fingerprints match. |
| Re-review | Real deterministic reviewer runs again; original finding no longer detected; introduced/unresolved/architecture results retained separately from test evidence. Passing tests cannot hide an introduced high-severity pattern. |
| Recovery | Saved status reopens; real rollback restores the worktree. Newer edits and checkpoint tampering refuse restoration; cancellation, partial application and cancelled-check resumption covered by actual engine/HTTP tests. A separately checked run can be accepted. |
| Prepare PR | **Partial:** local PR draft and real agent `pr --dry-run` permission plan; GitHub writes false. No live Hermes drafting or PR creation tested. No full verified-fix→published-PR claim. |

Browser automation used the Playwright skill and actual UI controls for scan,
offline review, finding-linked proposal, complete patch, explicit apply approval,
separate check permission, real baseline/result checks, re-review and checkpoint
rollback. Escape closed the dialog; dark mode and a 390 px viewport had no
horizontal overflow; zero page errors observed. This is a Chromium smoke, not an
accessibility audit or full browser/platform matrix.

Tests also cover provider unavailable/failure/timeout, aborted requests, malformed
and hallucinated output, fingerprint mismatch, private-file attempts, prompt
injection, command timeouts/failures/source mutation, stale revisions, invalid
check digests and high-severity regressions. Main evidence files are
`tests/fixEngine.test.js`, `fixIntegration.test.js`, `contextualReview.test.js`,
`contextualReviewIntegration.test.js`, `triage.test.js`, `agent.test.js`,
`advancedIntegrations.test.js`, `intelligence.test.js`, and the new
`productionReadiness.test.js`.

Live public GitHub smoke retrieved **5 PRs** and inspected PR **#7**, head
`9ded9655a515cec94d6f7f3a91fb220edfa821b0`. It correctly returned priority **P1**,
readiness **blocked**, 5 observed checks including failing Node 20/22/24 CI, and
2 reviewed files with no static findings. Architecture was explicitly unavailable
because the exact revisions were not available locally. No implicit fetch or
checkout occurred. These failing checks belong to that remote dependency PR;
their root cause was not investigated and they do not describe this local branch.
Required branch-policy completeness remains unestablished.

## Performance measurements

[Raw samples and metadata](audits/phase5a/performance.json).
Node 24.20.0, macOS ARM64, 10 logical CPUs, 16 GiB RAM. Three sequential fresh
processes per scenario, source fixture generation excluded, module imports and
process startup included in wall time. OS caches may be warm. Peak RSS is the
maximum across samples, measured using Node's `process.resourceUsage().maxRSS`
(KiB converted to MiB). It includes compiler workers when applicable. CLI RSS was
not instrumented. These are synthetic local measurements, not production SLAs,
p95 statistics or cross-platform comparisons.

| Scenario | Median wall ms | Min–max ms | Peak RSS MiB | Observed scope |
| --- | ---: | ---: | ---: | --- |
| CLI `--version` startup | 64.875 | 62.928–73.849 | — | Real CLI subprocess. |
| Server import → local health response | 78.267 | 77.580–84.083 | 75.609 | Temporary HTTP server; excludes production daemon/TLS/reverse proxy. |
| 100-file scan | 44.459 | 44.412–45.071 | 61.391 | 100 parsed files / 99 edges. |
| 1,000-file scan | 68.018 | 67.539–73.959 | 69.719 | 1,000 parsed files / 999 edges. |
| 5,000-file scan, default budget | 143.212 | 142.053–143.979 | 86.188 | **Partial:** 4,000 discovered-file cap; 3,999 code files parsed. Manifest consumes one discovered-file slot. |
| 10,000 nodes / 60,000 edges | 48.493 | 48.076–49.778 | 75.141 | Graph indexing and three projections, bounded at 700 nodes / 1,800 edges. Browser layout/rendering excluded. |
| Semantic indexing, 100 TS files | 157.966 | 151.810–162.516 | 146.000 | Real trusted Compiler API 5.9.3 worker; 200 definitions / 298 references. |
| Review + context, 1,000 TS files | 520.188 | 503.426–659.642 | 240.156 | One changed async export; 1,843 context bytes / 2 excerpts / zero model requests. |
| Ten repeated MCP analyses, 1,000 files | 309.850 | 299.875–333.843 | 132.891 | Cold analysis plus nine cache hits; explicit rescan is required for source changes. |

Context retrieval inside those samples took 408–556 ms; deterministic review
53–59 ms. The contextual pipeline has the largest measured memory footprint and
is the best optimization candidate before increasing indexing budgets. Warm
analysis hits are measured in fractions of a millisecond; they reuse an analysis,
so this is not evidence of fresh rescanning speed. Ten calls are insufficient to
establish long-running memory stability. No performance threshold failure was
asserted without a defined product budget.

## Review quality benchmark

New reproducible labelled corpus: `tests/fixtures/readiness/cases.json`;
runner: `scripts/audit-readiness.mjs quality`;
[raw results](audits/phase5a/review-quality.json).

- **Deterministic case detection: 4/8 known-bug changes (50%).** Eval, dynamic
  Function, command construction and HTML input get findings. Null-guard deletion,
  authorization removal, missing async await and an off-by-one loop do not.
- **Expected rule accuracy: 3/4** cases with explicit expected sink rules. Bare
  `exec('ls ' + input)` is incorrectly categorized as SQL concatenation rather
  than command injection. A valid line anchor does not make that explanation right.
- **False-positive cases: 3/8 clean changes (37.5%), three findings.** A comment
  warning against eval, constant-only eval, and an inline empty HTML assignment
  produce warnings. The constant eval case is intentionally safe under this
  fixture's behavioral threat model even though a repository may prohibit eval.
- **Source anchor accuracy: 7/7 findings** refer to real in-range added lines.
  This measures location validity, not the truth of the vulnerability explanation.
- Each case records actual elapsed time and fingerprint. Each is one timed run;
  sixteen deliberately selected cases are not a representative statistical sample.
  Static model requests: 0; model tokens: unavailable/not applicable.

The existing four-case cross-file JS/TS contextual benchmark was also rerun:
[mock pipeline results](audits/phase5a/mock-contextual-review.json). It accepts
2/2 supplied bug findings and yields zero findings on 2 clean fixtures, with
2,699–2,856 bytes of retrieved context, one mock request per case and no measured
token usage. **Those outputs are canned. They establish retrieval/validation
behavior, not AI detection accuracy.** No live-model precision/recall, latency,
token consumption or cost was measured or invented.

## Release verification

[Check receipts](audits/phase5a/checks.json),
[Node 20 archive smoke](audits/phase5a/package-node20.json),
[Node 24 archive smoke](audits/phase5a/package-node24.json).

| Check | Actual result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed. Locked development tools installed; install hooks disabled. |
| `npm run check` on Node 24.20.0 | **1,041 tests passed; 0 failed/cancelled/skipped.** Optional semantic compiler explicitly configured. Full tests ~28.0 s. Typechecks, build consistency, supply-chain guards and architecture checks passed. |
| Full `node --test` on Node 20.20.2 | **1,041 passed; 0 failed/cancelled/skipped**, ~24.9 s. Not just a version/help smoke. |
| `npm run security:audit` | Passed policy: **0 unaccepted advisories, 1 tracked low vendored advisory**. This is not zero vulnerabilities. |
| `npm run editor:package` | Passed; local `integrations/vscode/dist/onboarder-0.1.0.vsix`, no Marketplace publication. Real VS Code GUI not exercised. |
| `npm pack --dry-run` | Passed; 822 files, 5,593,969 compressed bytes / 22,175,775 unpacked bytes. No source tree, tests, `.codex`, `.env` directory or installed `node_modules` included. |
| Local archive installation | Passed offline on Node 20 and 24 into fresh prefixes/homes with `--ignore-scripts --omit=dev`; zero core runtime dependencies. Version, static/staged JSON, SARIF, explicit AI-unavailable status, MCP self-check and separate-process CLI fix lifecycle pass. |
| Build/architecture | 468 generated JS/declaration files consistent; 23 locked dependencies, 98 vendor assets; 0 architecture violations. Generated files built, not manually edited. |

Tested archive SHA-256:
`f348cd656f9210bf904bf1d335490fbaa1ce398a52bef68c13afa055779fa1d6`.
The packaged CLI test uses a mock local HTTP model but **actually executes** its
baseline and result Node tests. No development dependencies/source tree are
installed into the archive's prefix; the external audit harness supplies fixtures.
All 822 packaged file contents were also compared against the final working tree,
with zero mismatches. Audit reports/benchmark artifacts remain development-only
and were not added to the npm package allowlist.

The optional compiler was installed outside the repository, pinned to 5.9.3 and
with scripts disabled. The Node 20.20.2 binary came from the official Node release
archive and matched its [published checksum](https://nodejs.org/download/release/latest-v20.x/SHASUMS256.txt):
`466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6`.
Node 22, Windows, Linux, Firefox, WebKit, live private/App credentials, deployment
TLS, sustained multi-user load and real provider/Hermes quality remain unverified.

## Outstanding findings and beta gates

| Priority / ID | Finding | Required next action |
| --- | --- | --- |
| P1 / SCOPE-01 | Full Phase 4 acceptance is unmet: no planner or post-merge drafts; incomplete Change Stack/integrations/team workspace. Entire requested workflow cannot complete. | Define the first beta around actually verified Explore/Intelligence/Review/Fix/Triage capabilities; explicitly mark unavailable features. Complete other milestones separately, without expanding this audit into a rewrite. |
| P1 / RELEASE-01 | Audited features are uncommitted; all feature branches share the old release commit and package still reports 1.0.5. No immutable release candidate represents this snapshot. | Review preserved changes, create a traceable candidate/version/commit and rerun release checks/package smoke on that exact candidate. Do not advertise this as already published functionality. |
| P1 / QUALITY-01 | Static review misses four selected logic/integration bugs and generates three clean-case warnings; one sink is miscategorized. AI quality is unknown. | Fix focused lexical classification/comment/empty-sink cases with language-aware evidence; retain the benchmark as a guard. Conduct an explicitly authorized live-model evaluation before claiming general bug-detection quality. Do not use an empty review to approve merging. |
| P1 / INTEGRATION-01 | Live provider/Hermes/App/private access and real editor operation not validated. Remote PR #7 also has observed failing CI whose root cause is outside this audit. | Use a controlled test repository/account and minimal scopes for read-only integration checks; inspect the relevant candidate's CI before beta. Keep content writes disabled until separately authorized. |
| P2 / TEAM-01 | Comments accept syntactically valid caller-provided fingerprints without checking a server-known snapshot. | Label these as asserted revisions now; bind future review decisions to known snapshots and test stale/missing revision behavior before enabling approval semantics. |
| P2 / PERF-01 | Context scan/semantic work peaks around 240 MiB in this fixture; large scans/graphs intentionally truncate. No sustained-load budget established. | Retain caps and visible coverage; profile retrieval allocations, add a many-file/wide-graph soak and cancellation memory measurements before raising limits. Do not silently expand context sent to models. |
| P2 / COMPAT-01 | Host verification covers macOS ARM64 Node 20/24 and Chromium; optional compiler setup is separate. | Add Linux/Windows/Node 22 CI and real VS Code activation. Show semantic unavailability clearly when the optional engine is absent. |
| P2 / DEP-01 | Existing low KaTeX advisory is accepted, not remediated. | Recheck the official Mermaid bundle/advisory before beta and by 2026-11-09; update vendor bytes/inventory and rerun browser security tests together. Do not falsify embedded versions or suppress the advisory. |
| P2 / DOC-01 | Historical verification files describe earlier test/skip counts and cannot establish current completion. | Treat this dated report as the current audit and retain explicit unreleased/partial labels. Document the candidate's supported trust model and beta scope in release notes. |

No confirmed critical vulnerability was left unfixed. No claim is made that all
high-risk scenarios have been exhaustively ruled out. Broad review-rule redesign,
new team/plan/automation modules, vendor major upgrades and a hosted sandbox are
outside this remediation scope.

## Audit change inventory and reproduction

Changes made by this audit, in addition to the preserved earlier development:

- Transport/compatibility: `src/server/llmProxy.ts`, `src/public/js/api.ts`.
- Check authorization: `src/cli/agent/checks.ts`, `src/shared/review/fixContracts.ts`.
- App scope: `src/server/intelligence/githubAutomation.ts`.
- Deadlines: new `src/server/security/deadline.ts`; `src/server/reviewAI.ts`,
  `src/server/fixProposal.ts`, `src/server/triageAI.ts`.
- Tests/benchmarks: new `tests/productionReadiness.test.js`,
  `tests/fixtures/readiness/cases.json`, `scripts/audit-readiness.mjs`,
  `scripts/audit-package.mjs`.
- This report and `docs/audits/phase5a/*.json`; compiled counterparts generated by
  `npm run build`. Local project memory is updated privately and remains excluded.

Run from a trusted development checkout. The audit runners create synthetic Git
repositories/worktrees and execute only their explicitly defined regression
checks; they do not apply fixes to this repository or contact a model/GitHub.
The performance runner starts a temporary loopback health server. The quality
and workflow runners are offline. Performance requires a trusted optional Compiler
API path; an unavailable compiler is an explicit benchmark failure.

```bash
npm ci --ignore-scripts
npm run build
node scripts/audit-readiness.mjs quality /tmp/review-quality.json
node scripts/audit-readiness.mjs e2e /tmp/fix-workflow.json
ONBOARDER_TYPESCRIPT_MODULE=/absolute/trusted/typescript/lib/typescript.js \
  node scripts/audit-readiness.mjs performance /tmp/performance.json
node scripts/benchmark-review.mjs --output /tmp/mock-contextual-review.json

ONBOARDER_TYPESCRIPT_MODULE=/absolute/trusted/typescript/lib/typescript.js npm run check
npm run security:audit
npm run editor:package
npm pack --dry-run
# First create the destination directory. Neither command publishes.
npm pack --pack-destination /tmp/onboarder-audit
node scripts/audit-package.mjs /tmp/onboarder-audit/codebase-onboarder-1.0.5.tgz /tmp/package-audit.json
```

First-beta sequence: agree on the narrower verified scope, review and freeze an
immutable candidate, resolve targeted review-quality problems, validate one live
opt-in provider and the intended read-only integrations, broaden platform CI,
recheck the vendored advisory, then invite trusted local users with clear coverage,
execution-permission and recovery instructions. Publishing/deployment remains a
separate human-authorized decision.
