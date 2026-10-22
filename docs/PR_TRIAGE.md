# PR triage — Phase 4A

Included in **Onboarder 1.1.0**.
Milestone 4A is implemented. Phase 4B–4F are unfinished; this guide does not
claim the complete Phase 4 developer platform. The review and fix foundations
from Phases 1–3 are included in the same release.

## Use it

Build with `npm ci --ignore-scripts` and `npm run build`. Start your existing
Onboarder server, scan a repository, and open **Triage**. Enter `owner/repository`,
or leave the field blank to use the scanned GitHub origin. Browser-picked folders
can inspect an explicitly named GitHub repository, but cannot supply local Git
architecture. Loading a queue does not call an AI provider.

```bash
onboarder triage list Amitpandey88/onboarder --json
onboarder triage list . --state all --page 2 --limit 10 --json
onboarder triage list . --queue stale --sort oldest --search "authentication"
onboarder triage inspect . --pr 7 --json
onboarder triage inspect ./local-checkout --repo owner/repository --pr 7 --ai --json
onboarder triage inspect owner/repository --pr 7 --urgency P0 \
  --urgency-head EXACT_40_CHARACTER_HEAD_SHA --urgency-reason "Active incident"
```

Use `./folder` for a relative folder containing a slash; a bare `owner/name` is
interpreted as a GitHub identity. `--repo` overrides the provider repository;
local architecture still requires its origin to match. Exit 2 reports CLI errors,
stale inspection, unavailable deterministic review, or an incomplete requested AI
explanation. Individual missing signals remain explicitly represented in JSON;
inspect their coverage rather than treating exit 0 as a clean-review verdict.

The web workspace provides one-page navigation, queue filters, search, sorting,
selected PR details, current-head check/review observations, deterministic findings,
CODEOWNERS suggestions, architecture candidates, factor explanations, manual
urgency, captured patches, exact-revision GitHub links and JSON export. **Open
findings in Review** reuses the existing Markdown/JSON/SARIF exports and evidence
viewer. **Return to PR triage** preserves the selected page/PR/filter. A captured
remote review does not authorize fixes or fetch source; Phase 3 still requires a
matching local source snapshot and explicit proposal approval.

Search, queue, sort, state and repository preferences are saved in browser-local
storage. Captured reports, titles, source patches, credentials and urgency are not
persisted there. Up to four repository queues remain in tab memory. No background
polling occurs. Cancel disconnects the current request; old observations retain
their capture time and exact revisions.

## GitHub access and permissions

Public repositories can use unauthenticated GitHub REST access, subject to its
rate limits. Set `GITHUB_TOKEN` or `GH_TOKEN` **in the CLI/server environment** for
private access and higher API quotas. Triage does not receive GitHub credentials
from repository files or browser local storage. Use a repository-scoped token
with read access to contents, pull requests, checks and commit statuses. Grant
only the repositories you intend to inspect. No content-write scope is needed.

A server already configured with the existing GitHub App automation can reuse its
installation authentication. Its repository allowlist is enforced before the
request and checked again before returning results. Triage's installation token
requests only read contents, pull-request, checks and statuses permissions;
it does not enable publishing or create automation jobs. Existing webhook behavior
and opt-in publishing configuration are preserved. Configuring/installing an App
is a separate operator action; this implementation does not install one.

Web triage is **owner-only**. Viewer/reviewer credentials cannot use the owner's
GitHub credential, even when the local repository is in their scan allowlist.
Normal host, origin and authentication gates apply. Local scan IDs bind any local
architecture read; the API never accepts a caller-supplied filesystem root.

The shared read-only provider interface covers repository identity/permissions,
PRs, files, issues, comments, checks, review decisions and commits. GitHub is the
only implemented adapter. GitLab, Bitbucket and Azure DevOps are not supported.

## Priority and readiness

Queue rows initially contain metadata only. Their P0–P3 labels are **provisional**
until inspected. A low metadata score says nothing about unobserved source risk.
Filters and sorting cover the loaded provider page, not the whole repository.
An inspection reuses the unified deterministic PR review and its exact head/config
provenance, retrieves observed checks and review decisions, reads CODEOWNERS at
the **target base revision**, and checks the PR again at completion. Changed base,
head, state or update timestamp makes the capture stale.

Each score has named points and reasons. Defaults:

