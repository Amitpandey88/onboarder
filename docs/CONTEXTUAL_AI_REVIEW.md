# Contextual AI code review — Phase 2

Included in Onboarder 1.1.0. The dated verification below records original
development; current release scope is in [the release notes](RELEASE_1.1.0.md).
Nothing is automatically published, executed in the reviewed repository, or posted
to GitHub. Core runtime dependencies remain zero; Node.js 20+ is required.

## Use it

Offline review remains the default:

```bash
onboarder review .
onboarder review . --staged --sarif
```

Enable contextual review explicitly:

```bash
onboarder review . --ai
onboarder review . --staged --ai
onboarder review . --base main --head feature --ai
onboarder review . --ai --json
onboarder review . --ai --sarif
onboarder review . --ai --ai-connection hermes
```

For an HTTP chat-completion endpoint, reuse the existing CLI environment settings:

```bash
export ONBOARDER_AI_BASE_URL=http://127.0.0.1:11434/v1
export ONBOARDER_AI_MODEL=YOUR_INSTALLED_MODEL
# Set ONBOARDER_AI_API_KEY privately only if your endpoint needs authentication.
onboarder review . --ai
```

`OPENAI_BASE_URL`, `OPENAI_MODEL` and `OPENAI_API_KEY` remain compatible aliases.
Explicit `--base-url`/`--model` flags take precedence, followed by environment,
then the endpoint/model in existing user settings (`onboarder config`, `--config`).
No endpoint, model or credential is bundled. Local compatible endpoints need no
key. Existing provider request adapters support API-compatible/Azure, Anthropic
and Gemini responses; provider selection retains the existing key-prefix behavior.
Keys come from environment for CLI or tab memory for browser requests, never repo
configuration. No hosted Onboarder account or paid subscription is required.

`--ai-connection hermes` uses the existing Onboarder Hermes profile and provider;
configure it with `onboarder agent model`. Its bridge disables machine tools and
repository instructions. Browser model/key overrides do not replace Hermes login.

In **Review**, choose **Static · offline** or **AI-assisted · selected source**.
The latter uses **AI connection** settings. Run shows collection, reasoning and
validation progress; **Cancel** aborts it. Severity/category groups and source
filters distinguish static patterns from AI inferences. **Show AI explanation**
reveals the stored reasoning, potential impact and confidence basis without another
model request. Evidence buttons open captured, redacted source with revision,
range and SHA-256; changed-file links retain the exact patch. Keyboard Escape
closes dialogs and restores focus. JSON, Markdown and SARIF include AI provenance,
coverage and failure status. A zero-finding review never certifies safety.

The older optional **reviewer’s brief** remains a separate explicit follow-up and
uses its existing provider path. It is not a second contextual finding pass.

CLI exit codes: 0 for a completed review without a triggered gate; 1 for the
existing severity/conflict gate; 2 when requested AI is unconfigured, failed,
stale or partial. Static results are still printed for an incomplete AI pass.
Without `--ai`, provider settings are not loaded and no model request occurs.

## Pipeline and evidence

1. **Collect.** Phase 1 supplies working, staged or merge-base-to-head comparisons,
   exclusions, guidelines, redaction and immutable configuration provenance.
2. **Retrieve.** The existing scanner/language parsers, graph/facts, route detection,
   architecture rules and optional compiler select relevant evidence. No second
   indexing engine is introduced. Changed added lines and enclosing lexical symbols/
   exports lead the ranking, followed by compiler references/calls, graph importers,
   dependencies and statically reachable tests. Boundary declarations/violations,
   discoverable routes and existing findings accompany the selected excerpts.
3. **Reason.** One bounded request uses the user's provider and model. A fixed
   system instruction separates repository-controlled JSON from instructions and
   asks for actionable logic, authorization, validation, async, API, integration,
   breaking-change, performance, test and policy concerns.
4. **Validate.** JSON schema version and explicit model coverage acknowledgement,
   category/severity/profile, changed path/added
   line, citation ID, line interval and exact quoted text are checked. Cross-file
   contract/integration findings require related-file evidence. Unsupported entries
   are rejected individually; malformed overall output fails the AI pass. Matching
   rule/location and conservative text overlap suppress duplicate static/AI findings.

Staged context reads captured index blobs; committed context reads immutable head
objects. Dirty working files cannot replace those sources. Working capture validates
patch lines against captured source. The selected source hashes, index marker and
comparison fingerprint are checked before submission and after reasoning. A detected
edit discards AI findings and marks the AI report stale. No model response cache or
provider credential is persisted; exact captured data is reused only inside its run.

