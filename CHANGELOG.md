# Changelog

## 1.4.0 — 2026-11-23

- Moved the project home to [amit.codes](https://amit.codes/) and the product to
  [onboarder.amit.codes](https://onboarder.amit.codes/), including canonical
  links, sitemap, install examples, npm homepage and GitHub repository metadata.
- Added the dependency-free portfolio source in `portfolio-site/`; the Onboarder
  site now promotes the portfolio and no longer promotes Q3. The separate Q3
  service is unchanged.
- Added one shared TLS certificate for the new apex, `www` and Onboarder hostnames
  and permanent redirects from the legacy `intellimatrix.in` hostnames.
- This is a metadata and documentation release. CLI, server API and MCP behavior
  are unchanged.

## 1.3.0 — 2026-11-23

- Added the Phase 4B **Change Stack** workspace, API action, MCP projection and
  `onboarder intelligence changes` CLI command. It presents ordered review groups
  from exact-revision Git snapshots, captured Review patch evidence, before/after
  dependency overlays, unique file-move alignment, caller/test impact and optional
  compiler-backed symbol moves with explicitly labelled rename candidates.
- PR Triage can open its exact local PR range in Change Stack when architecture
  evidence is available; Review can return to the captured stack.
- Removed accumulated release-history sections from the README and added an
  animated showcase preview that renders on both GitHub and npm. Full release notes
  now live in GitHub Releases and [the 1.3.0 guide](docs/RELEASE_1.3.0.md).

## 1.2.0 — 2026-10-28

- Refreshed shared web workspace with grouped navigation, resizable panels,
  responsive drawers, project home and readable hover/focus labels.
- System settings combine AI connection and icon-labeled Light/Dark/System
  appearance. Project details and application About are separate.
- Solid rounded controls replace Liquid Glass; fixed Files/Details across every
  view and reduced repeated layout/preference work.
- Isolated Apple Silicon macOS development preview 0.1.6: bundled Node/npm,
  per-project windows and private backends, native dialogs and exports, shell
  and chat terminals, safe clone storage/progress and optional Keychain storage.
- Reproducible Mermaid bundle with DOMPurify 3.4.17 and KaTeX 0.18.11, pinned
  build graph, licenses and integrity checks. Zero core runtime dependencies.

The Mac app is a separate ad-hoc-signed, unnotarized preview for macOS 14+;
Intel distribution and signed production downloads are not included. Existing
Hermes, conversations, analysis history and terminal workflows are retained.
See [release notes](docs/RELEASE_1.2.0.md).

## 1.1.0 — 2026-10-22

### Added

- Optional contextual AI review in CLI and web, with bounded repository context,
  cross-file callers/tests and validated source citations.
- Finding-linked read-only fix proposals, exact approval digests, isolated
  worktree application, checkpoints, rollback, separately authorized real checks,
  source-bound receipts and deterministic re-review.
- Read-only GitHub PR triage in web, CLI, MCP and VS Code: explainable priority,
  CODEOWNERS suggestions, exact-head observations and optional AI explanation.
- Reproducible production-readiness performance, review-quality and workflow
  benchmarks with explicit separation of mock model output and executed checks.
- VS Code 0.2.0 integration sources and a dependency-free VSIX packaging helper
  in the npm archive. The VSIX is distributed separately from Marketplace.

### Improved

- Unified local/GitHub review evidence, revision-selected configuration, patch
  retention, coverage/freshness metadata and compatible JSON/Markdown/SARIF exports.
- Provider credential/error redaction, redirect refusal, response budgets,
  streaming dialects, explicit incomplete-output errors and disconnect cancellation.
- Check-plan authorization now fingerprints raw lifecycle definitions before
  redaction; disabled GitHub publication requests read-only App permissions.
- Upgraded the integrity-verified Mermaid browser bundle to 12.2.0 with patched
  KaTeX 0.18.11; removed the obsolete advisory exception. Classic Dagre layouts
  and light/dark palettes are preserved.
- Node 20-compatible AI deadlines and bounded waits even when a completion adapter
  does not cooperate with cancellation.

### Compatibility and limitations

Node 20+ and zero core runtime dependencies are retained. Existing offline
exploration, intelligence, review, chat, Hermes and MCP workflows remain available.
Existing settings and review configuration require no automatic migration.

Only the implemented Phase 4A triage milestone is included: the dedicated Change
Stack, engineering planner, full collaboration platform and post-merge drafts
are incomplete. Model evaluations use controlled responses; live quality is not
established. Worktrees do not sandbox check execution. Mermaid 12 requires a
modern ES2024 browser (Safari 17.4+); the server and CLI retain Node 20+. See
[release notes](docs/RELEASE_1.1.0.md) and [migration notes](docs/MIGRATING_TO_1.1.md).

## Earlier releases

- [1.0.5 — repository intelligence and lighter graphs](https://github.com/Amitpandey88/onboarder/blob/main/docs/RELEASE_1.0.5.md).
- Earlier release history is available in the repository's Git tags and GitHub
  Releases. This changelog begins with the 1.1.0 release preparation.
