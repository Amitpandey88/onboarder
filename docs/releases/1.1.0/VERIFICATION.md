# Onboarder 1.1.0 — release verification and authorization gates

Prepared 2026-10-22 from the actual local source, based on upstream
`44556a88b556ae13bf7c6ce126d910f4e31321b4`. Nothing has been pushed or published
by this preparation. The exact final merge commit and local annotated tag are
presented for human authorization after clean-checkout verification.

## Scope and compatibility

This is an additive release of implemented Phases 1–3, Phase 4A triage and Phase
5A hardening. It does not claim the complete Phase 4 platform. The audit's
“Not Ready for complete Phase 1–4 beta” verdict remains accurate; this release
explicitly excludes the unfinished planner, dedicated Change Stack, complete
team platform and post-merge drafts from delivered-feature claims.

The published 1.0.5 package and the candidate were installed separately in clean
temporary environments and compared on the same synthetic repository. Existing
review/finding JSON fields, the eval finding ID, SARIF version, report/intelligence
commands, agent help, configuration reads and MCP self-check remained compatible.
MCP tools increase from 17 to 18. No breaking change was found in these tested
interfaces; no major version is indicated by the observed changes. This is not
proof of compatibility with every downstream consumer or saved development run.

## Executed checks

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed; no install hooks. |
| `npm run check`, Node 24.20.0 | 1,042 passed; 0 failed/cancelled/skipped. Typechecks, generated output, supply chain and architecture passed. |
| Full tests, Node 20.20.2 | 1,042 passed; 0 failed/cancelled/skipped. |
| npm 11/12 inventory regression | 6 targeted tests pass on Node 26.8.1/npm 12.0.2, validating both formats and fail-closed malformed/credential inventory handling. |
| Full `npm run check`, Node 26.8.1/npm 12.0.2 | 1,042 passed; 0 failed/cancelled/skipped; repaired package-inventory guard and all release checks pass. |
| Optional semantics | Real pinned TypeScript Compiler API 5.9.3 configured outside the project; no runtime dependency added. |
| `npm run security:audit` | 0 unaccepted advisories; 1 existing tracked low KaTeX advisory, review due 2026-11-09. |
| `npm run editor:package` | VS Code 0.2.0 VSIX built; no Marketplace publication. |
| `npm pack --dry-run` | 829 allowlisted files; 5,603,196 compressed / 22,203,830 unpacked bytes. |
| Clean archive installs, Node 20 and 24 | Passed version/help, repository report/intelligence, offline/staged review, SARIF, explicit no-provider state, MCP, mocked read-only triage, packaged editor generation, web health/assets/scan and separate-process fixes. |
| Fix verification in installed archive | Actual Node baseline test fails; approved result test passes; status and rollback succeed. Model response is mocked, checks are executed. |
| Preliminary `npm publish` dry run | Passed against the exact tested tarball; no registry write. Final dry run is repeated after remote CI. |

A clean-checkout run selected Node 26/npm 12 and exposed a release-tooling
compatibility defect: npm 12 emits package-keyed JSON instead of the earlier
array. The guard was repaired and regression-tested before tagging. This does
not change the shipped runtime archive; final exact-commit results are recorded
in the local approval packet.

The canonical fresh-checkout archive also normalizes two public JavaScript
modules from owner-only 0600 to normal 0644 permissions. All 829 file contents
match the preliminary archive. The canonical tarball was reinstalled and its
complete workflow reverified on Node 20 and Node 24 before freezing this hash.

Machine-readable details: [verification](verification.json) and
[package inventory](package-files.json). The archive SHA-256 is
`b9a306b8c2b209278cd6ad970e2dfd398834f0394066b5925744b434af7378f0`.
VSIX SHA-256 is
`2221b731a579e12886c16e3d5ed98db3fb936b06fd624771a225030ceaf4b3fb`.
The core has zero runtime dependencies. The npm archive includes all generated
CLI/server/shared/browser modules, 98 inventoried vendor assets, user guides,
release/migration notes, editor sources and its dependency-free packaging helper.
Local memory, `.codex`, tests, source directories, caches, benchmark artifacts,
credentials, VSIX build output and unrelated local work are excluded from npm.

## Warnings and unverified integrations

- Existing low [KaTeX advisory](https://github.com/advisories/GHSA-238p-pmpm-9mq7)
  remains accepted under the current policy, not fixed. Strict Mermaid rendering
  and output sanitization mitigate the application path. Review by 2026-11-09.
- Model tests are controlled responses/local mock HTTP. Live AI/Hermes quality,
  live GitHub App/private accounts and actual VS Code GUI activation were not
  verified. Public read-only GitHub triage was verified during Phase 5A.
- Full Phase 4 is incomplete. Static review can miss defects and emit false
  positives. Worktrees are not OS execution sandboxes. Checks require separate
  explicit trust/allowlist/digest approval.
- Host verification covers macOS ARM64 Node 20/24. GitHub's Linux Node 20/22/24
  CI must pass for the exact pushed commit before npm publication.
- Interactive npm authentication/2FA may still be required even though the
  current identity `its.amit` is verified as package owner. GitHub identity
  `Amitpandey88` was verified through an existing credential helper without
  exposing credentials or storing them in artifacts.

## Remaining release sequence — requires final approval

1. Present the final commit, local `v1.1.0` annotated tag, tarball hash, tests,
   notes and warnings. Human approval is the release review gate.
2. Recheck remote main and version/tag availability. If main changed, stop and
   reconcile/retest; never force-push or bypass branch protections.
3. Push the approved commit to main and its exact annotated tag. Wait for the
   commit's GitHub CI. A failure stops publication.
4. Create the GitHub Release from that verified tag/notes and attach the tested
   npm archive and VSIX. The GitHub connector lacks release creation and the
   GitHub CLI is unavailable, so the standard [GitHub Releases API](https://docs.github.com/en/rest/releases/releases#create-a-release)
   can use the existing Git credential helper, with credentials only in memory.
5. Recheck npm registry/account and version absence; perform the final
   [npm publish dry run](https://docs.npmjs.com/cli/v11/commands/npm-publish/).
   Publish the already-tested tarball, retaining its bytes. Source lifecycle
   checks have already run; publishing the tarball must not rebuild new bytes.
   Authentication codes/tokens must stay out of logs and release artifacts.
6. Verify GitHub tag/release and npm 1.1.0 metadata, then install the registry
   package into another clean environment and smoke-test help/core commands.
   If any external step fails, preserve the commit/tag/package state and report
   the failure; do not invent a version or rewrite a published tag.
