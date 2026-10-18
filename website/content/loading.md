1. **Local Directory** — Enter any absolute path (`/Users/you/projects/repo` or `~/work/repo`). Analyzed in-place without copying files.
2. **Git URL** — Paste any public Git URL (`https://github.com/org/repo`). Cloned shallowly (`--depth 1`) into temp storage and automatically deleted on session close.
3. **In-Browser Folder Picker** — Open any local folder using the File System Access API (Chrome/Edge). The entire analyzer runs directly inside the browser tab.
4. **Self-Scan** — Click *"Scan this app's own source"* on the landing page for an instant interactive demo.

## Terminal repository sources

```sh
onboarder explore ~/work/my-app
onboarder explore https://github.com/owner/repo
onboarder chat https://github.com/owner/repo
```

The explorer uses a temporary blobless, single-branch clone with history and removes it when you switch repositories or exit. The web Git-URL loader uses a shallow temporary clone. Local folders are analyzed in place.

Terminal chat saves clones under `~/.config/onboarder/agent/repositories` so conversations can resume. Reopening a URL reuses its checkout. `/pull` uses a fast-forward-only update and refuses local changes. Use `/new` before pulling if an implementation workspace is active.

Private Git repositories use your existing Git credentials. Do not paste tokens into chat or URL strings. The hosted documentation site is separate from the locally installed scanner.

## Folder permissions and browser support

A local-path scan reads files on the machine running Onboarder's server. A browser-folder scan reads files from the browser-selected directory and runs the analyzer in the tab. File System Access folder picking needs a supported browser such as Chrome or Edge; use the server-backed local path when it is unavailable.

Ignored folders, unsupported extensions, oversized files, and scan limits can change which files appear. [Analysis and limits](/docs/analysis/) explains what the graph represents.
