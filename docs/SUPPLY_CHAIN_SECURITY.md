# Supply-chain security

Onboarder has no runtime npm dependencies. Development tools are exact-version pinned in `package.json` and integrity-locked in `package-lock.json`. The published package has no `preinstall`, `install`, `postinstall` or `prepare` hooks. Source users run `npm ci --ignore-scripts` followed by an explicit build.

## Downloaded and installed tools

- Hermes installation remains an explicit terminal choice. The bootstrap comes from immutable upstream commit `dcabf76310ff26e1f264368e9e86277380d98266`; platform-specific SHA-256 pins are checked before execution. The installer receives that same checkout commit. Downloads use HTTPS, bounded streaming, a timeout and restricted redirects. Execution occurs in a private temporary directory, with an allowlisted OS environment and installation paths. Server/model credentials, shell startup hooks, package tokens and repository override variables are excluded.
- Gitleaks 8.24.3 release archives have platform-specific SHA-256 pins taken from the [official release checksums](https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_checksums.txt). Only the named executable is extracted into private staging, validated as a regular file, and atomically moved into the Onboarder bin directory. Unsupported architectures fail closed. Archives and staging are removed after success or failure.
- npm/uvx fallback analyzers use reviewed exact package versions and explicit public registries. npm install scripts are disabled. Package installs run outside the scanned repository; analyzer processes receive an isolated environment. Gitleaks reports live in private per-run directories, with file-type and size checks before parsing.
- Tools already on PATH, Homebrew formulas and winget packages follow the user's installed tool/package-manager trust policy. Homebrew and winget manage their own artifact verification and versions.

These controls verify the bootstrap and release archive, not every operation an external tool can perform. Hermes still provisions its upstream dependencies. Python tools and npm analyzer fallbacks still resolve transitive dependencies; Python packages may run build code. Semgrep registry rules require network access, including `p/default`. Knip may evaluate a repository's configuration/plugins. Run external analysis only on repositories you trust, or inside an isolated machine/container. Configured MCP servers and explicitly authorized AI/check commands are executable extensions and retain their documented credentials/permissions.

## Browser libraries

`public/vendor/manifest.json` records Mermaid 12.2.0 (rebuilt with embedded DOMPurify 3.4.17 and KaTeX 0.18.11) and Monaco 0.52.2, upstream npm archive integrity, licenses and SHA-256 hashes for every shipped asset. The original baseline was compared with integrity-verified official npm archives; the current diagram bundle is reproducibly built from upstream ESM as documented below; the Onboarder worker bootstrap is maintained locally. `security:check` rejects added, removed or changed assets without a reviewed manifest update. HTML uses SHA-384 Subresource Integrity for both initial library scripts. The Monaco worker selector accepts only shipped language workers and rejects arbitrary URLs/modules before loading code.

Mermaid runs in strict mode, with security and CSS configuration keys protected against diagram overrides. Application node navigation uses its own event handlers.

Static responses forbid external script sources, object embeds, base-URL overrides and framing. Monaco's current AMD build requires `unsafe-eval`; it remains a documented compatibility limit. Inline styles and custom AI endpoint connections remain supported. Vendored browser bundles are outside the main npm dependency audit. `security/vendor/package-lock.json` tracks their upstream dependency graph for a separate CI audit; it does not add dependencies to Onboarder or install them. That graph is advisory coverage for the release metadata, not an exact analysis of tree-shaken bundle contents. Review embedded dependencies and upstream advisories when updating assets; integrity alone is not a vulnerability or malware scan. Do not patch or re-hash a minified library simply to silence a scanner.

## Resolved KaTeX advisory

On 2026-10-22, the official Mermaid 12.2.0 browser bundle replaced 11.17.2. Its embedded KaTeX version export is 0.18.11, above the 0.18.2 fix for [GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7). At that release, the JavaScript and license were exact bytes from the SHA-512-verified official npm archive; the asset inventory and HTML SHA-384 integrity were updated together. No minified library code was patched manually.

