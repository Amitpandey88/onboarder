Onboarder is the **frontend**; the sharpest open-source analyzers are the
**backend**. The built-in scanner above is a fast, zero-dependency first pass —
extend it with real engines, and their findings merge straight into the security
grade and finding list.

| Engine | Finds | Install |
|---|---|---|
| [**Semgrep**](https://github.com/semgrep/semgrep) (or [Opengrep](https://github.com/opengrep/opengrep)) | SAST: injection, auth, crypto across 30+ languages | `pip install semgrep==1.180.0` |
| [**Gitleaks**](https://github.com/gitleaks/gitleaks) | Committed secrets, keys, tokens | `brew install gitleaks` |
| [**Knip**](https://github.com/webpro-nl/knip) | Dead JS/TS files, exports, dependencies | `npm i -g knip@6.41.0 --ignore-scripts` |
| [**Vulture**](https://github.com/jendrikseipp/vulture) | Dead Python code | `pip install vulture==2.16` |
| [**Depcheck**](https://github.com/depcheck/depcheck) | Unused npm dependencies | `npm i -g depcheck@1.4.7 --ignore-scripts` |

**Nothing is required.** With no engines installed, the panel lists each one,
says it is missing, and offers an **Install** button — the built-in scanner is
the floor that never goes away. If you have `uvx` (from [uv](https://docs.astral.sh/uv/))
or `npx`, Semgrep, Vulture, Knip and Depcheck run through exact-version fallbacks without a separate global install. These runners may download packages; Semgrep registry rules also require network access. Knip 6.41.0 requires Node 20.19+ or 22.12+.
In the Security view, click **Run deep analysis**.

### 1c. The Deep Analysis tab — the full report, with AI

Next to **Explorer** in the top nav. One page with everything:

- **Engines** — what is installed, how it was found, what each one cost, and a
  **Run** button per engine (plus *Run all* / *Security only* / *Dead code only*).
  Missing engines get a one-click **Install**: a console streams the package
  manager's output live and ends in a plain verdict. Each engine also has a
  **Configure** disclosure — per-engine options (Semgrep config, Gitleaks
  redaction, Knip production mode, Vulture confidence, Depcheck skips) edited
  in a form and sent with the next run. Install plans are per-platform, so the
  same flow works on **Windows, macOS and Linux**.
- **Findings** — every finding from every engine, merged and worst-first, with
  **severity, engine and text filters**. Each row's file is a link: clicking it
  opens the **Code** tab at that exact line.
- **What this means** — the AI reads the report: *"Explain this analysis"* for a
  prioritised read, or ask about a specific finding (*"is the eval finding
  reachable?"*). It is told which engines did **not** run, so it will not claim
  coverage it does not have. Needs a Hermes connection or an AI endpoint; without one the
  report is still fully readable and the button offers the AI connection drawer.

Rules that keep this safe to self-host:

- **Detect by default, install only on click.** Onboarder probes `PATH` and
  never installs anything behind a scan. When you do click **Install**, the
  server runs a validated, per-platform plan from the tool registry — the
  request body picks a plan, it never reaches a command line — and streams the
  output back over SSE. You decide what is on the box, and you watch it happen.
- **Run, never eval.** Every engine is spawned with an argument array, never a
  shell, with a hard timeout and a capped buffer. A crafted filename is an
  argument; a hung analyzer is one failed pass.
- **Local analysis with explicit network boundaries.** Engines run against the scanned root. Package runners and registry rules may use the network; optional AI explanations send the requested report to your configured provider. Gitleaks reports are redacted before findings reach the UI.The terminal uses the web UI's **Semgrep, Gitleaks, Knip, Vulture and Depcheck** engines, settings and finding parsers. `/engines` shows installed binaries, available runners, and installation instructions without scanning the repository. `/deep` opens a searchable engine picker; you can also run an engine, several engines, all engines, or a purpose group directly.

```text
/permissions checks on
/deep
/deep security
/deep semgrep gitleaks
/deep options semgrep
/deep semgrep config=p/security-audit severity=ERROR
/deep gitleaks history=true
/deep knip include=files,exports
/deep vulture minConfidence=90
/deep results high
/deep explain Which findings should I fix first?
/deep export
```

Each engine reports progress and its outcome. Missing or failed tools remain distinct from a successful clean pass. Ctrl-C or `/cancel` stops running analyzers and their process trees; a cancelled run keeps the previous report. Checks permission is required because analyzer runners may fetch packages and repository analyzer configuration can execute code. Engine installation is explicit; `/engines` lists the commands to use. Typed settings are restricted to the same schema as the web forms.

Reports are private snapshots stored under `~/.config/onboarder/agent/analysis`, keyed by the exact workspace. `/deep results` can filter by severity or engine, works without an AI login, and restores the report after reopening chat. `/deep export` saves the full normalized report as private JSON. Reports identify when and where they ran; rerun them after edits. `/deep explain` sends bounded findings and all engine coverage to Hermes, then normal chat follow-ups continue that conversation. Implementation scans use the active isolated worktree. Reports from another workspace are never substituted.

Hermes can also discover and run these engines when you ask in ordinary chat, such as “Run security deep analysis and explain the highest-priority findings.” Its tools expose availability/settings and enforce the current task root and checks permission; they cannot override the repository path or run arbitrary commands. Model tool responses limit the findings and disclose truncation.

## Read results accurately

A missing, failed, or cancelled engine is not a clean pass. Reports identify the exact workspace and run time; rerun after edits. Findings are normalized for navigation and triage, but source configuration and engine coverage still matter.

Analyzer runners may download packages or evaluate repository configuration. Use repositories you trust or a separately isolated environment. The checks permission is an authorization control, not an OS sandbox. [Security boundaries](/docs/security/) explain the verified downloads and remaining limitations.
