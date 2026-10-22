# Repository intelligence — Onboarder 1.1.0

Version 1.1.0 includes these capabilities in the CLI and web workspace. Optional
compiler, AI, editor, team and GitHub integrations require the setup below.

## Start

Contextual AI review is available through
`onboarder review . --ai` and the Review tab's **AI-assisted** selector. Offline
review remains the default. It sends bounded, redacted, revision-pinned excerpts
through the existing configured endpoint or Hermes bridge and validates cited
locations before accepting model findings. Confidence is model-stated; locations
are checked and behavior remains unverified. See
[Contextual AI review](CONTEXTUAL_AI_REVIEW.md) for setup, limits, tests and caveats.

The fix workflow adds finding-linked proposals, exact-patch approval, isolated
worktree application, checkpoints/rollback, real authorized baseline/result checks
and fresh review comparisons in both CLI and Review. This extends the existing
implementation harness; normal Hermes task workflows remain available. Read
[AI Fix & Verification](AI_FIX_VERIFICATION.md) before enabling check execution.
Passing checks cover only the selected checks, and worktrees are not OS sandboxes.

Phase 4A adds **Triage**: a real GitHub PR queue, deterministic factor
priorities, filters, target-revision ownership suggestions, optional model explanations
and navigation to captured Review findings. CLI, MCP and the existing VS Code
extension share this service. Only Milestone 4A is delivered; other Phase 4
milestones remain unfinished. See [PR triage](PR_TRIAGE.md) and the
[verification record](PHASE4A_VERIFICATION.md).

Run npm run build, start the server, load a repository and open **Intelligence**.
The landing goal opens exploration, review, investigation or implementation.
Resume restores the previous view, selected file and filter in this browser.
Explorer's **Save view** and **Saved views** retain named viewpoints, folder
expansion and diagram position locally.

Terminal entry points:

    onboarder intelligence scan . --json
    onboarder intelligence ask . "How does authentication work?"
    onboarder intelligence impact . src/server/router.ts
    onboarder intelligence compare . --base HEAD~1 --head HEAD
    onboarder intelligence rules . --fail-on high --json
    onboarder intelligence coverage .
    onboarder intelligence packages .
    onboarder intelligence routes .
    onboarder intelligence journeys .
    onboarder intelligence snapshot .
    onboarder intelligence history .
    onboarder intelligence watch .
    onboarder intelligence portfolio /path/to/service /path/to/shared-library
    onboarder intelligence benchmark .
    onboarder intelligence doctor .
    onboarder review . --staged --sarif

The standalone MCP catalog now includes onboarder_intelligence: scan, evidence,
or exact-revision comparison. Standalone tools total 17; the scoped Hermes
catalog totals 42 including checkpoint creation and restoration.
Evidence excerpts require includeSource in standalone MCP. Scoped Hermes calls
return evidence locations and use the existing bounded source reader for text.
Large MCP projections disclose their result limits and total counts.

## What the features do

