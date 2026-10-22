# Upgrade to Onboarder 1.1.0

## Installation

Use Node.js 20 or newer. The core npm package has no runtime dependencies.

```sh
npm install -g codebase-onboarder@1.1.0
onboarder --version
onboarder --help
```

`npx --yes codebase-onboarder@1.1.0 --help` runs the pinned version without a
global installation. Installation has no automatic install hooks, agent setup,
repository modification, GitHub publication or deployment.

## Existing users

- Existing settings, `.onboarder.json`, `.onboarder-review.json`, team grants,
  local workspace data and Hermes profiles are retained. No automatic storage
  conversion or new external account is required.
- Offline analysis/review remains available without a model. AI review and fix
  generation require explicit user actions and existing provider configuration.
- Existing JSON/Markdown/SARIF consumers retain the previous report fields;
  new fields carry evidence, source and coverage. Consumers must not interpret
  absence of findings or a successful model response as verification.
- Check-plan digests now include hashes of raw package lifecycle definitions.
  Saved development approvals may no longer match; inspect a fresh plan and
  explicitly approve it. Do not reuse or alter an old digest to bypass the check.
- The existing free-task Hermes implementation flow remains available. The
  finding-linked fix flow adds exact-patch approval and separate check permission;
  it does not silently apply patches requested only for explanation.
- Newly approved fixes remain in separate worktrees. Final acceptance records
  your decision; transfer/commit/PR creation is a separate authorized action.

## Optional integrations

Configure provider credentials privately through the existing environment or UI;
do not put keys into repository files or release artifacts. See
[contextual review](CONTEXTUAL_AI_REVIEW.md) for API/local endpoint and Hermes setup.

The TypeScript Compiler API is a separately installed optional engine. Existing
`onboarder intelligence semantic-setup` remains available; a trusted absolute
`ONBOARDER_TYPESCRIPT_MODULE` can select an already installed compiler. Without
it, supported lexical/import analysis continues and semantic unavailability is
shown explicitly.

VS Code extension 0.2.0 is separate from npm package version 1.1.0. Install the
provided VSIX manually in a trusted workspace. The npm archive also includes
`integrations/vscode/` and `scripts/package-editor.mjs`, so the installed package
can build the VSIX without downloading build dependencies. From its package
directory run `npm run editor:package`, then use **Install from VSIX** in VS Code.
The extension uses your installed local CLI; `onboarder.cliPath` can select a
specific `bin/onboarder.js`. No Marketplace publication is part of this release.

PR triage uses public GitHub access or the existing CLI environment credentials.
GitHub App checks and team access require explicit operator configuration. Their
permissions and publication defaults are unchanged except narrower read-only App
tokens when publication is disabled. No other Git provider is claimed supported.

## Release scope

The dedicated Change Stack, engineering planner, complete collaboration workflows
and post-merge automation drafts are unfinished. See
[release notes](RELEASE_1.1.0.md) for verification boundaries and known risks.
Worktrees are not execution sandboxes; authorize only reviewed checks in a trusted
environment. Back up local configuration/workspaces before any downgrade; newer
fix records and model fields are not a promised interface for older releases.