Reports retain existing fields and add optional `schemaVersion: 2`, `ai` version 1,
and finding fields: `source`, `title`, `impact`, `confidence`, `confidenceReason`,
`relatedEvidence`, `engine`, `revision`, `sourceFingerprint`, `verification`.
AI IDs depend on path/line/rule, not prose wording. Confidence is the model's stated
level, not a measured probability. `evidence-validated` means cited locations and
quotes were checked; it does **not** mean the predicted behavior was reproduced.
The UI and exports state that distinction. Existing static location IDs and SARIF
v1 partial fingerprints remain compatible.

## Limits, privacy and permissions

| Control | Default | Accepted range |
| --- | --- | --- |
| `--ai-max-context-bytes` / `maxContextBytes` | 60,000 | 4,000–100,000 UTF-8 bytes |
| `--ai-max-excerpts` / `maxExcerpts` | 20 | 2–40 |
| `--ai-max-changed-files` / `maxChangedFiles` | 30 | 1–100 |
| `--ai-max-tokens` / `maxOutputTokens` | 3,000 | 128–4,096 |
| `--ai-timeout-ms` / `timeoutMs` | 60,000 | 1,000–120,000 ms |
| `--ai-max-requests-per-minute` / `maxRequestsPerMinute` | 3 per repository/process | 1–10 |

The web limit controls expose context bytes and output tokens; the API's `limits`
object accepts all fields above. Each contextual pass makes at most one model
request, with no automatic retries. Two contextual passes may run concurrently.
Root-based admission counters are process-local, not a distributed account quota.

Local indexing caps 2,000 walked files, 200 KiB per text file and 32 MiB captured
source. Excerpts retain whole lines within 4,000 bytes each. Source outside the
selected context is not sent. Prompt messages cap at 120,000 bytes; API responses
at 256 KiB and extracted answers at 128 KiB. The existing API transport has a
60-second upper request timeout. Hermes retains its profile and tool-free bridge:
byte/time/turn/concurrency bounds apply, but its current bridge cannot enforce the
API output-token field or return token receipts. That limitation is in each Hermes
report. Provider-reported output truncation or a model's explicit
`analysisComplete: false` is partial, never a clean completion.

Source containment, regular-file and symlink/submodule restrictions are reused.
Exclusions apply to changed and related source. Known literal/environment secrets
and the active browser-supplied API key are redacted before submission and from
retained display text. Multiline redaction preserves source coordinates. Model text
is escaped in the browser and terminal control sequences are removed. Credentials
are never inserted into prompts, response artifacts or logs; upstream error bodies,
URLs and authentication payloads are not echoed by the contextual transport.

Repository comments, docs, policies and issue-like text are untrusted. Prompt
separation, no machine tools, secret redaction, bounded retrieval, citation validation
and escaped rendering reduce injection consequences; they do not prove a model's
reasoning true or make arbitrary repository instructions trustworthy. No repository
scripts run to infer relationships, and no GitHub write is enabled by this feature.
Existing GitHub webhook reviews stay deterministic with publication off by default.
Team members retain offline review grants; source transmission/provider-backed AI
review requires the owner and does not expose owner Hermes credentials to members.

## Benchmarks and verification

From a source checkout:

```bash
npm run benchmark:review
node scripts/benchmark-review.mjs --output /tmp/review-benchmark.json
# Only when explicitly choosing to send synthetic fixtures to a configured model:
node scripts/benchmark-review.mjs --live
```

Four reproducible fixtures cover JS/TS authorization becoming asynchronous with
an unawaited caller (buggy) or an already-awaiting caller (clean). Default benchmark
outputs are canned model responses: they measure real retrieval/validation, context
bytes and elapsed pipeline time. Detection and false-positive counts describe the
mock harness, not a live model's detection ability. Token usage is null when no real
provider receipt exists. The live mode reports actual provider receipts if supplied;
four synthetic cases still cannot establish production accuracy.

Executed on Node.js 24.20.0 on 2026-10-21:

| Verification | Actual result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed with isolated cache after the restricted-network attempt failed; lifecycle scripts disabled, four platform development packages installed, zero npm vulnerabilities. |
| `npm run check` | Passed: **977 tests, 976 passed, zero failed, one skipped** optional compiler integration because the separately installed API engine was unavailable. Type/build, 428 generated JS/declaration checks, supply-chain guard and architecture gate passed. |
| `npm run security:audit` | Passed with zero unaccepted advisories. Existing low KaTeX GHSA-238p-pmpm-9mq7 remains tracked through 2026-11-09; it is not fixed. |
| New regression coverage | 19 contextual tests, four actual CLI/HTTP tests with a local mocked endpoint, and one structured Hermes bridge regression. Existing review, GitHub, intelligence, MCP, terminal, editor, auth and analyzer regressions remained functional. |
| Browser | Playwright skill verified controlled-model Review flows, source/category filters, individual explanation, evidence/patch dialogs, Escape, cancellation, all exports, light/dark themes and a reachable finding at 390px with no document overflow or page errors. |
| Packaged application | Actual 759-file archive installed with scripts/dev dependencies disabled. Offline CLI made zero model calls; AI CLI and HTTP reviews accepted the cited auth finding through a local mocked provider. New browser asset and guide were present; zero runtime dependencies. |
| Diff review | `git diff --check` passed; source, generated outputs and packaging changes reviewed for security and unintended scope. |