| Factor | Points |
| --- | ---: |
| Critical finding | 100 |
| High finding | 50 |
| Changed review/ownership/triage policy | 50 |
| New boundary violation or dependency cycle | 30 |
| Removed exported name candidate | 30 |
| Observed failed CI | 25 |
| Authentication/security/payment path heuristic | 20 |
| Large change (500 lines or 25 files) | 15 |
| At least five statically reachable dependent modules | 15 |
| No PR update for 14 days | 15 |
| Incomplete inspected signals | 15 |

Thresholds are P0 ≥100, P1 ≥50, P2 ≥15, otherwise P3. Factors are counted once per
PR, not per finding. Static reachability, sensitive path names and removed exports
are conservative inspection candidates, not proof of a bug or breaking behavior.
No model-generated score is used. A human can escalate a minimum priority for an
exact head with a reason; urgency is session-only and must be reassigned if head
changes. Critical findings always retain P0; high findings and changed trust policy
always retain at least P1, even if repository weights are zero.

Optional `.onboarder-triage.json`, read from the exact target base commit:

```json
{
  "version": 1,
  "thresholds": { "P0": 100, "P1": 50, "P2": 15 },
  "staleDays": 10,
  "largeLines": 400,
  "largeFiles": 20,
  "weights": { "sensitive": 25, "dependency": 20, "failedCI": 30 }
}
```

Unspecified fields inherit defaults. Unknown fields, unsupported versions,
non-integer weights, invalid thresholds and oversized policies fail validation;
the inspection discloses unavailable configuration and uses conservative defaults.
A PR cannot change its own scoring policy by modifying its head version.

Priority and readiness are separate. Failing checks, change requests, high findings,
conflicts and changed trust policy block a PR. Empty, skipped/neutral, inaccessible,
stale or truncated CI never becomes passed. Even observed successful checks do
not establish branch protection, ruleset or required-check completeness. GitHub's
current adapter therefore leaves merge readiness **unknown** when those required
signals are unestablished; the human-approval queue may be empty. No PR is labeled
safe or automatically approved. No merge, reviewer assignment or other GitHub
content write is implemented.

## Architecture and ownership

If exact base/head commits already exist in a matching local checkout, triage
uses the existing Git-object scanner and import graph, starting at their merge
base. Architecture rules come from target base; source never executes or checks
out. It reports added/removed dependencies, new cycles/boundary violations,
reachable callers, candidate tests and disappeared exports. The 500-file ceiling,
unreadable/unsupported source and unresolved imports make coverage partial.
Unavailable commits/origin/configuration make this signal unavailable; triage
never fetches them automatically. Evidence is syntax/static analysis, not compiler
proof of semantic equivalence or measured test coverage.

CODEOWNERS search follows `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`,
first present at base. Last matching supported rule wins. The PR author is omitted;
comment handles and unsupported pattern syntax are not inferred as ownership.
Root anchoring, directory recursion and immediate-file globs follow the common
[GitHub CODEOWNERS rules](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).
Unsupported declarations are labeled partial. Actual team membership, reviewer
availability and write permission are not verified. Git authorship is never used
as ownership. These are suggestions; no assignment is performed.

## Optional model explanation

Click **Explain priority with AI**, or use `triage inspect --ai`. Reuse the existing
[AI connection](CONTEXTUAL_AI_REVIEW.md): configured API endpoint/model, compatible
local endpoint, or `--ai-connection hermes`. CLI environment configuration:

```bash
export ONBOARDER_AI_BASE_URL=http://localhost:11434/v1
export ONBOARDER_AI_MODEL=your-installed-model
# ONBOARDER_AI_API_KEY only if your endpoint requires it; never commit it.
onboarder triage inspect . --pr 7 --ai --ai-max-context-bytes 12000 \
  --ai-max-tokens 1000 --ai-timeout-ms 30000 --json
```

Only bounded, redacted triage observations and finding descriptions are sent;
raw patches/full source/issues/comments are not included. This still transmits
selected repository metadata and finding descriptions: use a local model for
sensitive repositories. Maximum context is 24 KB (or a lower configured review
limit), one request, API output at most 2,000 tokens, output text at most 32 KB,
12 claims, two concurrent model requests, default three admissions/minute per
repository, default 60-second model deadline. `--ai-max-requests-per-minute`
accepts 1–10. The complete inspection has a two-minute deadline. Hermes uses its
configured profile; its bridge cannot enforce output token counts or report token
usage, though context, time and accepted-output limits still apply.

