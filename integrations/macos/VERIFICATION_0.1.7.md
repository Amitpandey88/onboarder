# Public development preview 0.1.7 — 25 November 2026

Updates the Apple Silicon macOS desktop preview with built-in update detection,
`SHA256SUMS` checksum verification, `Info.plist` + `/usr/bin/codesign --verify --deep --strict`
validation, atomic `.app` bundle replacement/relaunch (with verified `.dmg` download
fallback), native **Onboarder → Check for Updates…** menu actions, **System** dialog
entry, and core **1.5.0**. Intel artifacts remain excluded.

## Verified results

- Root `npm run check`: `typecheck` (`tsc` + `tsconfig.strict.json`), `1,072`
  Node tests (`1,071` pass, `1` skipped baseline, `0` failed), `492` generated JS
  and `.d.ts` files, `23` locked dependencies, `99` vendor assets, `874` npm
  package files, and `[]` high-severity architecture findings.
- Desktop unit & policy suite (`npm --prefix integrations/macos test`):
  TypeScript check + `17/17` tests passing (`appearance`, `clones`, `policy`,
  `store`, `updater`).
- Packaged Apple Silicon archive build (`npm --prefix integrations/macos run package:arm64`):
  - `Onboarder-0.1.7-DEVELOPMENT-arm64.dmg`
    (`0e561fbfda06266948de43b7585b6f304786cd93fb9466fca2b6bcf469fd928c`)
  - `Onboarder-0.1.7-DEVELOPMENT-arm64.zip`
    (`728fecf9bcffb63380aeed11143d4a5f8bb64c0778df87f15b9695da9d5e20f3`)
  - Deep strict `/usr/bin/codesign` check passed for ad-hoc signature.
- Source comparison (`verify-packaged.mjs --arm64`): `885` file & asar
  comparisons against reviewed sources with `0` mismatches.
- Packaged UI & end-to-end smoke checks (`smoke.mjs`, `ui-smoke.mjs`,
  `backend-smoke.mjs`, `update-smoke.mjs`, `browser-smoke.mjs`): all passed
  with `0` page errors.

This remains an ad-hoc-signed **DEVELOPMENT** preview, not notarized and not a
Developer ID signed distribution build. Gatekeeper may prompt when downloaded
directly. See `BUILD-STATUS.json` and `SHA256SUMS` on release `macos-v0.1.7`.
