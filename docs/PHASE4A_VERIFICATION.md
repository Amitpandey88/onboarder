# Phase 4A verification — 2026-10-22

Historical development verification. The implemented triage milestone is included
in Onboarder 1.1.0; see [release notes](RELEASE_1.1.0.md) for the current release
scope. The branch/version/test counts below describe the earlier source snapshot.

This record covers the local, unpublished `codex/advanced-platform` source build.
Existing Phase 1–3 changes and unrelated untracked work were preserved. Package
version remains 1.0.5. No push, merge, publication, deployment, App installation,
reviewer assignment or GitHub content write was performed.

Milestone 4A is the delivered scope, following the Phase 4 brief's instruction to
prioritize a complete triage foundation when the full phase cannot fit one run.
Phase 4B–4F are unfinished. See [the guide](PR_TRIAGE.md) for behavior and limits.

## Architecture and file inventory

- New portable contracts and scoring: `src/shared/triage/contracts.ts`, `priority.ts`.
- New read-only provider interface and actual GitHub adapter:
  `src/server/providers/contracts.ts`, `github.ts`.
- New shared triage and optional model services: `src/server/triage.ts`, `triageAI.ts`.
- New owner-only HTTP route handler: `src/server/apiTriage.ts`; existing
  `router.ts` and `index.ts` connect it to normal origin/auth/session gates.
- New CLI `src/cli/triage.ts`; existing `src/cli/main.ts` dispatch and help.
- New browser workspace `src/public/js/triageView.ts`; existing app shell, DOM
  types, workspace preferences, Review navigation and CSS connect it.
- Existing GitHub client now exposes safe structured rate-limit receipts; existing
  GitHub App automation supplies read-only allowlisted clients with revocation checks.
- Existing intelligence revision snapshots now carry scan coverage and accept
  cancellation/file limits; target-revision rules and graphs are reused.
- Existing MCP tool catalog adds `onboarder_triage` with explicit source opt-in
  and external-system annotations.
- Existing VS Code extension/manifest/README add the triage command and explicit
  CLI error handling; its process, trust and script-disabled panel controls remain.
- New `tests/triage.test.js`, `tests/helpers/triageFixture.mjs`; editor activation
  assertions and supply-chain package guard fixtures are extended.
- README, advanced features, packaged-file allowlist and triage guides updated.
  Generated JavaScript is produced only by the TypeScript build.

Existing files extended specifically for this milestone (earlier uncommitted
Phase 1–3 files remain in the working tree as well):

- `src/cli/main.ts`, `src/cli/agent/github.ts`
- `src/server/index.ts`, `src/server/router.ts`, `src/server/mcp/tools.ts`
- `src/server/intelligence/githubAutomation.ts`, `workspace.ts`
- `src/shared/intelligence/contracts.ts`, `analysis.ts`
- `src/public/app.ts`, `src/public/js/dom.ts`, `reviewView.ts`, `workspacePreferences.ts`
- `public/index.html`, `public/workbench.css`
- `integrations/vscode/extension.cjs`, `package.json`, `README.md`
- `tests/editorIntegration.test.js`, `tests/mcp-advanced.test.js`, `tests/supplyChainGuard.test.js`
- Root `README.md`, `package.json`, `docs/ADVANCED_FEATURES.md`, `scripts/check-supply-chain.mjs`

The new files are listed in the architecture inventory above; the TypeScript
build also updates their generated JavaScript, declarations and source maps.
Local project memory is updated and remains excluded from Git/package publication.

## Executed checks

Verification uses Node.js 24.20.0; Node 20 was not separately exercised.

- `npm ci --ignore-scripts`: passed; locked development packages installed, no
  install scripts, zero reported dependency vulnerabilities in this install step.
- Targeted triage/editor/MCP runs passed, including a 45-test combined run before
  the final ownership regression was added. The final full suite below contains
  all 31 new triage regressions. GitHub/model responses
  are mocked; temporary Git commits, architecture reads, CLI processes, HTTP
  authorization requests and VSIX packaging actually execute.
- `npm run editor:package`: passed; local
  `integrations/vscode/dist/onboarder-0.1.0.vsix` generated. No Marketplace upload.
- `npm run check`: passed — **1,027 tests, 1,026 passed, zero failed, one skipped**
  (the optional separately installed TypeScript semantic compiler is unavailable).
  Build consistency verified 466 generated JS/declaration files. Supply-chain
  checks verified 23 locked dependencies, 98 vendor assets and 819 package files.
  Architecture boundary checks returned no violations. The full test run took
  about 18.67 seconds; this is one observed run, not a statistical benchmark.
