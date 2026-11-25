Onboarder **1.5.0** adds built-in update detection and controlled self-updates across the CLI, interactive chat and explorer, web workspace and HTTP API, alongside the updated **0.1.7 Apple Silicon Mac development preview**.

## New in 1.5.0

- Added `onboarder update [check|install]`, cached update checks across `status`, `doctor`, `start`, and `config`, plus interactive `/update` in chat and `update` in the offline explorer.
- Installs pin exact versions with `--ignore-scripts`, check Node.js compatibility before updating, keep non-global installs read-only with copyable commands, and honor `ONBOARDER_NO_UPDATE_CHECK=1`.
- Added `GET /api/update`, SSE `POST /api/update/install`, and `POST /api/update/restart` (same-origin and self-hosted owner-only), plus topbar status, dismissible Project Home banner, live **Updates** drawer, and automatic-check toggle.
- Updated the Apple Silicon Mac preview to **0.1.7**: checks `macos-v*` releases on GitHub Releases with HTTPS redirect validation, `SHA256SUMS` and `codesign` verification, atomic `.app` swap/relaunch (with `.dmg` installer fallback), native **Onboarder → Check for Updates…**, and **System** / **Updates** drawer integration.

```sh
npm install -g codebase-onboarder@1.5.0
onboarder --version
onboarder update check
```

