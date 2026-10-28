# Onboarder 1.2.0 — 28 October 2026

The browser workspace and the new Mac development preview share the same
repository views, analyzer, diagrams and editor. The core npm package retains
Node.js 20+ support and zero runtime dependencies.

## Workspace

- Grouped Explore, Analyze and Changes navigation, with About project at the top
  and a separate About Onboarder dialog for product information and links.
- Adjustable Files and Details panels across every view; narrow screens use
  drawers. Explore map navigation, zoom and connection locking are retained.
- System settings combine AI connection and explicit Light, Dark and System
  appearance controls. Keyboard focus and reduced-motion preferences remain.
- Solid rounded hover/focus controls, readable full-text tooltips, loading states
  and fewer repeated layout/preference updates. Liquid Glass has been removed.

## Apple Silicon Mac development preview 0.1.6

The separate desktop package bundles Node and npm, and runs each repository in
its own window with a private loopback backend and isolated renderer. Native
folder selection, exports, Open Recent, folder drop and Dock reopening are
included. Shell and Onboarder Chat terminals stay attached to their repository.

Clones can be kept in a new user-selected destination or stored temporarily in
application-owned storage. Progress and cancellation are visible. Cleanup checks
ownership receipts and does not remove user checkouts. Remembered direct provider
keys are opt-in and use macOS Keychain-backed encryption. Existing Hermes setup,
conversations and analysis history are reused.

**Development preview only:** macOS 14+ on Apple Silicon, ad-hoc signed and not
notarized. Gatekeeper may block this build on another Mac. There is no Developer
ID identity configured for production distribution. Intel artifacts and Intel
support claims are not included. Review the source or wait for a notarized build
if your device policy requires one. No automatic updater is installed.

[Mac preview downloads and checksums](https://github.com/Amitpandey88/onboarder/releases/tag/macos-v0.1.6)
· [Mac source and build guide](../integrations/macos/README.md)
· [Website guide](https://onboarder.intellimatrix.in/docs/macos/)

## Dependencies and compatibility

The reproducible Mermaid bundle includes DOMPurify 3.4.17 and KaTeX 0.18.11, with
locked build dependencies, third-party licenses and checked asset integrity.
Browser diagrams continue to require an ES2024 browser (Safari 17.4+).

Existing review/fix approvals, rollback, PR triage, CLI, MCP and optional Hermes
workflows remain. Git, Hermes and external analyzers are separate optional tools;
local folder analysis works offline. The desktop terminal is available in the
Mac app; the browser continues to use the standalone CLI for interactive shells.
The unfinished planner, full team platform and post-merge features are excluded.

## Install

```sh
npm install -g codebase-onboarder@1.2.0
onboarder --version
onboarder start
```

The npm package contains the web workspace and CLI. The Mac app is a separate
download, keeping Electron and native terminal dependencies out of the core.
See the repository's release verification record for dated results and limits.
