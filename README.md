# Onboarder 🧭

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-success.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-369%20passing-brightgreen.svg)](tests/)

> **Drop a path. Get a map.**  
> A lightweight, zero-dependency codebase visualizer and architectural map generator that runs entirely on your local machine.

---

Onboarder reads a software repository the way a senior engineer would: starting at the front door, tracing import graphs, mapping architectural layers, computing risk/health metrics, discovering dead exports and dependency drift, and charting Git hotspots — rendering everything as interactive, zoomable diagrams.

**100% Local & Private**: Your code never leaves your computer. No external services or accounts are required.

---

## ⚡ Quickstart

```bash
# Clone the repository
git clone https://github.com/Amitpandey88/onboarder.git
cd onboarder

# Start the application (Node 20+ required, 0 npm packages to install)
npm start
```

Open **http://localhost:4310** in your browser.

- **Zero build steps**: Native ES modules.
- **Zero runtime dependencies**: Powered by Node.js built-ins (`node:http`, `node:fs`, `node:crypto`).
- **Offline ready**: Vendored Mermaid.js and Monaco Editor builds are included in `public/vendor/`.

---

## 🚀 Ways to Load a Repository

1. **Local Directory** — Enter any absolute path (`/Users/you/projects/repo` or `~/work/repo`). Analyzed in-place without copying files.
2. **Git URL** — Paste any public Git URL (`https://github.com/org/repo`). Cloned shallowly (`--depth 1`) into temp storage and automatically deleted on session close.
3. **In-Browser Folder Picker** — Open any local folder using the File System Access API (Chrome/Edge). The entire analyzer runs directly inside the browser tab.
4. **Self-Scan** — Click *"Scan this app's own source"* on the landing page for an instant interactive demo.

---

## 🔍 Features & Views

### 1. Explorer (One Canvas, 6 Modes)
- **Tree**: Hierarchical expandable cell map of directories, files, hubs, and entry points with ghost connection cells.
- **Files**: Intra-folder dependency graphs with deep-dive call inspections.
- **Layers**: Stratified architecture layout from entry points down to foundation leaf files, highlighting circular dependency loops and unreachable code.
- **Health**: Risk heat-map scoring every file (0–100) using PageRank centrality, blast radius (SCC condensation), cyclomatic complexity, and cycle participation.
- **Security**: Built-in vulnerability scanner detecting hardcoded secrets, injection sinks (SQL, command, eval), XSS, insecure crypto, and quality smells across JS/TS, Python, Go, Java, and C/C++.
- **Services**: Automatic detection for `docker-compose.yml`, `Procfile`, and monorepo workspaces.
- **Tour**: Curated step-by-step walkthrough of key architectural waypoints.
- **Atlas**: Grid gallery of every pre-generated diagram across folders and components.

### 1b. Deep Analysis — plug in the best engines (Optional, self-hosted)

Onboarder is the **frontend**; the sharpest open-source analyzers are the
**backend**. The built-in scanner above is a fast, zero-dependency first pass —
extend it with real engines, and their findings merge straight into the security
grade and finding list.

