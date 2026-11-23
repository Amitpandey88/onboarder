# Onboarder 1.4.0 — New domains and portfolio

Released 2026-11-23.

## What's new

- The project home is now [amit.codes](https://amit.codes/), with the product at
  [onboarder.amit.codes](https://onboarder.amit.codes/).
- The dependency-free portfolio source lives in `portfolio-site/`. It presents
  Onboarder as the current project; Q3 is not promoted there.
- Canonical links, sitemap entries, install examples, website metadata, the npm
  homepage and the GitHub repository homepage use the new domains.
- One TLS certificate covers `amit.codes`, `www.amit.codes` and
  `onboarder.amit.codes`. Legacy `intellimatrix.in` hostnames redirect permanently.
- The Onboarder site no longer promotes Q3. The existing Q3 service remains
  separate and is not changed by this release.

## Upgrade

This release does not change CLI, server API or MCP behavior. Existing installs
continue to work without action; to track the release explicitly:

    npm install -g codebase-onboarder@1.4.0
    onboarder --version

The package still requires Node 20+ and has zero core runtime dependencies.

## Verification

- 1,055 tests passed, 1 skipped and 0 failed. Build integrity covered 482
  generated files; supply-chain checks covered 858 package files; the architecture
  check returned no high-severity findings.
- Browser smoke covered both sites at 1440px and 390px widths with no horizontal
  overflow, broken images, page errors or console errors.
- Both canonical sites serve over HTTPS with a valid shared certificate.
- Legacy hostnames return permanent redirects to the new domains.
- Real missing paths return 404 on the new sites.
- npm and GitHub metadata point to the canonical new domains.

## Rollback

The previous Onboarder static release remains under `/srv/onboarder-releases/`.
The prior Nginx server blocks are archived before replacement, so DNS and TLS
configuration can be restored without rebuilding the site. Q3 has its own
service and was not modified.
