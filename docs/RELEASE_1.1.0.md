# Onboarder 1.1.0

Onboarder 1.1.0 connects repository analysis, contextual review, human-approved
fixes and PR triage while retaining local-first operation, optional AI and zero
core runtime dependencies.

## Included capabilities

- **Unified review evidence:** working-tree, staged and Git revision comparisons;
  shared local/GitHub review configuration; retained redacted patches, fingerprints,
  explicit coverage and JSON/Markdown/SARIF exports.
- **Optional contextual AI review:** bounded source excerpts, related callers,
  dependencies and tests through your configured endpoint/model or Hermes profile.
  Structured findings require valid change anchors and supporting citations.
  Model confidence and explanations remain inferences, not verified behavior.
- **Human-controlled fixes:** read-only proposals, complete patch preview,
  session/workspace/source-bound exact approval, isolated worktrees, checkpoints,
  rollback and conflict protection. Checks require separate explicit authorization
  and produce actual baseline/result receipts plus fresh review comparisons.
- **GitHub PR triage:** bounded queue/inspection, explainable P0–P3 priority,
  CODEOWNERS suggestions, exact-head CI/review observations, filters and optional
  model explanations. Web, CLI, MCP and VS Code share the same service.
- **Production-readiness repairs:** safer provider errors/redirects, credential
  redaction, streaming limits/cancellation, raw check-definition approval hashes,
  read-only App tokens when publication is disabled, and reliable Node 20 timeouts.
- **Developer integrations:** existing CLI/MCP workflows and VS Code 0.2.0 with
  triage. npm includes the extension sources and its dependency-free VSIX builder;
  no Marketplace installation or publication occurs automatically.

## Install and use

```sh
npm install -g codebase-onboarder@1.1.0
onboarder --version
onboarder --help
onboarder intelligence scan . --json
onboarder review . --staged --json
onboarder review . --base main --head feature --sarif
onboarder start fg
```

AI is optional. Configure an existing compatible endpoint and model, or your
Hermes profile, before using `onboarder review . --ai`. A compatible local model
endpoint is supported. No paid Onboarder subscription is required. See
[provider setup](CONTEXTUAL_AI_REVIEW.md).

```sh
onboarder review . --ai --json
onboarder fix propose . --finding FINDING_ID --json
onboarder fix show . --proposal PROPOSAL_ID
onboarder fix apply . --proposal PROPOSAL_ID --approve EXACT_PROPOSAL_DIGEST
onboarder fix status . --run RUN_ID --json
onboarder triage list . --json
onboarder triage inspect . --pr PR_NUMBER --json
```

Inspect the displayed allowlist and source before authorizing checks. The full
[fix guide](AI_FIX_VERIFICATION.md) describes separate `--allow-checks`,
`--trust-worktree`, `--check` and `--check-digest` permissions. Neither generating
a proposal nor approving a patch authorizes arbitrary test execution or GitHub
writes. Nothing automatically commits, merges, pushes, publishes or deploys fixes.

## Compatibility and migration

No breaking command/configuration change is intended; this is an additive minor
release. Node 20+ is retained. Existing offline workflows and settings continue
to work. Review reports add evidence/status fields; consumers should tolerate
additive fields and treat model findings separately from executed verification.
Regenerate old development check approvals because digests now bind raw script
definitions. Do not delete old run records to work around a stale approval.
See [the upgrade guide](MIGRATING_TO_1.1.md).

## Known limitations and security notes

- This release contains Phase 4A triage, **not the complete Phase 4 platform**.
  Dedicated Change Stack, editable engineering planner, full team collaboration
  and post-merge drafts remain incomplete and are not advertised as delivered.
- Static findings are heuristics and can miss logic bugs or produce false
  positives. The labelled audit corpus flagged 4/8 bug cases and 3/8 clean cases;
  it is small and deliberately adversarial, not a population accuracy estimate.
- Model tests use canned responses/local mock HTTP providers. No live AI quality,
  real Hermes session, live GitHub App/private account or actual VS Code GUI
  installation is certified by those tests. Public read-only GitHub triage was
  exercised. Linux/Node 22 remote CI is checked before npm publication.
- Source transmission is opt-in and bounded/redacted, but secret recognition is
  heuristic. Use a trusted provider and inspect context/privacy settings.
- Worktrees isolate file edits, not operating-system privileges. Execute trusted
  checks locally; untrusted code needs an appropriate external isolation environment.
- Triage cannot establish all required branch policies; absent CI/ownership and
  missing local revision context remain unavailable, not approved or safe.
- One existing low KaTeX advisory remains in the official Mermaid bundle:
  [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), review due
  **2026-11-09**. Strict rendering and SVG sanitization mitigate the application
  path; the embedded library is not fixed. The audit accepts no new advisory.

The dated [Phase 5A audit](https://github.com/Amitpandey88/onboarder/blob/main/docs/PRODUCTION_READINESS_AUDIT.md) records the development
snapshot, measurements and remaining platform work. It is not a claim that every
Phase 1–4 objective is complete. Source-checkout release verification is recorded
separately in `docs/releases/1.1.0/`; exact commit and archive hashes are supplied
for final human authorization before any push or publication.
