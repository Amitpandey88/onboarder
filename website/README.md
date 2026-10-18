# Onboarder public website and documentation

Static source for https://onboarder.intellimatrix.in/ and `/docs/`, describing
Onboarder **1.0.5**. The website is separate from the repository-scanning web app.
It has no runtime package dependencies or application server.

- `site/`: homepage, support/legal pages, shared theme, scripts, and local assets.
- `content/*.md`: 26 documentation guides.
- `content/pages.json`: titles, descriptions, groups, and reading order.
- `content/reference.json`: versioned commands, standalone MCP schemas, languages,
  and HTTP routes extracted from the tool. No credentials or private state.
- `build.py`: Python-standard-library builder; output is ignored `dist/`.
- `validate.py`: checks local links/anchors/assets, IDs, strict-CSP compatibility,
  search targets, and complete command/tool coverage.
- `extract-reference.mjs`: updates reference metadata from a compiled checkout.

## Build and preview

```sh
python3 website/build.py
python3 website/validate.py
python3 -m http.server 4325 --bind 127.0.0.1 --directory website/dist
```

Open http://127.0.0.1:4325/. Publish **only `dist/`** to the static document root.
The authored Markdown, builder, and local verification artifacts are not public
web resources. No client-side router is needed: each page has its own directory
and `index.html`, so direct navigation and reload work with Nginx `try_files`.

## Update guides

Edit the controlled Markdown subset: headings, paragraphs, ordered/unordered
lists, fenced code, tables, links/images, emphasis, and quote callouts. Raw HTML
is escaped. Keep examples free of real credentials. Review claims against the
actual package release, especially permissions, storage, and security exceptions.

After changing TypeScript commands/tools, build the application first, then run:

```sh
node website/extract-reference.mjs
```

The content, visible version labels, builder version assertion, changelog, and
release descriptions must be reviewed together when changing the documented
release. The metadata extraction does not call tools or read user configuration.

## Browser behavior

- Cmd/Ctrl-K or `/` opens local documentation search. Queries stay in the browser.
- Search uses a static, same-origin JSON index, text-only result rendering,
  native-dialog focus, arrow-key navigation, and Escape.
- Mobile guide navigation and page TOCs remain separate from main site navigation.
- Code blocks copy their exact text, with selection fallback when clipboard
  permission is unavailable.
- The existing `im-theme` preference is preserved across the product and
  Intellimatrix domains. `/cookies/` resets it.
- Fonts, screenshots, the brand mark, and showcase film are hosted locally.
- Light web screenshots show the published 1.0.4 UI. Dark screenshots preview
  the current source build with fixed diagram surfaces and contrast; those
  application changes are not yet published to npm/GitHub. The gallery,
  full-image viewer, and docs follow the saved theme without filters.
  Terminal screenshot is a 1.0.4 layout
  preview with a controlled sample response, not a claim about a live AI run.

## Deployment

The VPS serves this site through `/srv/onboarder-site`. Website builds are kept
under `/srv/onboarder-releases/`; the public root becomes a symlink to a verified
release. Nginx routes, TLS certificates, the studio site, and Q3 stay separate.
Prepare a complete release, preserve the existing root as a dated backup, then
switch the symlink. Future switches can use `ln -s` plus `mv -Tf` for atomicity.
Run `sudo nginx -t` and verify HTTPS pages, HTTP redirects, actual 404 status,
video byte ranges, CSP, and neighboring applications after deployment.

Keep rollback releases and the backup outside the served directory. Record actual
release paths and verification in the VPS workspace deployment notes. Never put
SSH keys, tokens, or application credentials in this directory.

## Verification completed 11 October 2026

34 HTML documents (33 normal routes and the 404 document), 2,529 links/assets,
232 search targets, 70 slash commands, and 16 standalone MCP tools validated.
Local browser checks covered every normal route at 320, 768, and 1440 pixels;
there were no page errors, missing local assets, or horizontal overflow. Tested
search keyboard navigation, direct anchors, guide/header menus, theme persistence
and reset, exact code copying, gallery tabs/modal, installation tabs, and example
map selection/focus/reset. Light/dark mobile and desktop layouts were inspected.

## Theme image update — 11 October 2026

Added matched 1440×900 light/dark captures of the real 1.0.4 workspace and
file dependency view. Captures use tracked release source in a temporary
checkout, without AI or private credentials. The terminal and cinematic video
poster retain their native dark appearance. The shared theme controller selects
image sources on startup, theme toggles, stored preference changes, and reset.
Gallery tab selection keeps the image modal synchronized. Docs image variants
are generated by the builder and checked by the validator.

Verified both themes, all three gallery tabs, full-image view, theme persistence
after reload, docs images, mobile layout, and preference reset. Original release
root: `/srv/onboarder-releases/20261011-images2`; the prior docs1 build remains
available for rollback.

## Fixed dark UI screenshots — 11 October 2026

Refreshed the dark Explorer and Workspace JPEGs from the current application
source, including the corrected dark diagram panels, connection contrast, and
readable zoom controls. The app scans a temporary copy of its source, keeping
private machine paths and configuration out of the screenshots. These dark
images preview local UI improvements; npm/GitHub still publish version 1.0.4.
Light captures and the terminal layout preview retain their published provenance.

New image filenames avoid reusing cached pale-panel screenshots. Gallery tabs,
the full-image viewer, and documentation theme mappings use the refreshed
assets. Script/style revision is `20261011-images3`. The complete 66-file build
was verified by SHA-256 before atomically activating
`/srv/onboarder-releases/20261011-images3`; images2 remains available for rollback.
Static validation and local/public theme, modal, reload, docs, mobile, and
preference reset checks passed with no first-party page errors or missing assets.
# Live documentation enhancement — 17 October 2026

Current product release: `20261017-docs2`. The docs shell now includes
`site/docs-motion.css` and `site/docs-motion.js`, progressive reading feedback,
motion preferences and an animated overview schematic. Markdown and runtime
reference metadata remain unchanged. Build with `python3 build.py`, validate
with `python3 validate.py`, and stage a new immutable release before publishing.
Evidence and deployment/rollback details: `../docs-redesign/README.md`.


## 1.0.5 release — 18 October 2026

Preserves the live 17 October homepage and documentation-reader improvements.
Adds repository-intelligence, lightweight-graph and VS Code guides, refreshes
commands/MCP schemas from 1.0.5, updates installation/release links and documents
tab-memory provider keys. Historical terminal captures keep their real 1.0.4
provenance. Build revision: `20261018-v105`.