| Area | Implemented behavior | Scope |
| --- | --- | --- |
| Evidence and browser conversations | Local cross-file retrieval, line ranges, source hashes, revision/fingerprint, optional streamed explanations, excerpt-ID checks, saved answers and retained redacted citations, bounded follow-up context | Retrieval uses lexical matches and dependency paths. Citations do not automatically prove every generated statement. |
| Semantic code intelligence | Real optional TypeScript Compiler API worker: declarations, references and cross-file calls | TypeScript/JavaScript only; captured source and root declarative resolution settings, without executing source or reading external libraries/plugins. Dynamic behavior and external dependency types can remain unresolved. |
| Refresh | Shared unchanged-file parse reuse across browser, CLI and MCP scans; one-scan read sharing for scanner/search; optional live refresh every ten seconds and terminal watch every three seconds | Files are still checked and graph relationships recomputed. Browser-picked folders use explicit refresh/offline workflows. |
| Exact review | Retained redacted comparison hunks with both line columns, rename/deletion context and actual merge-base SHA | Working/staged evidence belongs to the captured report; code navigation outside the retained patch reads current files. |
| Change intelligence | Exact Git-object scans, new/removed connections, cycles, removed exports and new boundary violations | Public export changes are structural signals, not complete semantic API compatibility proofs. |
| Coverage and test planning | LCOV and Cobertura imports with revision/source freshness, measured lines/branches, dependency-based test recommendations | Coverage is never inferred from changed test files. Reports with no matching execution provenance remain unknown or stale. |
| Architecture | Declarative forbidden dependency edges, baselines, evidence and CI exit status | Rules enforce path relationships. Natural-language guidelines are not executable rules. |
| Verified fixes | Browser implementation flow using the existing isolated Hermes harness, fresh-hash edits, automatic file checkpoints, selected checks and durable check receipts | Requires a configured Hermes profile. New worktrees begin at committed HEAD. Checks default off; GitHub writes are disabled in this browser flow. |
| Onboarding | Default role/goal journeys, maintainer-authored journeys, saved completion and private notes | Completion records activities; it does not certify comprehension. |
| API/data exploration | Express-style and FastAPI-style routes, explicit route tables, declared middleware, optional semantic references, candidate downstream modules, Prisma/SQL/ORM model detection | Static candidates are labeled; arbitrary framework control flow is not reconstructed. Test/fixture routes are excluded. |
| Monorepos and portfolios | Nested package manifests, declared package links, differing version ranges, JS/TS workspace entry resolution and nearest configuration aliases; declared package connections across up to four repositories | Declared ranges are not installed versions. Package configuration inheritance and arbitrary build-generated resolution may remain incomplete. |
| Maintainer knowledge | Repository-authored notes, declared CODEOWNERS and source-hash freshness | Git authorship is not treated as ownership. Unpinned notes need review. |
| History and sharing | Private snapshots, current/previous comparisons, bounded retention, source-free report export | Reports include relative filenames. Saved conversations privately retain only their displayed redacted excerpts. Exported reports exclude scan IDs and filesystem roots. |
| GitHub automation | Signed webhook validation, durable jobs/recovery, duplicate suppression, exact-head checks, optional GitHub App authentication, Check Run identity and bounded annotations | Server configuration and a GitHub App/token are needed. Publication defaults off. No account or webhook is provisioned automatically. |
| Teams | Named viewer/reviewer credentials, exact repository grants, signed/revocable sessions, per-member private workspace state and revision-pinned shared comments | Operator-managed credentials; no SSO/organization provisioning. Members cannot run analyzers, access credentials/settings, create fixes, clone arbitrary repositories or read raw diff endpoints. |
| Editor | Local VS Code extension with inspect, source evidence, impact, review, journeys, safe source navigation and web workspace commands | VSIX is built separately. It is not installed or published automatically. |
| Runtime observations | Bounded OTLP JSON import showing observed services, parent/child calls, durations and error states | Imported samples only. No collector, monitoring service, or automatic production instrumentation is installed. |

## Lightweight Graph view

Graph uses a stable layout and paints only after an interaction or source change.
There is no background physics simulation. Pointer/zoom/resize events share one
scheduled paint; hidden views and tabs perform no painting. Large repositories
show a bounded overview (700 files and 1,800 connections), with a visible count.
Search covers every scanned file and adds its immediate dependency context, so
files outside the initial overview remain reachable. Labels and the canvas pixel
buffer are bounded; hover uses fading rather than GPU blur. Dragging, panning,
zoom, fitting and thread locking remain available. A repeated source refresh
preserves positions and zoom. Reset deliberately restores the stable layout.

## Optional semantic engine

    onboarder intelligence semantic-setup
    onboarder intelligence scan . --semantic

The explicit setup command installs TypeScript 5.9.3 separately under the
intelligence data directory, with lifecycle scripts disabled, an exact version,
the npm public registry and isolated package configuration. The core npm package
retains zero runtime dependencies. Installation is optional and requires network.
On Windows install the API package separately and set ONBOARDER_TYPESCRIPT_MODULE.
That variable can also select an operator-trusted absolute lib/typescript.js path.
It is never derived from the repository being analyzed.

Indexing uses at most two workers, a 20-second per-worker timeout, a memory
ceiling, 500,000 visited syntax nodes and 20,000 references. Partial results
are labeled. External library types and plugins are not loaded.

## Repository configuration

