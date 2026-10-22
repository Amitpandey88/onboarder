# Onboarder for VS Code

Use the command palette to inspect a repository, retrieve evidence for a selection,
review changes, open onboarding journeys, or open the web workspace. Analysis runs
through your local CLI. No AI provider is invoked by these editor commands.

Build a VSIX with npm run editor:package from the Onboarder project, then use
VS Code's Extensions: Install from VSIX command. For a source build,
set onboarder.cliPath to its absolute bin/onboarder.js path. On Windows this
setting is required. The CLI must include the intelligence commands.

The extension requires a trusted workspace. It uses argument arrays, a cancellable
process, a 60-second timeout, and a script-disabled results panel. Repository files
appear in the Explorer's Onboarder view after Onboarder: Inspect Repository.

This is a local extension artifact; it has not been published to the Marketplace.

Extension 0.2.0, supplied with Onboarder 1.1.0, adds **Onboarder: Triage Pull Requests**. It reads the GitHub
origin's first open-PR page, then inspects a selected PR through the same local
CLI triage service. GitHub access uses the CLI environment's GITHUB_TOKEN/GH_TOKEN
or public access. It performs no model calls or GitHub writes. Empty/missing CI
and provisional priorities remain visible in the returned report. For pagination,
filters and optional explanations, use the web Triage workspace or CLI. The
extension's 60-second deadline also applies to PR inspection.
