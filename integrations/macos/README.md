# Onboarder for macOS

Onboarder.app brings the existing analyzer, diagrams, code editor, Intelligence,
Review, approved fixes and PR Triage into a Mac workspace. The shared interface
also serves the browser; the CLI remains independently usable.

The desktop package is versioned separately: **0.1.6 preview**, with core 1.2.0.
Current builds target macOS 14 or later on Apple Silicon. The development preview is distributed from the
[macOS preview release](https://github.com/Amitpandey88/onboarder/releases/tag/macos-v0.1.6). Intel cross-build code remains unverified and is not included in the
retained downloads.

## Build and run

Use macOS, Node 24, Apple Command Line Tools, and the locked dependency files.
Run the following inside this directory:

```sh
npm ci --ignore-scripts
npm run setup
npm run stage
npm test
npm start
```

Setup explicitly provisions Electron and downloads the pinned official Node
24.20.0 archive, checked against the reviewed SHA-256 in `scripts/setup.mjs`.
Stage rebuilds node-pty against that Node ABI and the selected architecture,
copies the core npm packlist, bundles xterm assets and includes third-party
licenses. Native builds and Electron provisioning run only through these explicit
commands; dependency installation disables lifecycle scripts.

The committed icon is rendered from the existing code-compass SVG. To regenerate
it with local Chrome installed, run `node scripts/icon.mjs`.

```sh
npm run package:arm64
npm run package:x64
```

Artifacts are in `dist/packages/0.1.6`: the Apple Silicon application, DMG
and ZIP files, checksums and build status. Development archives have DEVELOPMENT
in their filenames and an ad-hoc signature. They are not notarized and may be
blocked by Gatekeeper on another Mac. Do not present them as a signed release.
The development build disables hardened runtime so ad-hoc-signed native modules
can load; the release build retains hardened runtime and requires a Developer ID.

For a distribution build, configure Developer ID signing with `CSC_NAME` or
`CSC_LINK`, and notarization through the supported Apple credentials or Keychain
profile. Run `npm run package:release`. Missing signing/notarization configuration
fails rather than silently producing a development release. Signature, Gatekeeper
and stapled notarization checks must pass. The command never publishes artifacts.
Keep signing credentials out of source, logs and documentation.

## Working with projects

- Open folders through the native chooser, typed paths, drag-and-drop, Open Recent
  or `open -a Onboarder /path/to/project`. Each folder has a separate window and
  private backend. Opening the same canonical folder focuses its existing window.
- **About project** is at the top of Explore and retains the loaded repository's
  statistics, stack, history and scan details. **About Onboarder** at the bottom
  opens app information, the official website, npm package, GitHub repository,
  CLI install command and credits. It is also available from Project Home and
  the native application menu, including before a project is loaded.
- Project Home supports folder drop, native opening, typed paths and cloning.
  Choose **Keep on my Mac** for a persistent checkout in a new destination, or
  **Temporary project** for private application storage removed after closing.
  The choice is remembered. Git progress, cancellation and an opening screen
  show the current operation. Existing destinations are never overwritten.
  Temporary cleanup requires an application ownership receipt; unknown folders
  and user-owned checkouts are never swept. Browser URL scans remain temporary.
- Buttons use a solid rounded hover/focus treatment. Glass styling and its UI
  setting have been removed. System contains icon-labelled Light/Dark/System appearance choices, AI connection,
  motion and clone-storage choices.
  System Reduce Motion continues to take priority.
- Files and Details toggle their panels in every view, including Intelligence,
  Review and Triage. On narrow screens they use drawers with Escape/Close controls.
- Panel dragging batches layout changes once per frame and saves its final size
  on release. Reading preferences and refocusing a window do not rebuild its
  native view hierarchy or rebroadcast unchanged appearance settings.
- Terminal opens a working shell by default; **+ Chat** starts Onboarder Chat.
  The top edge resizes the panel; hiding it retains sessions and restores input
  focus when reopened. Ctrl+` uses one native shortcut path.
  The bottom panel offers Onboarder Chat and shell tabs. Sessions retain their
  original repository. Closing a running terminal or project asks before stopping
  its processes. Hiding the panel leaves sessions running. Terminal scrollback is
  bounded; shell sessions are not replayed after a restart.
- The app bundles Node and npm. Its shell PATH also offers `onboarder` and
  `codebase-onboarder` without installing a global CLI. Git, Hermes and external
  analyzers remain optional separately installed tools. Missing tools produce
  status/setup messages; ordinary folder analysis works offline.
- Hermes and analysis history use the existing Onboarder locations. Desktop
  window state, recent folders, renderer storage and encrypted provider keys use
  `~/Library/Application Support/Onboarder`. Provider-key storage is opt-in and
  Keychain-backed; unavailable Keychain storage never falls back to plaintext.
  Browser keys remain in memory. Browser local storage is not automatically
  imported into the desktop app.
- The private desktop backend does not reconfigure an existing daemon, network
  listener, tunnel, login item or self-hosted deployment. Use the standalone CLI
  or browser server settings for those operations.

## Verification

From the repository root run `npm run check` and `npm run security:audit`.
From this directory, after staging:

```sh
npm test
node scripts/backend-smoke.mjs
node scripts/smoke.mjs
node scripts/ui-smoke.mjs
node scripts/controls-smoke.mjs
node scripts/performance-smoke.mjs --files=2000
```

The backend smoke uses local fixture repositories and a local Git HTTP server to
verify backend/token/terminal isolation, persistent cloning, destination
protection, bundled Node and process cleanup. The Electron smoke uses temporary
profiles and a restricted PATH; it exercises every workspace view, sandbox
settings, chat/shell terminals, Unicode and multiple windows. Models are not called.
Reports and screenshots are saved to ignored `dist/qa`.
The UI smoke checks full-text tooltips, solid control styling, saved preferences,
reduced motion, Project Home, real local Git cloning and temporary close cleanup.

`node scripts/smoke.mjs /absolute/path/to/Onboarder.app/Contents/MacOS/Onboarder`
tests a packaged executable. Packaged builds disable inspector fuses, so the test
connects to their Chromium debugging interface rather than the main-process Node
inspector. Signed-build Keychain/Gatekeeper verification remains a separate
release requirement; any future Intel release also needs native Intel testing.

The browser smoke (`scripts/browser-smoke.mjs`) expects the isolated development
preview on port 4329 and checks desktop/mobile navigation, themes and overflow.

Source of truth: core TypeScript under `src/`; the desktop runtime in this
directory; generated browser/server output rebuilt through the core build.

Smoke tests use a fixture-owned interactive Bash launcher with user startup
profiles disabled. This prevents the CI host's nvm/asdf setup from substituting a
global Node while verifying the bundled runtime. Production still uses the user's
chosen shell and its normal profiles. The backend check verifies both the actual
resolved Node path and its version.