Place declarative version-1 configuration in .onboarder.json (maximum 64 KB):

    {
      "version": 1,
      "rules": [
        {
          "id": "ui-storage",
          "from": "src/ui/**",
          "forbid": "src/database/**",
          "message": "Access storage through the service layer."
        }
      ],
      "baseline": ["ui-storage:src/ui/legacy.ts->src/database/store.ts"],
      "knowledge": [
        {
          "id": "authentication",
          "path": "src/auth.ts",
          "text": "Permission checks must precede the handler.",
          "hash": "REPLACE_WITH_THE_FILE_SHA256"
        }
      ],
      "journeys": [
        {
          "id": "first-request",
          "title": "Follow your first request",
          "role": "Backend developer",
          "steps": [
            {
              "id": "route",
              "title": "Read the route",
              "path": "src/routes.ts",
              "instruction": "Find validation, permissions and error handling."
            }
          ]
        }
      ]
    }

Replace the illustrative hash with a real 64-character SHA-256, or omit hash
and let the note display as needing source review. Rules use the existing *,
** and ? path vocabulary. Baselines preserve findings while excluding them from
the new-violation gate. The checked-in Onboarder configuration enforces portable
shared analysis and browser/server boundaries.

For generated measured coverage, add:

    "coverage": {
      "path": "coverage/lcov.info",
      "metadata": "coverage/onboarder.json"
    }

Generate the sidecar after executing tests:

    {
      "revision": "EXACT_TESTED_COMMIT_SHA",
      "sourceFingerprint": "SOURCE_FINGERPRINT_FROM_THE_TESTED_SCAN"
    }

The sourceFingerprint is the snapshot's sourceFingerprint, not its overall
fingerprint (which also includes analysis configuration). A dirty checkout needs
a matching source fingerprint. A clean checkout still requires the exact commit.
Store generated coverage/metadata outside version control to avoid a circular
commit reference. Absolute or escaping paths and XML DTD/entities are refused.

For runtime samples add telemetry with a repository-relative path:

    "telemetry": { "path": "observability/traces.json" }

The file must be OTLP JSON resourceSpans/scopeSpans, under 2 MB and 2,000 spans.
Arbitrary attributes, request bodies, authorization headers and full URLs are
not imported into the report. These are samples, not proof of complete traffic.

## Team setup

Set ONBOARDER_TEAM_FILE to a private absolute server-side JSON file path, then:

    onboarder team add "Reviewer name" /absolute/repository --role reviewer
    onboarder team list
    onboarder team revoke MEMBER_ID

Generated member tokens are shown only by the add command and stored as hashes.
Members use the existing access-key sign-in form or a Bearer credential.
Browser sessions are HttpOnly, SameSite=Strict, expire after one day and are
Secure on HTTPS. Revoking a member invalidates its token and sessions.
Keep the existing self-hosted owner access key, HTTPS and Host/origin protections.

Grants cover exact canonical roots. Member file reads must belong to the accepted
scan and exclude private agent handoffs. Each member has separate notes and
conversations; comments are shared within the granted repository. Viewer roles
cannot post comments. Raw diff, execution, server management and AI-provider
credential endpoints are unavailable to member credentials.

## GitHub automation setup

Set ONBOARDER_GITHUB_CONFIG_FILE to a private JSON file:

    {
      "version": 1,
      "publish": false,
      "repositories": {
        "OWNER/REPOSITORY": { "installationId": 12345 }
      }
    }

Set ONBOARDER_GITHUB_WEBHOOK_SECRET to a random secret of at least 24 characters.
Configure the GitHub webhook for application/json pull_request events at
/api/github/webhook on the existing protected server/domain.
Only allowlisted repositories are processed.

For GitHub App authentication set ONBOARDER_GITHUB_APP_ID and
ONBOARDER_GITHUB_APP_KEY_FILE. Alternatively, an existing appropriately scoped
GITHUB_TOKEN/GH_TOKEN can be used. App installation tokens request repository-
limited contents/pull-request read and checks write permissions.

Keep publish false to retain results privately. Setting publish true explicitly
enables Check Run publication. The worker checks PR head/base before reading
patches, after analysis and after Check Run lookup immediately before publication.
Changed heads/bases and closed PRs become stale. Concurrent duplicate events reuse
one durable receipt; queued/running jobs recover after restart. Recovery looks up
the existing Check Run by revision and external identity without re-appending its
annotations. This uses one worker/store; separate server processes must not share
the same job directory.

