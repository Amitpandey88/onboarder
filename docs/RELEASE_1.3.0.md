# Onboarder 1.3.0 — Change Stack

Released 2026-11-23.

## What's new

### Phase 4B Change Stack

- A dedicated browser workspace orders exact-revision changes into public contracts,
  dependencies and boundaries, implementation, tests, documentation and configuration.
- Before/after dependency overlays preserve renamed file identities and show direct
  context. Caller and related-test estimates come from the head snapshot.
- Git rename detection and unique exact-content matching align file moves without
  inventing dependency changes.
- Optional TypeScript Compiler API analysis identifies symbol moves and labels
  inferred symbol renames as candidates with caller-reference evidence.
- Triage opens exact local PR ranges in Change Stack. Review opens the same captured
  comparison and can return to the stack.

### API, CLI and MCP

- `POST /api/intelligence` accepts `action: "change-stack"` with base, head and
  optional semantic analysis.
- `onboarder intelligence changes . --base HEAD~1 --head HEAD` prints the complete
  stack and captured Review report.
- `onboarder_intelligence` supports `action: "change-stack"` in MCP. Its bounded
  projection discloses result totals and requires explicit `includeSource` for
  captured patches and finding excerpts.

### Release presentation

- Removed the accumulated 1.0.x–1.2.x “What's new” and “Included from” sections from
  the README. Current release notes now live in GitHub Releases and the changelog.
- Added a 12-second animated showcase preview that renders on GitHub and npm, with a
  click-through to the full 40-second MP4 and soundtrack.

## Upgrade

    npm install -g codebase-onboarder@1.3.0
    onboarder intelligence changes . --base HEAD~1 --head HEAD

The package still requires Node 20+ and has zero core runtime dependencies. Optional
semantic analysis uses the separately installed pinned TypeScript Compiler API.

## Verification

- 1,055 tests passed, 1 skipped, 0 failed on the implementation branch.
- Build-integrity, supply-chain and architecture checks passed.
- Browser smoke covered stack construction, both overlays, captured Review and return
  navigation without page errors.
- Real TypeScript 5.9.3 verification found a compiler-supported symbol move with one
  retargeted caller reference.
- Node 20/22/24, Windows/macOS smoke tests and Socket checks passed on GitHub.

The desktop CI job's final `npm audit` still reports six moderate Electron builder
minimatch advisories. Its tests, build, security and architecture steps pass before
that pre-existing audit step. The audit finding is unrelated to the Change Stack
implementation.

See [Change Stack](CHANGE_STACK.md) and the
[Phase 4B verification record](PHASE4B_VERIFICATION.md) for evidence boundaries.
Phase 4C–4F remain unfinished.
