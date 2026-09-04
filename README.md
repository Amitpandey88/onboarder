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
└── tests/           # Comprehensive node:test suite (369 unit tests)
```

---

## 🧪 Testing

Onboarder includes a comprehensive automated test suite built with Node's native test runner:

```bash
# Run all 369 tests
npm test
```

Test suites cover:
- Parser edge cases across all supported languages (JavaScript, TypeScript, Python, Go, C/C++, Java, Rust, Ruby, PHP).
- Graph algorithms (Tarjan SCC, PageRank, topological layering, transitive test reach).
- Security rules, health scoring, and sanitization boundaries.
- HTTP security guards, path-traversal prevention, and session lifecycle.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — see the [LICENSE](LICENSE) file for details.