In the unified-review foundation, both local and GitHub reviews use
the same .onboarder-review.json parser, profiles, exclusions and guidelines.
Working reviews read the working-tree file; staged reviews read the index blob;
range reviews read the resolved head commit. GitHub reads the exact reviewed
commit's root tree and regular configuration blob through GitHub's Git API,
verifies its blob identity and enforces 64 KB. Only a complete root tree proving
the file absent enables the existing balanced defaults. Invalid JSON/schema,
symlinks, truncated trees, denied requests and unavailable objects fail the job
visibly. Fork heads use the allowlisted base repository's object API; credentials
are never sent to a fork URL. If GitHub cannot expose that object through the
granted repository, the review fails without publishing. Head-branch config is
repository-controlled input; it can exclude paths and reduce the selected profile.

Missing or malformed patches, file-count discrepancies, skipped files and bounded
pagination produce an explicit partial report and a neutral Check Run. Per-file
skip reasons and available line counts are retained. Complete/partial refers only
to the changed patch scope, never full repository analysis or runtime coverage.
Reports retain redacted compared patches within the private receipt bound; large
patch source can be omitted with a visible limitation. The GitHub base field
identifies the target tip, while GitHub's PR patch uses its merge-base comparison;
the report discloses that distinction.

Legacy finding IDs, paths/lines, rule IDs and severities remain compatible. Optional
evidence/configuration fields identify static-pattern provenance, reviewed mode
and revisions, capture/recheck time and freshness, configuration origin and blob,
and coverage status. Local evidence is a captured snapshot; GitHub evidence is
current only as of its last PR check and is marked stale on detected revision
changes. SARIF retains the existing v1 finding fingerprint and adds this metadata.
Finding IDs are stable for identical path/line/rule locations; they are not semantic
identities that survive arbitrary line movement. Browser acknowledgements remain
scoped to the full report fingerprint and never certify a fix.

No repository scripts, build hooks or model calls run during webhook analysis.
The final GitHub read and Check Run write cannot be atomic; publication is pinned
to the reviewed head_sha so a later commit cannot receive these findings.

See [Unified review foundation](UNIFIED_REVIEW_FOUNDATION.md) for implementation,
regression coverage and current local verification results. These changes are
source development toward v1.1, not a new published release.

The protected /api/github/automation endpoint lists the latest job states.
Completed receipts remain in github-jobs beside the private configuration.
The store refuses more work at its 500-file retention ceiling; archive old
completed receipts through normal server administration.

## Storage, credentials and boundaries

Private state defaults to ~/.config/onboarder/intelligence. Set
ONBOARDER_INTELLIGENCE_HOME for an isolated environment. State is versioned,
written atomically with private file modes, and serialized per repository.
At most twenty snapshots and twenty questions are retained per workspace.
The browser can clear its saved workspace/history explicitly.

Provider keys are kept in tab memory. Previously saved browser keys are migrated
out of localStorage. Reload requires entering an API key again; Hermes continues
using its existing server-side login. No provider credential is added to exports.

Source reads reject traversal, credential paths, symbolic links, binary content
and oversized input. Intelligence retains at most 64 MB of captured source and
32 MB of parse-cache text per warm workspace, with up to four warm roots.
Default scanner limits and visible unresolved/skipped-file limitations still
apply. Git snapshots are immutable object reads, not checkouts or script runs.
Optional analyzers and permitted checks remain trusted execution, not an OS
sandbox.

## Verification

Automated tests cover real Git repositories, exact staged evidence, parsing
reuse/invalidation, source containment, configuration/baselines, coverage
provenance, private-state recovery, optional real compiler references, team HTTP
permissions/revocation, cryptographic signatures, mocked GitHub publication,
checkpoint restoration, OTLP import, and editor activation invoking the real CLI.
The full project check also verifies generated output and package boundaries.

External-provider behavior must be reported separately: local GitHub fixtures
do not prove a GitHub App is installed, editor activation fixtures do not prove
a particular VS Code installation is configured, and controlled AI responses
do not prove the quality of a live model's answers.
