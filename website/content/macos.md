## Download the Apple Silicon preview

Onboarder for macOS **0.1.6 development preview** includes core **1.2.0**, Node and npm. It requires **macOS 14 or later on Apple Silicon**. No separate Node installation is needed for the app's backend, CLI or MCP workflows. Intel downloads are not provided.

- [Download the development DMG](https://github.com/Amitpandey88/onboarder/releases/download/macos-v0.1.6/Onboarder-0.1.6-DEVELOPMENT-arm64.dmg)
- [Download the development ZIP](https://github.com/Amitpandey88/onboarder/releases/download/macos-v0.1.6/Onboarder-0.1.6-DEVELOPMENT-arm64.zip)
- [SHA-256 checksums](https://github.com/Amitpandey88/onboarder/releases/download/macos-v0.1.6/SHA256SUMS)
- [Build status and release notes](https://github.com/Amitpandey88/onboarder/releases/tag/macos-v0.1.6)

> This build is ad-hoc signed and not notarized. There is no configured Developer ID identity for production distribution. Gatekeeper may block it on another Mac. Review the source or wait for a notarized build if your device policy requires one. The preview has no automatic updater; check the release page manually.

Open the DMG and drag Onboarder into Applications, or unpack the ZIP. Keep your current app until you have verified the new one. Existing preferences, repository checkouts, conversations and history are retained.

## Open your project

Project Home offers **Open Folder**, typed paths, folder drag-and-drop and recent projects. Reopening an already-open folder focuses its window. Every repository has a separate window and backend, while selected views, files, panel sizes and map positions are saved.

Choose **Clone Repository** to clone from GitHub or another supported Git host. Git is required. Choose **Keep on my Mac** and a new destination for a permanent checkout, or **Temporary project** for application-managed storage. The choice is remembered. Git progress, a loading spinner and cancellation show what is happening. An existing destination is never overwritten. Temporary checkouts are removed when their project closes, using application ownership receipts; user-owned checkouts are retained.

## Work in the same workspace

The [browser workspace](/docs/web/) and Mac app share Explore, Graph, Code, Docs, Intelligence, Deep Analysis, Heatmap, Insights, SBOM, Review, Triage, Diff and Workflows. **About project** shows repository details at the top of Explore; **About Onboarder** shows product links and credits at the bottom.

**System** contains AI connection, Light/Dark/System appearance with icons, motion and clone-storage choices. Files and Details can be resized or collapsed in each view. Controls have solid rounded hover and focus states; Liquid Glass is removed. System reduced-motion settings take priority.

## Shell and Onboarder Chat

**Terminal** opens a shell in the current repository. **+ Chat** starts Onboarder Chat using the existing provider or Hermes setup. Tabs are labeled with their repository, resize with the bottom panel and keep their sessions when hidden. Ctrl-backtick toggles the terminal. Closing active work asks before stopping its processes. Commands and approvals are never automatically replayed after a failure or restart.

Node, npm, `onboarder` and `codebase-onboarder` are available in the bundled shell. Git, Hermes and external analyzers remain optional separately installed tools. Missing tools show setup controls. Core folder analysis works offline.

## Settings and credentials

Existing Hermes login, conversations and analysis-history locations are reused. Desktop preferences, recent projects and window state are separate in `~/Library/Application Support/Onboarder`. **Remember on this Mac** is optional for direct provider keys and uses Keychain-backed encryption. Otherwise keys stay in memory. Browser provider keys remain session-only.

Desktop private backends do not change an existing browser server's ports, network settings or authentication. External links open in your system browser; exports use native save dialogs.

## Build and verification

The [desktop source guide](https://github.com/Amitpandey88/onboarder/blob/main/integrations/macos/README.md) contains locked build commands, signing requirements, cleanup rules and test details. Development archives are explicitly named DEVELOPMENT. Production builds require Developer ID, hardened runtime, notarization and signature verification. Apple Silicon is the only distributed architecture.

## Signed distribution setup

A signed and notarized replacement requires an active Apple Developer Program membership, a Developer ID Application certificate with its private key, and notarization credentials. The release builder already enforces signing, hardened runtime, notarization and verification. The [signing setup guide](https://github.com/Amitpandey88/onboarder/blob/main/docs/MACOS_SIGNING.md) describes the remaining account and Keychain steps. Preview downloads retain their development label until a verified replacement is published.
