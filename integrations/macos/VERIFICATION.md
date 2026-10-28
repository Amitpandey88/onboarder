# Desktop preview verification — 2026-10-27

Local branch: `codex/macos-workspace`. Desktop 0.1.0 preview, core 1.1.0 with
unpublished shared UI and security changes. No publication or deployment.

- Core `npm run check`: **1,046 passed**, zero failures, one optional Compiler API
  skip; 472 generated outputs, 99 vendor assets and 837 core package files
  verified. Architecture gate: zero violations.
- Eight focused desktop tests pass. All four dependency audits report zero
  advisories, with zero advisory exceptions.
- Apple Silicon packaged app: all 14 views, sandbox settings, actual TypeScript
  worker diagnostic, chat/shell PTYs, Unicode, bundled Node with restricted PATH,
  separate project windows and duplicate-project focusing pass; no page errors.
- Apple Silicon packaged sidecars: isolated tokens/ports/terminals, real scans,
  local HTTP Git cloning, existing-destination protection, persistent checkout
  retention and owned-process exit pass.
- Browser: all 14 views, light/dark and 390px layouts; no page errors or horizontal
  overflow. Twenty-two diagram renders plus click navigation, strict policies,
  protected layout, hostile markup, CSS containment and inherited-trust math pass
  with no external requests.
- Both architecture DMG and ZIP artifacts were built. Archive SHA-256 checks,
  internal DMG checksums and deep/strict ad-hoc code-signature verification pass.
  1,688 packaged source comparisons match the current source; the desktop-only
  terminal stylesheet link is the intentional staged HTML difference.

## Release gates and limits

These are **development artifacts**, ad-hoc signed and not notarized. Developer
ID signing, signed-build Keychain/Gatekeeper verification and native Intel
validation remain required before public distribution. The Intel Node runtime
runs under Rosetta, but the packaged Intel GUI smoke did not obtain a page on
this Apple Silicon host. A separate Intel sidecar clone fixture failed because
Apple CLI tools on this host lack x86_64 libxcrun. Native CI was prepared for both
architectures; no workflow was pushed or dispatched. No live model calls, private
account writes or real provider keys were used in verification.

The sanitizer audit initially found three DOMPurify advisories in the existing
Mermaid distribution. The actual shipped bundle now embeds DOMPurify 3.4.17,
rebuilt reproducibly from official Mermaid ESM with pinned dependencies and
third-party notices. Audit metadata was not substituted for a real bundle fix.

Detailed local receipts and screenshots are in ignored `dist/qa/verification.json`.
The shared website’s pre-existing changes were preserved. The CLI and web npm
package still have no runtime dependencies.

## Artifact SHA-256

```text
3a31101773d3e349b24c04844b20a6f16647f89ccc8e8264823b718d9016ad14  Onboarder-0.1.0-DEVELOPMENT-arm64.dmg
810424cd30881c6159887f69a95e93eaeaa2043397787eac41f0218b4e0a7113  Onboarder-0.1.0-DEVELOPMENT-arm64.zip
15b395f8a99d9fec51841e32772ff04c67629e09da4e4ebe656306de978203cc  Onboarder-0.1.0-DEVELOPMENT-x64.dmg
cc6a238bfd46213bf1307696565b214798a7fc447f45eaba71f21a0fd7260f00  Onboarder-0.1.0-DEVELOPMENT-x64.zip
```