| Engine | Finds | Install |
|---|---|---|
| [**Semgrep**](https://github.com/semgrep/semgrep) (or [Opengrep](https://github.com/opengrep/opengrep)) | SAST: injection, auth, crypto across 30+ languages | `pip install semgrep` |
| [**Gitleaks**](https://github.com/gitleaks/gitleaks) | Committed secrets, keys, tokens | `brew install gitleaks` |
| [**Knip**](https://github.com/webpro-nl/knip) | Dead JS/TS files, exports, dependencies | `npm i -g knip` |
| [**Vulture**](https://github.com/jendrikseipp/vulture) | Dead Python code | `pip install vulture` |
| [**Depcheck**](https://github.com/depcheck/depcheck) | Unused npm dependencies | `npm i -g depcheck` |

**Nothing is required.** With no engines installed, the panel lists each one,
says it is missing, and offers an **Install** button — the built-in scanner is
the floor that never goes away. If you have `uvx` (from [uv](https://docs.astral.sh/uv/))
or `npx`, Semgrep, Vulture, Knip and Depcheck run without a separate install.
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
  coverage it does not have. Needs an OpenAI-compatible endpoint; without one the
  report is still fully readable and the button offers the API key drawer.

Rules that keep this safe to self-host:

- **Detect by default, install only on click.** Onboarder probes `PATH` and
  never installs anything behind a scan. When you do click **Install**, the
  server runs a validated, per-platform plan from the tool registry — the
  request body picks a plan, it never reaches a command line — and streams the
  output back over SSE. You decide what is on the box, and you watch it happen.
- **Run, never eval.** Every engine is spawned with an argument array, never a
  shell, with a hard timeout and a capped buffer. A crafted filename is an
  argument; a hung analyzer is one failed pass.
- **Nothing leaves the machine.** Engines run locally against the scanned root.
  Gitleaks' report is read for existence only — the credential is never relayed
  to the UI.

### 2. Code Preview with Monaco Editor
- Full read-only VS Code editor experience with native syntax highlighting for 70+ languages.
- Breadcrumbs, line counts, byte sizes, and bidirectional dependency navigation chips ("Pulls in" & "Leaning on").
- Instant jump from code view to graph deep-dives.

### 3. Git History & Hotspots
- Git log analysis cross-referencing commit churn with file complexity ($churn \times complexity$).
- Identifies sole-author bottlenecks, top co-change file pairs, and recent repository activity without external tools.

### 4. Advanced Graph Analysis
- **TypeScript Path Aliases**: Automatically resolves `tsconfig.json` / `jsconfig.json` paths (`@/*` $\rightarrow$ `src/*`).
- **Symbol-Level Dead Exports**: Identifies functions, classes, and variables exported by modules that are never imported anywhere in the codebase.
- **Dependency Drift**: Compares `package.json`, `requirements.txt`, `go.mod`, and `Cargo.toml` against source imports to uncover unused dependencies and undeclared imports.
- **Test-to-Source Mapping**: Traces test reachability and highlights untested load-bearing hubs (`fanIn >= 3`).
- **Weight & Documentation Ratios**: LOC, comment-to-code ratios, blank lines, and folder-level README coverage.

### 5. AI Notes & Explainers (Optional)
- Works 100% offline out-of-the-box.
- Connect any OpenAI-compatible LLM endpoint (OpenAI, Azure OpenAI, Groq, OpenRouter, Ollama, LM Studio) to generate streaming explanations and repository documentation.
- API keys are stored solely in your browser's `localStorage` and never logged or written to disk.

---

## 🛠️ Architecture

```
codebase-onboarder/
├── server/          # Zero-dependency Node.js HTTP server
│   ├── router.js    # Route table & parameter validation
│   ├── httpGuards.js# Host verification & CSRF/rebinding guards
│   ├── apiScan.js   # Local & remote scan coordination
│   ├── apiFile.js   # Path-traversal safe file serving
│   ├── gitHistory.js# Local Git log parser & hotspot metrics
│   └── sessions.js  # Temporary clone lifecycle manager
├── shared/          # Isomorphic analyzer engine (Runs in Node & Browser)
│   ├── analyzer/    # Language parsers, graph analytics, metrics, security
│   └── diagram/     # Mermaid diagram generation
├── public/          # Frontend client application
│   ├── js/          # Vanilla ES modules (State, Inspector, Views, Cache)
│   ├── vendor/      # Vendored Mermaid & Monaco Editor (Offline)
│   └── index.html   # Main application interface
└── tests/           # Comprehensive node:test suite (424 unit tests)
```

---

## 🧪 Testing

Onboarder includes a comprehensive automated test suite built with Node's native test runner:

```bash
# Run all 424 tests
npm test
```

Test suites cover:
- Parser edge cases across all supported languages (JavaScript, TypeScript, Python, Go, C/C++, Java, Rust, Ruby, PHP).
- Graph algorithms (Tarjan SCC, PageRank, topological layering, transitive test reach).
- Security rules, health scoring, and sanitization boundaries.
- HTTP security guards, path-traversal prevention, and session lifecycle.
- Deep Analysis tooling: engine detection across Windows/macOS/Linux, install-plan
  validation, output parsing, and report shaping.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — see the [LICENSE](LICENSE) file for details.