[GitHub 1.5.0 release](https://github.com/Amitpandey88/onboarder/releases/tag/v1.5.0) · [Mac 0.1.7 preview](https://github.com/Amitpandey88/onboarder/releases/tag/macos-v0.1.7) · [npm 1.5.0](https://www.npmjs.com/package/codebase-onboarder/v/1.5.0)

## Previous release: 1.4.0

Onboarder **1.4.0** moves the project home to [amit.codes](https://amit.codes/) and the product to [onboarder.amit.codes](https://onboarder.amit.codes/). The portfolio, GitHub links, npm homepage, install examples and public documentation use the canonical domains.

### Changes in 1.4.0

- A new portfolio at [amit.codes](https://amit.codes/), deployed separately. Its source is maintained outside this repository and is not included in the npm package.
- Onboarder now lives at [onboarder.amit.codes](https://onboarder.amit.codes/), with canonical metadata, sitemap and install links updated.
- The Onboarder site no longer promotes Q3. Q3 remains a separate service and is outside this release.
- One shared TLS certificate covers `amit.codes`, `www.amit.codes` and `onboarder.amit.codes`.
- Legacy `intellimatrix.in`, `www.intellimatrix.in` and `onboarder.intellimatrix.in` URLs redirect to their new equivalents.
- No CLI, server API or MCP protocol behavior changed in this minor release.

```sh
npm install -g codebase-onboarder@1.4.0
onboarder --version
```

[Portfolio](https://amit.codes/) · [GitHub 1.4.0 release](https://github.com/Amitpandey88/onboarder/releases/tag/v1.4.0) · [npm 1.4.0](https://www.npmjs.com/package/codebase-onboarder/v/1.4.0)

## Verification

- 1,055 tests passed, 1 skipped and 0 failed. Build integrity covered 482 generated files; supply-chain checks covered 858 package files; the architecture check returned no high-severity findings.
- Browser smoke covered both sites at 1440px and 390px widths with no horizontal overflow, broken images, page errors or console errors.
- Both domains serve the new release over HTTPS with the shared certificate.
- Legacy hostnames redirect permanently, and real missing paths stay 404.
- npm and GitHub metadata point to the new canonical domains.

## Previous release: 1.3.0

Onboarder **1.3.0** delivers Phase 4B **Change Stack**: an ordered, exact-revision way to review contracts, dependencies, implementation and tests. The npm package retains Node.js 20+ support and zero core runtime dependencies.

### What changed in 1.3.0

- Ordered contract, dependency/boundary, implementation, test, documentation and configuration groups built from immutable Git snapshots.
- Before/after dependency overlays with canonical renamed-file identities and direct context.
- Git and unique exact-content file-move alignment, affected caller and related-test estimates.
- Optional TypeScript semantic symbol moves and explicitly labelled rename candidates with caller evidence.
- Captured Review patches shared with the web workspace, API, CLI and bounded source-gated MCP projection.
- Triage → Change Stack → Review navigation that preserves the exact comparison.
- Simpler README release presentation and a 12-second animated showcase preview for GitHub and npm.

```sh
npm install -g codebase-onboarder@1.3.0
onboarder --version
onboarder intelligence changes . --base HEAD~1 --head HEAD
```

[Change Stack guide](/docs/change-stack/) · [GitHub 1.3.0 release](https://github.com/Amitpandey88/onboarder/releases/tag/v1.3.0) · [npm 1.3.0](https://www.npmjs.com/package/codebase-onboarder/v/1.3.0)

### Verification and limits

- 1,055 tests passed, 1 skipped and 0 failed on the implementation branch.
- Build-integrity, supply-chain and architecture checks passed. Browser smoke covered stack construction, both overlays, captured Review and return navigation.
- Real TypeScript 5.9.3 verification found a compiler-supported symbol move with one retargeted caller reference.
- Node 20/22/24, Windows/macOS smoke tests and Socket checks passed on GitHub.
- The desktop CI job still ends on six moderate Electron builder minimatch advisories in its pre-existing `npm audit` step. Its tests, build, security and architecture checks pass first.

Change Stack does not execute source or tests. Static dependency/caller estimates and optional compiler results can be partial. Phase 4C–4F planning, collaboration and post-merge work remain unfinished.

## Previous release: 1.2.0

Onboarder **1.2.0** refreshed the shared browser workspace and introduced the separate **0.1.6 Apple Silicon Mac development preview**, with grouped navigation, resizable panels, System appearance settings, native project windows and bundled Node/npm.

[Core 1.2.0 release](https://github.com/Amitpandey88/onboarder/releases/tag/v1.2.0) · [Mac guide and downloads](/docs/macos/)

The Mac preview requires macOS 14+ on Apple Silicon. It is ad-hoc signed and not notarized; Gatekeeper may block it. Intel downloads are not included. Existing Hermes, history and offline workflows are retained.

## Previous release: 1.1.0

Onboarder **1.1.0** is published on GitHub and npm. It connects contextual review, human-approved fixes and read-only GitHub PR triage while preserving Node.js 20+ and zero core runtime dependencies.

## What is included

- **Unified review:** working-tree, staged and exact-revision comparisons, retained patches, source fingerprints, policy provenance and Markdown/JSON/SARIF exports.
- **Contextual AI review:** explicit opt-in, relevant cross-file callers/tests, bounded excerpts, validated citations and transparent incomplete/error states. Your configured endpoint or Hermes profile remains optional.
- **Approved fixes:** read-only proposals, full patch preview, server-enforced exact approval, isolated worktrees, checkpoints, real separately authorized baseline/result checks, re-review and conflict-aware rollback.
- **PR triage:** read-only GitHub queues, explainable P0–P3 urgency, exact-head observations, CODEOWNERS and architecture candidates in web/CLI/MCP/VS Code. Priority never automatically grants merge readiness.
- **Security and reliability:** tighter credential/transport redaction, command-plan digests, narrower read-only App tokens, reliable Node 20 cancellation/timeouts, and the official Mermaid 12.2.0 bundle with patched KaTeX 0.18.11. No advisory exception remains.
- **Editor integration:** separately versioned VS Code 0.2.0 VSIX and packaged sources/builder; no automatic Marketplace installation. Standalone MCP now exposes 18 tools.

[Review](/docs/review/) · [Optional AI review](/docs/ai-review/) · [Approve a fix](/docs/fixes/) · [Triage PRs](/docs/triage/)

## Install and upgrade

```sh
npm install -g codebase-onboarder@1.2.0
onboarder --version
onboarder review . --staged --json
```

Existing commands, configuration and offline features are retained. Regenerate old development check approvals: digests now bind raw lifecycle definitions. Mermaid browser views require ES2024 support (Safari 17.4+); CLI/server Node 20+ support is unchanged. Saved fix records and private configuration are not deleted by an upgrade.

## Actual release verification

- Local macOS Node 20/24/26: 1,045 tests passed on each, with no failures or skips.
- Linux GitHub CI Node 20/22/24: 1,033 passed and 12 expected skips on each. Skips cover 11 macOS-only terminal tests and one optional compiler integration; all ran in configured local suites.
- Release-time development and vendor audits: zero advisories, zero exceptions. This is a dated check, not a permanent guarantee.
- Fresh public-registry installs on Node 20/24 passed command links/help, offline review, intelligence, MCP, patched assets and actual web startup. Published archive integrity matches the tested package.
- Fix tests used mocked model responses, but baseline failure and post-fix passing checks actually executed. Chromium verified light/dark rendering, hostile diagrams, editor workers and mobile views.

[Exact-commit CI results](https://github.com/Amitpandey88/onboarder/actions/runs/39783604289) · [Release verification](https://github.com/Amitpandey88/onboarder/blob/v1.1.0/docs/releases/1.1.0/VERIFICATION.md)

## Known limits

Phase 4C–4F planning, full team collaboration and post-merge drafts remain unfinished. Change Stack is now delivered in 1.3.0. Live model/Hermes quality, private GitHub App accounts, actual VS Code GUI and Safari execution remain unverified. Static analysis can miss defects or report false positives. Worktrees are not OS sandboxes and passing checks do not prove complete correctness.

## Release links

- [npm 1.1.0](https://www.npmjs.com/package/codebase-onboarder/v/1.1.0)
- [GitHub v1.1.0 and downloads](https://github.com/Amitpandey88/onboarder/releases/tag/v1.1.0)
- [Migration notes](https://github.com/Amitpandey88/onboarder/blob/v1.1.0/docs/MIGRATING_TO_1.1.md)

Updating this documentation website does not upgrade an installed local or VPS CLI.

## Previous release: 1.0.5

Onboarder 1.0.5 adds repository intelligence and makes dependency graphs lighter while keeping the core package free of runtime dependencies.

- **Repository intelligence:** source evidence with retained citations, saved conversations/topics, optional TypeScript semantic indexing, live refresh, architecture rules, coverage provenance, revision comparison, impact and suggested tests.
- **Onboarding and exploration:** role journeys, notes, snapshots, maintainer knowledge, package/route/data-model discovery, cross-repository package links and bounded OTLP imports.
- **Lighter Graph:** stable placement replaces continuous physics; canvas memory, visible nodes, connections and labels are bounded. Search covers every scanned file. Batched redraws, readable labels, preserved zoom and safe dragging reduce interaction overhead. Shift-click locks a thread; Escape unlocks it.
- **Exact review and safer fixes:** retained comparison patches, SARIF exports, isolated implementation worktrees, automatic file checkpoints and actual check receipts.
- **MCP and integrations:** 17 standalone tools, resources/prompts, startup checks and protocol validation; 42 scoped agent tools; optional signed GitHub webhook checks, repository-scoped team roles/comments, and a separately packaged VS Code extension.
- **Interface and privacy:** dark diagrams, consistent dropdown arrows, saved views and clearer lock hints. Browser provider keys remain in tab memory rather than persistent storage.

AI, the optional compiler, team access and GitHub publication require explicit configuration. Runtime traces are imported samples; static links are not proof of runtime execution. GitHub publication defaults off. The VS Code extension is provided as a VSIX rather than installed automatically or published to the Marketplace.

Install:

```sh
npm install -g codebase-onboarder@1.0.5
onboarder --version
onboarder intelligence scan . --json
```

Documentation: https://onboarder.amit.codes/docs/
Advanced setup and limits: https://github.com/Amitpandey88/onboarder/blob/main/docs/ADVANCED_FEATURES.md

## Previous release: 1.0.4

- **Find commands quickly.** Ctrl-P opens a searchable command palette. Choose a command, add any arguments, then run it. Your unfinished question and cursor position are kept.
- **Explore files from chat.** Ctrl-O or `/open [query]` finds indexed code files and offers source, inspection, connections, graph, change-impact, and local-explanation actions. Browsing works offline and follows the active workspace.
- **Resume without copying IDs.** Ctrl-R or `/resume` searches conversations saved for the current repository and keeps your current permissions.
- **Clearer terminal conversations.** Separate You, Onboarder, and Result blocks have borders that resize with the terminal. A shaded model/status bar, labeled input, grouped help, and clear completion labels make the chat easier to follow. History stays in place while new output arrives; Ctrl-End returns to the latest output.

### Included from 1.0.3

- **Easier tree navigation.** Click a folder to expand or collapse it. Open all folders or collapse them from the toolbar; expansion keeps your zoom and position so large maps stay readable. **Fit** remains available when you want to see the whole map.
- **Choose where a canvas file opens.** Pick **Deep Dive**, **Code**, or **Docs** after clicking a file on the map. The sidebar file list opens files directly.
- **Trace and lock connections.** Hover or focus a node to highlight its connections and gently fade and blur the surrounding map. Use **Lock thread**, the Tree pin, or Shift-click to keep the highlight while panning and zooming. Escape unlocks it. Connection tracing works across all nine Explore views and the Graph tab.
- **Stronger supply-chain checks.** npm installation runs no install hooks. Optional analyzer packages use exact versions; Hermes bootstrap scripts and Gitleaks downloads are checked against pinned hashes before execution. Browser assets have an integrity inventory, and CI audits both development tools and vendored libraries.

Historical note: versions through 1.0.5 bundled vulnerable KaTeX. Version 1.1.0 replaces the actual Mermaid bundle with patched KaTeX and removes the advisory exception; see [Security](/docs/security/).

### Historical 1.0.4 release links

- [npm package 1.0.4](https://www.npmjs.com/package/codebase-onboarder/v/1.0.4)
- [GitHub release v1.0.4](https://github.com/Amitpandey88/onboarder/releases/tag/v1.0.4)
- [Source and previous releases](https://github.com/Amitpandey88/onboarder/releases)

```sh
npm install -g codebase-onboarder@1.0.4 --prefer-online
onboarder --version
```

These previous-release notes describe version 1.0.4. Building and deploying this website does not upgrade an installed local or VPS copy of the CLI.
