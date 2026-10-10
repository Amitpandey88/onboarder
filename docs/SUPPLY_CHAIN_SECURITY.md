# Supply-chain security

Onboarder has no runtime npm dependencies. Development tools are exact-version pinned in `package.json` and integrity-locked in `package-lock.json`. The published package has no `preinstall`, `install`, `postinstall` or `prepare` hooks. Source users run `npm ci --ignore-scripts` followed by an explicit build.

## Downloaded and installed tools

- Hermes installation remains an explicit terminal choice. The bootstrap comes from immutable upstream commit `dcabf76310ff26e1f264368e9e86277380d98266`; platform-specific SHA-256 pins are checked before execution. The installer receives that same checkout commit. Downloads use HTTPS, bounded streaming, a timeout and restricted redirects. Execution occurs in a private temporary directory, with an allowlisted OS environment and installation paths. Server/model credentials, shell startup hooks, package tokens and repository override variables are excluded.
- Gitleaks 8.24.3 release archives have platform-specific SHA-256 pins taken from the [official release checksums](https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_checksums.txt). Only the named executable is extracted into private staging, validated as a regular file, and atomically moved into the Onboarder bin directory. Unsupported architectures fail closed. Archives and staging are removed after success or failure.
- npm/uvx fallback analyzers use reviewed exact package versions and explicit public registries. npm install scripts are disabled. Package installs run outside the scanned repository; analyzer processes receive an isolated environment. Gitleaks reports live in private per-run directories, with file-type and size checks before parsing.
- Tools already on PATH, Homebrew formulas and winget packages follow the user's installed tool/package-manager trust policy. Homebrew and winget manage their own artifact verification and versions.

These controls verify the bootstrap and release archive, not every operation an external tool can perform. Hermes still provisions its upstream dependencies. Python tools and npm analyzer fallbacks still resolve transitive dependencies; Python packages may run build code. Semgrep registry rules require network access, including `p/default`. Knip may evaluate a repository's configuration/plugins. Run external analysis only on repositories you trust, or inside an isolated machine/container. Configured MCP servers and explicitly authorized AI/check commands are executable extensions and retain their documented credentials/permissions.

## Browser libraries

`public/vendor/manifest.json` records Mermaid 11.17.2 and Monaco 0.52.2, upstream npm archive integrity, licenses and SHA-256 hashes for every shipped asset. The baseline was compared with the integrity-verified official npm archives; the Onboarder worker bootstrap is maintained locally. `security:check` rejects added, removed or changed assets without a reviewed manifest update. HTML uses SHA-384 Subresource Integrity for both initial library scripts. The Monaco worker selector accepts only shipped language workers and rejects arbitrary URLs/modules before loading code.

Mermaid runs in strict mode, with security and CSS configuration keys protected against diagram overrides. Application node navigation uses its own event handlers.

Static responses forbid external script sources, object embeds, base-URL overrides and framing. Monaco's current AMD build requires `unsafe-eval`; it remains a documented compatibility limit. Inline styles and custom AI endpoint connections remain supported. Vendored browser bundles are outside the main npm dependency audit. `security/vendor/package-lock.json` tracks their upstream dependency graph for a separate CI audit; it does not add dependencies to Onboarder or install them. That graph is advisory coverage for the release metadata, not an exact analysis of tree-shaken bundle contents. Review embedded dependencies and upstream advisories when updating assets; integrity alone is not a vulnerability or malware scan. Do not patch or re-hash a minified library simply to silence a scanner.

## Known upstream advisory

The official Mermaid 11.17.2 bundle still embeds KaTeX 0.16.47, affected by [GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7). The advisory requires existing prototype pollution or attacker-controlled renderer options, plus unsanitized output. Patched Mermaid uses strict rendering and sanitizes SVG output; diagram configuration cannot override security/CSS policy. Browser checks cover malicious labels and configuration under a polluted `trust` property. This mitigates the application path; it does not patch KaTeX.

`security/vendor/advisory-exceptions.json` records only this low-severity advisory for this exact dependency version, with a review deadline of 2026-11-09. The audit prints it visibly. New advisories, changed versions/severity and expired exceptions fail CI. Upgrade when an official compatible bundle includes the KaTeX fix. Do not override audit metadata to a version absent from the shipped bundle or blindly apply the suggested Mermaid downgrade.

## Checks and releases

1. Install development tools with `npm ci --ignore-scripts`.
2. Run `npm run check` and `npm run security:audit`. The offline security guard verifies dependency pins/integrity, absence of install hooks, every browser asset, full commit pins for CI actions, and the npm package file boundary.
3. Run `npm pack` and test the resulting archive in a fresh directory with scripts disabled. The explicit `prepack` hook builds source and checks the distribution. `prepublishOnly` runs all checks. Packaging excludes local memory, environment files, credentials, development sources and tests.
4. Review the final archive and diff before an explicitly authorized publish. Use npm trusted publishing or provenance-capable CI where configured; this change does not create a publishing workflow or issue registry credentials.

CI has read-only repository permissions, no persisted checkout credentials, pinned action commits, finite job timeouts, lifecycle-disabled locked installs and a dependency vulnerability audit. Dependabot proposes npm and GitHub Action updates; merge only after reviewing and testing them. Vendor and optional-tool pins need manual upstream review.

When updating download pins, fetch from the official source, review the exact revision/release and its behavior, verify the platform artifacts independently, update URLs/hashes together, and run rejection/success tests. Never add an environment override that skips integrity checks. Keep the version, hashes, manifest and license notices in the same reviewed change.
