# Solid controls, panels and terminals — 0.1.3, 2026-10-28

Local Apple Silicon development update. No publication or deployment; existing
website changes, projects, credentials and conversation/history locations retained.

## Fixed behavior

- Removed the glass appearance setting, styles, capability fields and obsolete
  saved preference. Buttons use stationary rounded hover/focus backgrounds and
  clear active states in both themes. Reduced Motion remains supported.
- Files and Details now control their actual panels in all workspace views.
  Intelligence, Review and Triage no longer force the panels hidden. Initial
  expanded/pressed states match saved visibility. Narrow screens retain working
  file/details drawers, including the formerly full-width views.
- Terminal opens Shell by default. Onboarder Chat is an explicit separate tab.
  Input is focused after creation/reopening; hidden sessions keep running. Tabs
  have proper panels, keyboard selection, unique names and visible ended state.
  The top edge resizes the terminal, including keyboard resizing; its height is
  bounded and saved per project. Resize messages are batched and deduplicated.
- Native Ctrl+backtick input uses one main-process path, suppressing duplicate
  menu/renderer dispatch. The menu command also works. See Electron's
  [before-input-event documentation](https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event).
- Terminal loading failures expose Retry/Close. Retrying uses a new module URL;
  module URLs include the app version and desktop assets use no-store. Startup
  output and exit status are retained until the renderer attaches, including a
  shell that exits immediately. Ended process IDs are excluded from cleanup kills.
- The built-in source demo now opens a real repository window with its own
  rooted backend. Previously its welcome backend had no repository, so terminal
  startup failed even though analysis had loaded. Demo bundles are excluded from
  native recent projects; browser demo behavior is retained.
- Startup holds controls behind a small loading screen until handlers are ready.
  Workspace errors remain visible outside the hidden home screen, recovery banners
  are deduplicated, and activated tooltips dismiss instead of lingering.

## Verification

The focused interaction script checks Files/Details hide/show in all 14 views,
four narrow-screen drawer contexts, default Shell input and bundled Node, Ctrl+C,
hide/reopen focus, tab switching, terminal height, exit state, Chat creation,
native menu/keyboard input and a working terminal in the real built-in demo.
Source checks pass with zero page errors. The keyboard test uses Electron's input
API; Chromium CDP keyboard injection bypasses its native input hook.

Backend fixtures cover early process exit/output, token/port/session isolation,
actual analysis and Git clones, persistent-checkout protection and process exit.
The existing complete core checks, desktop policy tests, browser/diagram checks,
packaged application and archive/source checks are recorded in ignored `dist/qa/`.

Final results: 1,046 core tests passed, zero failures and one optional Compiler API
skip; 474 generated outputs, 99 vendor assets and 840 package files verified,
zero architecture violations. All 13 desktop tests and strict terminal typechecks
pass. Packaged interaction checks pass across all 14 views, four drawer contexts,
real shell input/Ctrl+C/tab switching/resizing and the built-in demo terminal.
The source run additionally passes native menu and Electron keyboard-input tests.
Packaged Monaco worker, Chat/Shell, Unicode, restricted-PATH Node and project-window
checks pass. Early-exit output, token/terminal isolation and real clone fixtures
pass. Browser's 14 views, 390px layout and 22 diagram/security renders pass with
zero page errors/overflow. All four dependency audits have zero advisories.
850 packaged-source comparisons match; SHA-256, DMG/ZIP integrity and deep/strict
ad-hoc code-signature verification pass. The final 0.1.3 app was opened for use.

Artifacts are in `dist/packages/0.1.3/`: Apple Silicon app, DEVELOPMENT DMG/ZIP,
SHA256SUMS and build status. These are ad-hoc signed, not notarized; Developer ID
signing remains unconfigured. No Intel downloads are generated.
