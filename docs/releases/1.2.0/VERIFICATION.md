# Release verification — 1.2.0 / Mac preview 0.1.6

Verified on 28 October 2026 on an Apple Silicon Mac. These are dated results,
not guarantees for every repository, provider or device. Publication status is
recorded separately in GitHub Releases and npm.

- Complete core check on Node 24.20.0: 1,047 tests, 1,046 passed, zero failed,
  one optional Compiler API integration skipped. Strict types, 474 generated
  outputs, 99 vendored assets, 841 package files and architecture checks pass.
- Core development, vendored browser, diagram-build and isolated desktop audits:
  zero advisories, with no accepted advisory exceptions.
- Desktop strict terminal types and all 13 native-message, storage, credential,
  project-state and clone-ownership policy tests pass.
- Packaged native Apple Silicon app: all 14 implemented workspace views, actual
  Monaco TypeScript worker diagnostics, shell/chat tabs, Unicode input, Ctrl-C,
  terminal resizing and focus restoration, built-in Demo terminal, restricted
  PATH without global Node/npm, separate project windows and duplicate focus.
- Packaged UI: readable hover/focus tooltips, About project / About Onboarder,
  System's three appearance icons/modes and OS following, AI connection routing,
  folder Home, clone progress/cancellation and temporary-project cleanup pass.
- Backend smoke: private token/port isolation, repository-bound terminals,
  bundled Node, early process output/exit, persistent clone retention, existing
  destination protection and owned process cleanup pass.
- Browser: all 14 views, 390px drawers and settings/About layouts; 22 diagram
  renders and hostile markup/CSS/math/layout cases pass without page errors,
  unexpected external requests or horizontal overflow.
- 851 packaged/core/main/backend source comparisons match. DMG CRC validation,
  ZIP integrity, SHA-256 checksums and deep/strict ad-hoc signature verification
  pass. The archived app contains core 1.2.0 and bundled Node/npm 24.20.0.
- Fresh installation from the exact npm tarball: version/help, offline review,
  intelligence rules, actual web startup/scan/assets, MCP initialization, all
  18 MCP tools and actual scan on a path with spaces and Unicode pass.
- Static website: 41 HTML pages, 3,539 links/assets, 302 search targets,
  70 commands and 18 MCP schemas validated. Homepage and five key guides tested
  at 390/768/1440px, including search, install controls and themes, without
  first-party page errors, missing local assets or horizontal overflow.

## Distribution limits

Mac downloads contain only Apple Silicon. They are explicitly DEVELOPMENT
previews, ad-hoc signed and not notarized. No valid Developer ID identity is
configured. Gatekeeper may block them. Intel cross-builds are not distributed
or claimed as supported. Live provider quality, actual macOS Keychain UI on
another account, arbitrary external tool installations and every device policy
are outside these checks. No full team/planner/post-merge features are added.
