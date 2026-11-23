# Phase 4B verification

This record covers the implemented Change Stack milestone, not the remaining Phase
4C–4F planner, collaboration and post-merge milestones.

## Delivered surface

- Ordered exact-revision Change Stack in the browser, `POST /api/intelligence`,
  `onboarder intelligence changes`, and the `onboarder_intelligence` MCP action.
- One shared captured Review report for patches and findings; Triage and Review
  navigation preserves the exact range.
- Git and unique exact-content file-move alignment, bounded before/after overlays,
  caller/test impact, and optional TypeScript semantic moves and rename candidates.
- Source-gated bounded MCP output: patches and finding excerpts require explicit
  `includeSource`; projections disclose their returned/total counts and 512 KB cap.
- Package allowlist and required-file checks for the new modules, browser assets and
  documentation.

## Executed checks

Verification run: 2026-11-20, Node 24 on macOS. No AI provider or live GitHub
credentials were used.

- `npm test` — 1,055 passed, 1 skipped, 0 failed.
- `npm run security:check` — package and supply-chain checks passed.
- `npm run build:check` — all generated JavaScript and declaration files matched
  their TypeScript sources.
- `npm run architecture:check` — no high-severity boundary violations (`[]`).
- `git --no-optional-locks diff --check` — clean.
- Focused Change Stack and release-guard tests — 18 passed, 0 failed.

The browser smoke test opened this repository, built the default exact range,
observed one review group containing two files and two before/after overlay panels,
opened the captured Review report, returned to the same stack, and observed no page
errors. Semantic analysis was off for that browser pass.

## Real compiler verification

The pinned optional TypeScript 5.9.3 Compiler API was installed with lifecycle
scripts disabled into an isolated verification directory, not the package or lockfile.
A temporary Git repository moved `src/load.ts` to `src/account.ts` and updated its
caller import. `changeStack(root, { base, head, semantic: true })` returned:

    engine: TypeScript 5.9.3
    semantic status: available
    file movement: renamed
    symbol: loadUser
    confidence: compiler-supported
    retargeted caller references: 1

The same compiler was also invoked through `node --input-type=module`. The worker
filters that eval-only parent flag before starting its file-backed worker; the check
returned an available TypeScript 5.9.3 index with two definitions and two references.

## MCP and API verification

The focused API test creates a real two-commit repository and checks that the Change
Stack and captured Review report share the same base and head. It also verifies that
MCP without `includeSource` omits comparison patches and finding excerpts, while
`includeSource: true` returns bounded captured patches and excerpts. Invalid semantic
options receive an explicit 400 response.

## Boundaries

- No repository source or tests were executed by Change Stack itself.
- No live AI, GitHub App, private-repository or PR-provider behavior is claimed by
  this verification.
- The real compiler check used a small TypeScript fixture. Large-repository compiler
  coverage remains bounded and can be partial; the UI and report disclose that state.
- The browser smoke used semantic-off defaults; semantic behavior was verified
  separately with the real pinned compiler.
- Full milestone 4B is implemented. Phase 4C–4F remain unfinished.
