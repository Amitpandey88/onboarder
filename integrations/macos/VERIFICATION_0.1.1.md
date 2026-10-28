# Desktop UI preview 0.1.1 — 2026-10-27

Local development on `codex/macos-workspace`, with core 1.1.0. Existing website
edits and the running 0.1.0 application were preserved. No publication, deployment
or global installation was performed.

## Implemented and checked

- A 36px sidebar button, accessible hover/focus tooltips, full repository path
  disclosure and single-line inspector filenames replace the clipped controls.
  Keyboard focus remains readable while the panel scrolls.
- UI settings offer opt-in native Liquid Glass on macOS 26+, backed by the public
  AppKit `NSGlassEffectView`, with system-controlled material appearance. Reduce
  Transparency and Increase Contrast select opaque paper. Reduced Motion takes
  priority over application animation preferences. The Mac used for this check
  runs macOS 27 on Apple Silicon; native glass toggling succeeds in source and
  packaged applications. Real global Clear/Tinted preferences were not changed
  during testing; AppKit owns those preferences. Older macOS behavior is covered
  by policy tests, not a second physical machine. Building this bridge requires
  an SDK with the macOS 26 AppKit declarations.
- Project Home supports folder drop, native opening, typed paths, recent folders
  and Git cloning. Permanent/temporary clone storage is remembered. Real Git
  progress and cancellable opening feedback are shown with a spinner. Temporary
  projects carry ownership receipts and are excluded from recent projects.
  Closing their window removes the checkout after stopping its processes; stale
  owned checkouts are swept on startup. Unknown directories, symlinks and
  user-owned checkouts survive cleanup.
- Thirteen focused desktop tests pass, covering appearance/accessibility,
  preference validation, real process progress/cancellation, safe temporary
  cleanup, native-message validation, terminal isolation, credentials and storage.
- Source and packaged UI smoke checks pass for tooltips, native glass, reduced
  motion, saved clone preferences, home opening, clone cancellation and a real
  local Git checkout. The source smoke additionally verifies automatic deletion
  on a confirmed temporary-window close.
- Packaged Apple Silicon workspace: all 14 views, actual TypeScript worker
  diagnostics, chat/shell PTYs, Unicode, bundled Node on a restricted PATH,
  separate project windows and duplicate-folder focusing pass; zero page errors.
- Packaged backend: token/port/terminal isolation, actual local analysis and Git
  cloning, existing-destination protection, persistent files after exit and owned
  process cleanup pass.
- Browser: all 14 views; readable full-path tooltip, appearance settings,
  dark/light, 390px home/settings/navigation with no horizontal overflow; zero
  page errors. All 22 diagram/security renders pass with no external requests.
- Complete core checks pass: 1,046 tests passed, zero failures and one optional
  Compiler API skip; 474 generated outputs, 99 vendor assets, 840 package files;
  architecture gate reports zero violations. Core, browser vendor, diagram-build
  and desktop dependency audits report zero advisories and zero exceptions.

## Delivery and remaining release gates

Both architecture-specific `.app`, `.dmg` and `.zip` development builds are in
`dist/packages/0.1.1/`, alongside SHA256SUMS and BUILD-STATUS.json. Archive SHA-256,
internal DMG integrity, ZIP integrity and deep/strict ad-hoc signatures were
checked. `scripts/verify-packaged.mjs` compares both bundles with the current
source: 1,700 comparisons, zero mismatches. Receipts and screenshots remain in
ignored `dist/qa/`.

Apple Silicon was tested natively. Native Intel testing remains required before
claiming Intel support; cross-building and a valid signature do not establish
that support. No valid Developer ID identity is configured. These builds are
ad-hoc signed, not notarized and not a public release. Signed-build Keychain,
Gatekeeper, macOS 14–26 device checks and native Intel execution remain release
gates. No live model calls or real provider keys were used.
