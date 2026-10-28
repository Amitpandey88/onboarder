## Start

![Onboarder 1.0.5 intelligence workspace](/assets/web-intelligence-1.0.5-light.jpg)

Install Onboarder 1.1.0, run `onboarder start`, load a repository and open **Intelligence**. Source checkouts need `npm run build` first.
The landing goal opens exploration, review, investigation or implementation.
Resume restores the previous view, selected file and filter in this browser.
Explorer's **Save view** and **Saved views** retain named viewpoints, folder
expansion and diagram position locally.

Terminal entry points:

```sh
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
```

The standalone MCP catalog now includes onboarder_intelligence: scan, evidence,
or exact-revision comparison. Standalone tools total 18; the scoped Hermes
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

```sh
onboarder intelligence semantic-setup
onboarder intelligence scan . --semantic
```

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

```json
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
```

Replace the illustrative hash with a real 64-character SHA-256, or omit hash
and let the note display as needing source review. Rules use the existing *,
** and ? path vocabulary. Baselines preserve findings while excluding them from
the new-violation gate. The checked-in Onboarder configuration enforces portable
shared analysis and browser/server boundaries.

For generated measured coverage, add:

```sh
"coverage": {
  "path": "coverage/lcov.info",
  "metadata": "coverage/onboarder.json"
}
```

Generate the sidecar after executing tests:

```json
{
  "revision": "EXACT_TESTED_COMMIT_SHA",
  "sourceFingerprint": "SOURCE_FINGERPRINT_FROM_THE_TESTED_SCAN"
}
```

The sourceFingerprint is the snapshot's sourceFingerprint, not its overall
fingerprint (which also includes analysis configuration). A dirty checkout needs
a matching source fingerprint. A clean checkout still requires the exact commit.
Store generated coverage/metadata outside version control to avoid a circular
commit reference. Absolute or escaping paths and XML DTD/entities are refused.

For runtime samples add telemetry with a repository-relative path:

```sh
"telemetry": { "path": "observability/traces.json" }
```

The file must be OTLP JSON resourceSpans/scopeSpans, under 2 MB and 2,000 spans.
Arbitrary attributes, request bodies, authorization headers and full URLs are
not imported into the report. These are samples, not proof of complete traffic.

## Team setup

Set ONBOARDER_TEAM_FILE to a private absolute server-side JSON file path, then:

```sh
onboarder team add "Reviewer name" /absolute/repository --role reviewer
onboarder team list
onboarder team revoke MEMBER_ID
```

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

```json
{
  "version": 1,
  "publish": false,
  "repositories": {
    "OWNER/REPOSITORY": { "installationId": 12345 }
  }
}
```

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
patches and immediately before publication. Changed heads become stale; duplicate
events reuse a durable receipt. Queued/running jobs recover after restart.
Missing patches or truncated pagination produce a neutral, incomplete result.
No repository scripts, build hooks or model calls run during webhook analysis.

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


## Review-to-fix workflow in 1.1.0

Finding-linked [fix proposals](/docs/fixes/) add exact server-side approval, isolated application and separately authorized checks to the existing harness. This is separate from the legacy free-task implementation flow. [Contextual review](/docs/ai-review/) and [PR triage](/docs/triage/) share this repository context; a remote PR observation alone does not grant local source or implementation permission. Full engineering planning and collaboration remain outside this release.