The first full run caught the package fixture omitting its newly required `cli`
directory and a frontend heuristic treating the UI phrase “request(s)” as a call.
The fixture and wording were corrected; checks were rerun to the final passing
result. A restricted standalone package-guard attempt also lacked npm cache write
permission; the full permitted run passed. No rejected automatic approval action
or unresolved test failure remains.

Final default benchmark, **canned responses / no live inference**:

| Fixture | Expected outcome retained | Context bytes | Local mock pipeline ms | Model token usage |
| --- | --- | --- | --- | --- |
| TypeScript unawaited auth caller | 1 cited finding | 2,679 | 79.66 | Not measured |
| JavaScript unawaited auth caller | 1 cited finding | 2,613 | 58.20 | Not measured |
| TypeScript awaiting caller | 0 findings | 2,693 | 55.95 | Not measured |
| JavaScript awaiting caller | 0 findings | 2,627 | 55.87 | Not measured |

Harness detection: 2/2 known bug cases retained, zero findings across two clean
cases; each made one mocked call. These are pipeline outcomes from predefined
answers, not model accuracy, live latency or paid usage. Raw receipts for this run
are under `/tmp/onboarder-phase2-benchmark.json`; rerunning records new timings.
No live-provider quality, live GitHub writes or Node 20/22 runtime matrix was tested.

## Changed files

New implementation modules: `src/shared/review/aiContracts.ts`,
`src/server/reviewContext.ts`, `src/server/reviewAI.ts`, `src/cli/review.ts`,
`src/public/js/reviewAI.ts`. Existing contracts, deterministic engine and SARIF
export are extended in `src/shared/review/`; `src/server/llmProxy.ts` shares request
construction with its bounded completion adapter. `src/server/hermesChat.ts` shares
one tool-free bridge between streaming explanations and structured reviews.

Other modified source: `src/cli/main.ts`, `src/server/apiReview.ts`,
`src/server/router.ts`, `src/server/index.ts`, `src/server/intelligence/workspace.ts`,
`src/server/intelligence/semantic.ts`, `src/server/intelligence/team.ts`,
`src/public/js/reviewView.ts`, `src/public/js/reviewPatch.ts`,
`src/public/js/state.ts`, `public/workbench.css`.

Tests and benchmark: `tests/contextualReview.test.js`,
`tests/contextualReviewIntegration.test.js`, `tests/helpers/contextualReview.mjs`,
`tests/fixtures/contextual-review/cases.json`, `tests/hermesWeb.test.js`,
`tests/supplyChainGuard.test.js`, `scripts/benchmark-review.mjs`.
Packaging/docs: `package.json`, `scripts/check-supply-chain.mjs`,
`README.md`, `docs/ADVANCED_FEATURES.md`, this guide. TypeScript regenerates outputs;
tracked generated changes include `cli/main.js`, `public/js/state.js`,
`server/llmProxy.js`, `server/router.js`. Earlier Phase 1 source,
generated outputs, tests and documentation remain in the working tree. Project
memory is updated locally and remains excluded from Git and npm packages.

## Remaining limits and Phase 3

Lexical symbols/imports are approximate; the optional trusted TypeScript compiler
improves references without executing code or loading repository plugins. Dynamic
calls, external libraries, generated code and unsupported frameworks can remain
unresolved. Other languages use conservative labeled fallback. Findings must anchor
to added lines; deletion-only changes and evidence outside the excerpt budget may
require human review. Capture and final recheck are not an atomic filesystem snapshot.
Model hypotheses can still be wrong despite real citations. IDs track locations,
not semantic identity through arbitrary line movement. No live-provider accuracy,
paid-model behavior or distributed quotas are established by mock tests.

For Phase 3, reuse the existing isolated fix/checkpoint harness. Require explicit
file/check permission, fresh source hashes, proposed patches and rollback, then run
only authorized checks and retain actual execution receipts. Evaluate patch correctness
and adversarial prompts on a larger labeled corpus before automatic application.
Keep model inferences, source checks and executed test results separate. Add compiler
backed symbol ranges, richer deletion evidence, trusted-base policy, retry/admission
coordination and calibrated model evaluation as distinct follow-up work.
