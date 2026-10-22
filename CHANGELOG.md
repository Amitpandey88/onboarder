# Changelog

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
- Node 20-compatible AI deadlines and bounded waits even when a completion adapter
  does not cooperate with cancellation.

### Compatibility and limitations

Node 20+ and zero core runtime dependencies are retained. Existing offline
exploration, intelligence, review, chat, Hermes and MCP workflows remain available.
Existing settings and review configuration require no automatic migration.

Only the implemented Phase 4A triage milestone is included: the dedicated Change
Stack, engineering planner, full collaboration platform and post-merge drafts
are incomplete. Model evaluations use controlled responses; live quality is not
established. Worktrees do not sandbox check execution. The existing tracked low
KaTeX advisory remains; review is due 2026-11-09. See
[release notes](docs/RELEASE_1.1.0.md) and [migration notes](docs/MIGRATING_TO_1.1.md).

## Earlier releases

- [1.0.5 — repository intelligence and lighter graphs](https://github.com/Amitpandey88/onboarder/blob/main/docs/RELEASE_1.0.5.md).
- Earlier release history is available in the repository's Git tags and GitHub
  Releases. This changelog begins with the 1.1.0 release preparation.
