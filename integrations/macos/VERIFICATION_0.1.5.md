# App information and project overview — 0.1.5, 2026-10-28

Moved the existing repository About page to the top of the Explore group as
**About project**. Existing `about` view identifiers, saved navigation, statistics,
stack/history/scan coverage and remote facts are retained.

The bottom **About Onboarder** opens a separate accessible app-information dialog.
It contains a short product description, local-analysis/optional-AI explanation,
website, npm package and GitHub links, CLI installation command, creator and MIT
license credit. The desktop preview version comes from the running application.
Project Home and the native About menu open the same dialog without requiring a
repository. Opening app information does not replace or rerender project details.

Links are the project's existing official addresses: website HTTP 200/title
verified; npm registry identifies `codebase-onboarder` 1.1.0 and the matching GitHub
repository; GitHub page accessible. No version/download/star counts are fetched
when displaying the dialog. External links use noopener/noreferrer and the app's
existing system-browser handler. Nothing is installed automatically.

Focused browser/Electron checks cover placement, repository statistics retained
after repeated navigation, app description/resources/command, active-view state,
Project Home access and 390px layout. Complete core/desktop checks and final
packaged/source/archive results are recorded in ignored `dist/qa/`.

Final results: 1,046 core tests passed, zero failures and one optional Compiler
API skip; 474 generated outputs, 99 vendor assets, 840 package files and zero
architecture violations. All 13 desktop tests and strict terminal types pass.
Packaged About/System checks and 14-view panel/terminal/demo checks pass without
page errors. Browser placement/content/navigation and 390px About layout pass
with no horizontal overflow; all 22 diagram/security renders pass. All 850
packaged-source comparisons match; archive SHA-256, DMG/ZIP integrity and
deep/strict ad-hoc signatures pass. The final app was opened with the user's
Hermes repository and the new About Onboarder dialog visible.

Apple Silicon preview only: `dist/packages/0.1.5/`. Existing website edits and
project data preserved; no publication, deployment or account writes. Ad-hoc
signed and not notarized; Developer ID configuration unchanged.
