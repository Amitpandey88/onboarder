# Onboarder 1.5.0 — Built-in Auto-Update Across CLI, Web UI & macOS App

Released 2026-11-25.

## What's new

- **CLI & interactive shells (`onboarder update`)**:
  - `onboarder update`, `onboarder update check`, and `onboarder update install`
    query the npm registry with a 12-hour cache, display installed vs latest
    version and release notes, verify Node.js engine compatibility, confirm
    before modifying TTY installs, and run pinned
    `npm install -g codebase-onboarder@<version> --ignore-scripts`.
  - Non-interactive installs (`npx`, local project installs, source checkouts)
    report clear status and exact manual upgrade commands rather than mutating
    unexpected locations.
  - `onboarder status`, `onboarder doctor`, `onboarder start`, interactive
    `/update`, and explorer `update` surface cached update availability.
- **Web UI & Server HTTP API**:
  - `GET /api/update`, `POST /api/update/install` (Server-Sent Events progress),
    and `POST /api/update/restart` enforce same-origin checks and self-hosted
    owner authentication (excluding team members).
  - Topbar update badge, dismissible Project Home banner, live **Updates**
    drawer with progress log, release notes, and **Restart & reload**, plus
    `config.updateCheck` toggle (`ONBOARDER_NO_UPDATE_CHECK=1` env override).
- **Apple Silicon macOS App `macos-v0.1.7`**:
  - Separate GitHub Releases `macos-v*` channel (`Onboarder-0.1.7-DEVELOPMENT-arm64.dmg`
    & `.zip` + `SHA256SUMS`).
  - Downloads with HTTPS host/redirect allowlists, verifies `SHA256SUMS`,
    extracts via `/usr/bin/ditto`, verifies symlink containment, `Info.plist`
    bundle identifier/version, and `/usr/bin/codesign --verify --deep --strict`
    (plus signing Team ID continuity when Developer ID signed), and performs
    atomic `Onboarder.app` swap with rollback and clean relaunch.
  - Falls back safely to downloading & opening the verified `.dmg` when running
    unpackaged from source, under App Translocation, or in a non-writable folder.
  - Wired into the native macOS **Onboarder → Check for Updates…** menu,
    **System** dialog, Project Home banner, and **Updates** drawer.
- **Documentation & README**:
  - Updated README design with original dark/light hero SVG artwork, surface
    overview, and updated documentation for `onboarder.amit.codes`.

## Upgrade

```bash
npm install -g codebase-onboarder@1.5.0
onboarder --version
onboarder update check
```

Retains Node.js 20+ support and zero core runtime dependencies.

## Verification

- Core `npm run check`: `typecheck` (including `tsconfig.strict.json`), unit &
  HTTP integration tests, `build:check`, `security:check`, and
  `architecture:check` pass.
- macOS desktop `npm --prefix integrations/macos test`, `stage`,
  `backend-smoke.mjs`, `update-smoke.mjs`, `ui-smoke.mjs`, `controls-smoke.mjs`,
  and `smoke.mjs` pass.
- Website static build and validation (`website/build.py` + `website/validate.py`)
  plus Chrome desktop & 390px mobile smoke checks pass.