The separate vendor audit graph pins KaTeX to 0.18.11 with an override to match the actual embedded dependency, not to conceal a different shipped version. The offline guard rejects a mismatch with the inventoried embedded version. The obsolete advisory exception was removed; the exception list is empty. Current registry audits still run at release time and fail on unaccepted findings or service errors. Dated Phase 5A reports describe the earlier bundle and remain historical.

Strict rendering, SVG sanitization and protected configuration remain enabled. Dagre layout and classic appearance are selected explicitly to preserve existing diagrams. Mermaid 12 targets ES2024 browsers (Safari 17.4+); this changes browser compatibility, while the CLI/server retain Node 20+ support because this vendored asset is not imported by the Node runtime.

## Checks and releases

1. Install development tools with `npm ci --ignore-scripts`.
2. Run `npm run check` and `npm run security:audit`. The offline security guard verifies dependency pins/integrity, absence of install hooks, every browser asset, full commit pins for CI actions, and the npm package file boundary.
3. Run `npm pack` and test the resulting archive in a fresh directory with scripts disabled. The explicit `prepack` hook builds source and checks the distribution. `prepublishOnly` runs all checks. Packaging excludes local memory, environment files, credentials, development sources and tests.
4. Review the final archive and diff before an explicitly authorized publish. Use npm trusted publishing or provenance-capable CI where configured; this change does not create a publishing workflow or issue registry credentials.

For the optional real-browser regression, open a local preview with `playwright-cli open http://127.0.0.1:PORT/`, then run `playwright-cli run-code --filename=scripts/verify-mermaid-browser.mjs` from the source checkout. It checks eleven diagram types in both themes, actual node navigation, protected configuration/CSS, and mathematical labels under inherited `trust`, rejecting browser errors and external requests. This uses a separately installed browser tool; it adds no core runtime dependency. Chromium verification does not certify every supported browser.

CI has read-only repository permissions, no persisted checkout credentials, pinned action commits, finite job timeouts, lifecycle-disabled locked installs and a dependency vulnerability audit. Dependabot proposes npm and GitHub Action updates; merge only after reviewing and testing them. Vendor and optional-tool pins need manual upstream review.

When updating download pins, fetch from the official source, review the exact revision/release and its behavior, verify the platform artifacts independently, update URLs/hashes together, and run rejection/success tests. Never add an environment override that skips integrity checks. Keep the version, hashes, manifest and license notices in the same reviewed change.

## Diagram sanitizer rebuild — 2026-10-27

The fresh desktop audit found three newly reported DOMPurify advisories. The
published Mermaid 12.2.0 minified bundle actually embeds DOMPurify 3.4.12; the old
audit graph had resolved 3.4.16. Both are affected. Changing audit metadata alone
would not fix the shipped JavaScript.

The current development bundle is rebuilt from the official Mermaid 12.2.0 ESM
modules with DOMPurify 3.4.17 and KaTeX 0.18.11. `security/vendor-build` contains
exact direct pins, integrity-locked transitive dependencies, the unmodified ESM
entry and deterministic esbuild configuration. Run `npm ci --ignore-scripts` and
`npm run build` there to reproduce the asset, manifest hashes and HTML SRI. No
minified upstream function is edited by hand. Mermaid's original npm archive
integrity in the manifest identifies the source input; it is not a claim that the
rebuilt output matches the upstream minified distribution.

The new asset revision `12.2.0-onboarder.1` prevents cached old bundles from being
reused. The audit metadata pins the actual embedded sanitizer, and offline tests
verify its version export and reject the old embedded version. The exception list
remains empty. The core runtime still has no npm dependencies. The separate
vendor and build graphs are audited alongside the core development tools.

The fixed advisories are [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7),
[GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr), and
[GHSA-c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f).
The existing strict Mermaid policy, protected layout/configuration and hostile
markup regression remain required. These local changes do not alter the already
published npm 1.1.0 archive or its release artifacts.
