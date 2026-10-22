# Unified review foundation — Phase 1

Included in Onboarder 1.1.0. This guide also retains the original 2026-10-21
development record, when package version was 1.0.5. Historical verification does
not imply live provider testing; see [the current release notes](RELEASE_1.1.0.md).

## Findings and implementation

The existing portable review engine already provided deterministic location IDs,
profiles, path exclusions, guidelines, changed-line filtering, redaction and SARIF.
The GitHub worker already verified webhook signatures, restricted repositories,
persisted jobs and published optional Check Runs. These mechanisms are extended.

The inconsistencies were GitHub's unconditional default rules, local committed
comparisons reading working-tree config, concurrent delivery races around receipt
creation, missing patch/status metadata, and a PR recheck preceding a potentially
slow Check Run lookup. Findings also lacked explicit evidence/freshness metadata.

| File | Change |
| --- | --- |
| `src/shared/review/contracts.ts` | Optional static-evidence and configuration provenance; additive coverage status/file count. Existing fields remain. |
| `src/shared/review/review.ts` | Shared safe JSON parser, stricter invalid-schema detection, static evidence metadata, explicit patch coverage and Markdown provenance. |
| `src/shared/review/sarif.ts` | Preserve existing v1 location fingerprint; include optional provenance/coverage properties. |
| `src/server/gitDiff.ts` | Bounded immutable configuration-object/index reads; disable Git replacement objects and executable filesystem monitors. |
| `src/server/review.ts` | Select config from working tree, index or reviewed head; bounded no-follow working config reads. Explicit CLI profile overrides remain. |
| `src/server/reviewEvidence.ts` | Common report fingerprint and retained redacted comparison policy for both review paths. |
| `src/server/intelligence/githubReview.ts` | Exact commit/tree/blob config lookup and hash validation; validated PR file adapter with honest patch skip reasons/counts/status. |
| `src/server/intelligence/githubAutomation.ts` | Serialized intake/startup, revision/grant rechecks, bounded recovery lookup, no appended duplicate annotations, neutral partial checks and bounded receipts. |
| `src/cli/agent/tools.ts` | Forward existing cancellation signal into the local review tool. |
| `tests/advancedIntegrations.test.js` | Update existing GitHub mocks for explicit immutable configuration lookup. |
| `tests/unifiedReview.test.js` | Isolated Git repositories and mocked HTTP GitHub responses for the regression cases below. |
| `tests/supplyChainGuard.test.js` | Extend the package fixture and verify that missing new review modules/guide fail the guard. |
| `docs/ADVANCED_FEATURES.md` | Configuration behavior, freshness, fork handling, recovery and operating limits. |
| `docs/UNIFIED_REVIEW_FOUNDATION.md` | This implementation, verification, file inventory and limitations report. |
| `package.json` | Include this implementation/verification guide in the existing package file allowlist; version and dependencies remain unchanged. |
| `scripts/check-supply-chain.mjs` | Allow exactly the additional guide and require the new generated modules/guide in the package. |
| `server/gitDiff.js` | Existing tracked generated output, rebuilt through the TypeScript build. Other generated outputs remain under the existing ignore policy. |

The checked-in `.onboarder-review.json` needs no schema migration. Browser Review
continues using the existing fields and already displays checks, skip reasons and
scope limitations. No runtime dependency, browser/server boundary or command is
added or removed.

## Regression coverage

The new suite covers:

- Local range/GitHub parity for profiles, path globs, guidelines and finding IDs;
  working-tree edits cannot replace the reviewed commit's config.
- Staged config isolation, confirmed missing defaults, malformed JSON, null/unknown
  schema fields, symlinks and oversized configuration.
- Fork reviews and 401/403/404/rate-limit failures without unauthorized fallbacks;
  object identity mismatches, truncated trees and invalid blob encodings.
- Repeatable finding IDs/report fingerprints, reviewed revisions, static provenance
  and freshness, legacy Markdown/SARIF reports with metadata absent, and redaction.
- Concurrent duplicate intake, startup/restart recovery, existing Check Run reuse,
  changed PR commits and distinct job identities.
- Heads/bases changing or PRs closing before/during publication preparation;
  revoked grants and publication being disabled during analysis.
- Omitted/malformed patches, file-count mismatch, pagination limits, excluded files,
  rename/deletion metadata and neutral incomplete Check Runs.
- Authorization rejection, bounded Check Run lookup and existing client cancellation
  and response-size limits.
- Oversized retained evidence/report metadata and package omission of required new
  modules or documentation.

