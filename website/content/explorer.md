for its full browsing, source picker, diagrams, and optional analyzer commands:

```bash
onboarder explore         # choose a source; Enter uses the current directory
onboarder explore ~/work/some-repo
onboarder report .        # one-shot summary, no interactive terminal needed
onboarder report . --json # stable JSON for scripts and CI
onboarder --server        # force the web UI
```

The explorer lands on a `map` of the repo, then waits:

```
  codebase > tour
  codebase > hotspots
  codebase > find resolveImport
  codebase > deps logger.js
  codebase > inspect logger.js      # one file’s links, exports, and findings
  codebase > blast pathUtil.js      # what breaks if this breaks
  codebase > github                # what GitHub says about this repo
  codebase > workflows             # CI triggers, jobs, and steps
  codebase > sbom express           # dependency and license inventory
  codebase > diff HEAD~1 HEAD      # changes and dependent-file impact
  codebase > engines               # optional deep analyzers on this machine
  codebase > deep gitleaks          # run one analyzer when requested
  codebase > ask Where should I start? # optional AI answer with scan context
  codebase > pick                  # choose another local folder or Git URL
  codebase > !git log --oneline -3  # shell, without leaving
  codebase > exit
```

| | |
|---|---|
| **map · tour · explain** | What this is, the reading order for a new teammate, and a file or folder explained in prose |
| **tree · find · show · inspect · deps** | Browse, search, read, inspect, and trace files |
| **graph · blast · symbols** | The dependency tree as arrows, the transitive blast radius, and a file's outline |
| **health · hubs · layers · patterns** | The analysis, in the same words the site uses |
| **coupling · clusters · risks** | Folder traffic as a heat grid, module groups, and everything wrong in one list |
| **log · hotspots · blame** | Git history, the files that are complex *and* often changed, and who wrote a line |
| **diagram · atlas · docs** | Mermaid source, a diagram index, and prose you can print or write to `ONBOARDER.md` |
| **workflows · sbom · diff** | CI pipelines, dependency/license inventory, and changed files with blast radius |
| **engines · deep** | See optional analyzers, then run one (`deep semgrep`) or all (`deep all`) |
| **ask** | Ask an OpenAI-compatible model a question using the current repository scan |
| **pick · cd · rescan · web** | Browse device folders, switch repo, reload from disk, or start the web UI |
| **github** | Stars, forks, watchers, license and topics from GitHub, for the repo you have loaded |
| **Tab · `!cmd`** | Completes commands then file paths; runs a shell command inline |

`report` reads a local folder or Git URL once, prints file counts, import resolution,
entry points, health, security, and test reachability, then exits. Its JSON output
has `schemaVersion: 1` and contains no source text.Point it at one and it clones, scans and opens that repo:

```
  onboarder explore https://github.com/expressjs/express
  codebase > cd https://github.com/sindresorhus/is.git
```

The clone is blobless and single-branch — the full history, none of the file contents — because history is half of what this tool has to say (churn × complexity) and the blobs are not. It lands in the OS temp dir and is removed when you `cd` away or leave, so nothing is left behind and nothing you already had open gets deleted. A folder you `cd` to is never touched, whatever it happens to be called.

`github` asks GitHub about whatever is loaded: the URL if this session cloned it, otherwise `git remote get-url origin`, so it works in a checkout you were already standing in. It sends `GITHUB_TOKEN` or `GH_TOKEN` when you have one, which turns GitHub's 60-requests-an-hour guest allowance into 5,000 — a browser has nowhere to keep a secret, so this is the one thing the terminal does strictly better than the site. It also separates "GitHub said no" into rate-limited, private-or-gone, and throttled, because those need three different responses.

**It is the website's engine, not a reimplementation.** `onboarder explore` runs the same modules in the same order as `POST /api/scan` — `scanRepo` → `detectManifest` → `computeFacts` → `buildSearchIndex` — and the same projections the browser's views are projections of. A second implementation would drift, and a drifted map is worse than no map.

Where the site draws a canvas, the terminal draws its own idiom from the same numbers: the coupling heat grid becomes block characters (which survive being piped to a file or read in black and white), and the force-directed graph becomes an arrow tree (`→` imports, `←` imported by) that shows the part that answers *what breaks if I break this*.

Details worth knowing:

- **Forgiving paths.** `show logger.js` finds `server/logger.js`. A genuinely ambiguous name (`index.js`) lists the candidates instead of guessing — silently picking the wrong file is how a map loses your trust.
- **The site's search language.** `find ext:rs -test`, `find "exact phrase"`, `find /regex/` all work because it is the same query parser the web palette uses.
- **Fits your terminal.** Every line is fitted to the current width and re-fits on resize; prose wraps instead of running off the edge. `NO_COLOR` and `COLUMNS` are honored.
- **It refuses to hang.** Without a TTY, `onboarder explore` explains itself and exits rather than waiting for input that will never come. Scripts and CI keep working.
- **Bridges to the web.** `web` starts the UI in the background and prints the URL, without ending your session.
- **Interactive source picker.** `pick` or a bare `cd` lists device folders, supports parent/home navigation and paging, and accepts pasted paths or Git URLs. A failed load leaves the current repository open.