A fixed tool-free system instruction treats all provider/repository values as
untrusted. The model cannot invoke tools, change priority, grant permissions or
publish. Structured responses require supplied observation IDs; unsupported IDs,
malformed JSON and truncated output fail explicitly. Citation validation checks
observation identity, not the truth of model prose. The UI links citations back to
observations and labels the explanation as inference. API/provider errors do not
replace failed AI work with a successful explanation; deterministic data remains.
PR freshness is checked again before and after model submission.

Known secret patterns, private-key contents, relevant environment credentials and
the explicitly supplied model credential are redacted. Leaf-string redaction
preserves JSON structure. Raw provider error bodies are withheld. No provider
credentials are persisted in triage artifacts. Novel secrets may evade pattern
redaction: inspect data and use appropriate repository/model permissions.

## CLI, MCP and editors

The CLI, HTTP endpoint and MCP tool call the same triage service and version-1
contracts. `onboarder_triage` uses the scanned local repository's GitHub origin;
there is no arbitrary repository override and no AI action in this tool.

```json
{"name":"onboarder_triage","arguments":{"path":"/absolute/repository","action":"inspect","number":7}}
```

Source patches/excerpts require `includeSource: true`; default responses omit them.
MCP triage output is capped at 512 KiB; use CLI/web export for larger reports.
MCP reports that it accesses an external system, while remaining read-only. Run
`onboarder mcp` using your existing MCP client configuration; list tools and
call `onboarder_triage` as above. Clients supporting standard stdio MCP can use
this capability without a provider-specific agent dependency. Existing MCP source
permissions and explicit deep-analyzer permission behavior remain unchanged.
Full Phase 4D Codex/Claude/Zed setup and planner/fix editor handoffs are unfinished.

VS Code: build with `npm run editor:package`, install the local VSIX and use
**Onboarder: Triage Pull Requests** in a trusted workspace. It runs the installed
local CLI, presents a queue picker and inspects a selected PR. Its cancellation,
60-second process limit, 8 MB output cap and script-disabled result panel apply.
Use the web/CLI for pagination or longer inspections. Set `onboarder.cliPath` to
an absolute `bin/onboarder.js` for a source build (required on Windows). This VSIX
has not been published to the Marketplace.

## Budgets and failure behavior

Each provider instance permits at most 40 repository GETs and 12 MiB aggregate
JSON data, with the existing 2 MiB response ceiling and 15-second network deadline.
PR pages hold 1–30 rows (default 10), page numbers 1–100. Inspections retrieve up to
300 changed files, 200 reviews, 200 check runs and 200 commit statuses. Missing
patches, binary/omitted source, malformed hunks and incomplete pagination are
preserved as skipped/partial analysis. Reports exceeding 7 MiB are withheld;
review patches retain the existing 5 MiB aggregate ceiling. CODEOWNERS is bounded
to 64 KiB and triage configuration to 16 KiB. Ownership is further bounded to 1,000 rules,
256-character patterns, 100 reviewer suggestions and a 50-million estimated
matching-work budget; excess coverage is disclosed as partial. Bounds stop with explicit limitations;
there are no automatic retries, model loops or repository scripts.

Authentication/rate-limit failures include actionable status and available reset/
retry receipts. GitHub error-body text never reaches reports. The UI can cancel,
retains prior observations with capture time, and ignores superseded responses.
A provider failure for one signal does not invent an empty passing result.

## Verification and unfinished work

See [Phase 4A verification](PHASE4A_VERIFICATION.md) for executed checks, live versus
mock coverage, measured observations, file inventory and the reproducible local
demonstration. Node.js 20+ and zero runtime dependencies remain the package target;
verification in this run uses the available Node 24 runtime.

| Milestone | Status |
| --- | --- |
| 4A — queue, explainable priorities, filtering, ownership, optional explanation | Implemented |
| 4B — complete Change Stack and semantic overlays | Not implemented in this milestone |
| 4C — editable grounded engineering planner and approved handoff | Not implemented |
| 4D — full editor/agent integrations | Partial reuse: triage CLI/MCP/VS Code; full milestone unfinished |
| 4E — shared review decisions, learnings, analytics and extended roles | Not implemented; existing team boundaries preserved |
| 4F — post-merge drafts, durable automation controls, full workspace polish | Not implemented; Triage ↔ Review navigation delivered |

Next implement 4B against the existing revision/semantic graph, then 4C's editable,
revision-bound plan lifecycle. Keep approval and execution separate. Extend team
triage only with explicit credential delegation and repository grants, establish
required branch/ruleset readiness, add immutable scoped caching, and test live App,
private-repository and optional model connections before claiming those live
integrations verified. No new cloud service, runtime package or database is needed
for this delivered milestone.