All GitHub calls in these tests use injected mocks. No test can publish to a real
repository through these fixtures. Existing webhook signature, HTTP permissions,
CLI, terminal, editor, MCP, Hermes and intelligence tests remain in the full check.

## Verification

Executed on Node.js 24.20.0:

| Check | Actual result |
| --- | --- |
| `npm ci --ignore-scripts` (isolated cache) | Passed after retry with network permission; four platform development packages installed; zero npm vulnerabilities. |
| `npm run check` | Passed: 953 tests, 952 passed, zero failed, one skipped optional compiler integration because `ONBOARDER_TYPESCRIPT_MODULE` was not configured. Type checks, build, 418 generated-output checks, supply-chain guard and architecture gate passed. |
| `npm run security:audit` | Passed with zero unaccepted advisories; existing low KaTeX advisory GHSA-238p-pmpm-9mq7 remains explicitly tracked until 2026-11-09, not fixed. |
| Unified-review regression suite | 20 passed; a further package-guard omission regression passed in the full suite. |
| Isolated package smoke | Actual archive, install with scripts/dev dependencies disabled, required new modules/guide present, and CLI review/config/provenance passed. Package contains 743 files; core runtime dependencies remain zero. |
| `git diff --check` | Passed. Final source/generated diff reviewed for security and unintended changes. |

Initial restricted attempts failed to download development dependencies or bind
local HTTP test servers; the permitted retries completed. A later full check caught
the new guide missing from the package guard's separate allowlist, then its fixture
missing the newly required modules. Both were corrected and the final full run
passed. These intermediate failures are not represented as successful runs.

No Node 20/22 matrix, live GitHub App/webhook, real publication or browser interaction
was tested in this task. Existing browser, terminal, CLI, MCP, Hermes, editor and
HTTP regression tests ran as part of the full suite. Mocked integration success is
not proof of a deployed GitHub App or webhook. The project memory was also updated
locally in `.codex/PROJECT_MEMORY.md`, which remains excluded from Git and the package.

## Security and remaining limits

- Configuration is declarative untrusted data. Only regular root blobs up to 64 KB
  are read, using the allowlisted repository and immutable SHA. A missing-resource
  error is never treated as proof of missing config. GitHub's authenticated response
  supplies the commit/tree linkage; the blob is additionally checked against its
  Git object ID. No repository scripts or AI calls run.
  API references: GitHub's [Git commits](https://docs.github.com/en/rest/git/commits#get-a-commit),
  [Git trees](https://docs.github.com/en/rest/git/trees#get-a-tree) and
  [Git blobs](https://docs.github.com/en/rest/git/blobs#get-a-blob).
- Head config can intentionally exclude files or lower the profile. This phase
  reports its origin and skipped scope; it does not impose a separate trusted-base
  policy. Maintainers should review config changes before trusting a clean result.
- Publication stays opt-in. Existing exact-byte HMAC verification, permissions,
  request timeouts, 1 MB webhook, 2 MB API-response, 5 MB patch, 300-file pagination,
  50-annotation and private 8 MB receipt bounds remain. Oversized retained source
  is omitted explicitly; oversized report metadata fails before publication.
- One automation worker owns a job directory. Intake is serialized inside that
  process and durable receipts suppress redelivery/recovery duplicates. There is
  no distributed lock or new database; active-active workers need a future design.
- A PR can change after the final read. GitHub provides no atomic PR-head predicate
  on Check Run creation; the write always targets the captured head SHA. Freshness
  is an observation at a stated time, not a promise of perpetual currency.
- Local working/index capture is not an atomic filesystem snapshot. Evidence is
  labeled captured, and rerunning updates its fingerprint. Committed range config
  and source are immutable. GitHub's base is the target tip, not a separately
  resolved merge-base SHA; its patch scope is disclosed.
- Stable legacy IDs identify a path/line/rule location. They can move when lines
  move and do not track semantic identity across arbitrary revisions. Findings are
  static patterns requiring human review, without invented confidence or runtime
  verification. Exclusions and unavailable patches remain visible.
- Failed jobs remain visible and duplicate events reuse their receipts. Operators
  may archive failed receipts before a deliberate retry after resolving access or
  configuration issues. Retention remains bounded at 500 files.

## Phase 2 recommendations

Build contextual review on these revision-pinned reports: retrieve bounded source
and dependency evidence at the reviewed commit, keep repository instructions
untrusted, and require AI findings to cite real file/line evidence. Distinguish
deterministic detections from model hypotheses and actual authorized execution.
Add a labeled evaluation corpus before introducing confidence or automatic gates.
Consider a trusted-base configuration policy, semantic finding matching across
revisions, and an explicit multi-worker/retry protocol before scaling publication.
