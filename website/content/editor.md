The optional VS Code extension uses your local Onboarder CLI. It runs in trusted workspaces and does not send source to a model automatically.

## Install

Download `onboarder-0.1.0.vsix` from the [Onboarder v1.0.5 release](https://github.com/Amitpandey88/onboarder/releases/tag/v1.0.5). In VS Code, open Extensions and choose **Install from VSIX**. The extension version is separate from the CLI version.

For source builds, run:

```sh
npm ci --ignore-scripts
npm run build
npm run editor:package
```

The package is written to `integrations/vscode/dist/`. This release does not publish or install it through the Marketplace automatically.

## Commands

- **Inspect Repository** opens local repository information.
- **Find Evidence for Selection** retrieves source locations and excerpts for the selection.
- **Show Change Impact** traces a source file's dependents and suggested tests.
- **Review Changes** opens the current local review.
- **Show Onboarding Journeys** opens guided reading steps.
- **Open Web Workspace** opens your configured local web server.

## Configuration

Install `codebase-onboarder@1.0.5` globally, or set `onboarder.cliPath` to the absolute `bin/onboarder.js` path in a built source checkout. This is a machine-scoped setting and is required on Windows. `onboarder.serverUrl` selects the running web server, normally `http://localhost:4310`.

The extension bounds CLI output and execution time, supports cancellation, and uses argument arrays rather than a shell for repository paths. Source navigation remains within the workspace. Optional external analyzers and explicitly permitted agent checks retain their normal execution boundaries.