- `npm run security:audit`: passed its configured policy gate: zero unaccepted
  advisories, with one existing tracked low KaTeX advisory,
  [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7),
  review due 2026-11-09. It remains outstanding and is not claimed fixed.
- Final local npm archive: 819 files, zero runtime dependencies. Extracted outside
  the checkout and successfully ran version, actual offline review/SARIF, controlled
  GitHub queue/inspection, a real MCP process handshake and stdio triage; CLI/MCP
  review fingerprints matched. New provider/API/browser modules and both guides
  were present. No package installation scripts or publication ran.

## Live versus controlled verification

The actual CLI retrieved a live two-row PR page from `Amitpandey88/onboarder` and
inspected live PR 7 at head `9ded9655a515cec94d6f7f3a91fb220edfa821b0`.
At observation, five checks were returned, at least one failed, two changed files
had complete deterministic patch coverage, ownership was missing, review was
waiting, priority was P1, and readiness was blocked. This is a dated observation,
not a claim about the PR's current state. No comments or other writes were made.
The live list took about 0.72 seconds and inspection about 6.49 seconds on this
machine/network in a single run. These are smoke-test wall times, not throughput
benchmarks or a statistical latency estimate.

Controlled regression tests cover deterministic priorities and mandatory floors,
unknown/passed/pending/failed/neutral CI, exact-head decisions, stale observations,
CODEOWNERS target revision and comments, configuration failures, filters/sorting,
pagination, missing/malformed patches, rate-limit receipts, provider budgets,
foreign paths/revisions, optional model response validation, credential redaction,
prompt-injection data, timeout/cancellation, real Git cross-file impact, CLI/MCP
consistency, HTTP permissions/origin gates and App allowlist revocation.

A real browser against a local test server exercised scanning, queue loading,
inspection, CODEOWNERS, escaped hostile HTML, captured patch preview, Triage →
Review → Triage, a mocked model explanation, JSON download, search/security
filters, light/dark themes, a 390-pixel viewport without horizontal document
overflow, cancellation, and a delayed-response PR-switch race. Switching PRs
  cancels/discards the old model result, with repository/number/head checked again
  before displaying an explanation. No page JavaScript errors were observed. Model and
GitHub responses in this browser run were controlled fixtures. Screenshots were
inspected locally. This used the Playwright CLI workflow; it did not execute
repository test scripts from a pull request.

Live private-repository credentials, GitHub App installation authentication,
commercial/local model endpoints and the real VS Code GUI were not verified.
The extension's activation, real CLI integration and VSIX archive are tested
locally using a controlled VS Code host. Mock model success is not a live-model
integration claim.

## Reproduce locally

```bash
npm ci --ignore-scripts
npm run build
node --test tests/triage.test.js tests/editorIntegration.test.js
npm run check
npm run security:audit
npm run editor:package
node bin/onboarder.js triage list Amitpandey88/onboarder --limit 2 --json
node bin/onboarder.js triage inspect Amitpandey88/onboarder --pr 7 --json
```

For the browser, start the normal local server, scan your checkout and open
**Triage**. Loading a real page is read-only and does not require a model. Inspect
one PR, open a captured patch, open its Review findings, then return. Configure
your own endpoint only if you explicitly want the optional model explanation.
For revision-pinned local architecture, explicitly fetch the desired commits
before inspection; triage itself never fetches, checks out, tests or mutates them.

## Limitations and follow-up

- Loaded-page sorting cannot rank uninspected or unloaded repository PRs globally.
- Branch protection/ruleset/required-check completeness is not established;
  successful observed checks alone do not produce merge readiness.
- Architecture needs local immutable commits and matching origin, uses syntax and
  import relationships, and marks scan limits/unsupported input partial.
- Ownership supports conservative common CODEOWNERS patterns; unavailable team
  membership/reviewer permissions are disclosed. Human urgency is session-only.
- Queue data is not a durable team review database; provider credentials remain
  owner-only. No new shared roles or feedback-driven policy exceptions were added.
- GitHub is the only implemented provider. No immutable cache, background polling,
  automatic model retry, planner, new semantic diff workspace or post-merge draft
  automation is claimed here.
- Readiness establishment, scoped team delegation and broader live integration
  testing should accompany later milestones; complete 4B and 4C before claiming
  the complete exploration → planning → implementation platform.
