Onboarder 1.0.5 adds repository intelligence and makes dependency graphs lighter while keeping the core package free of runtime dependencies.

- **Repository intelligence:** source evidence with retained citations, saved conversations/topics, optional TypeScript semantic indexing, live refresh, architecture rules, coverage provenance, revision comparison, impact and suggested tests.
- **Onboarding and exploration:** role journeys, notes, snapshots, maintainer knowledge, package/route/data-model discovery, cross-repository package links and bounded OTLP imports.
- **Lighter Graph:** stable placement replaces continuous physics; canvas memory, visible nodes, connections and labels are bounded. Search covers every scanned file. Batched redraws, readable labels, preserved zoom and safe dragging reduce interaction overhead. Shift-click locks a thread; Escape unlocks it.
- **Exact review and safer fixes:** retained comparison patches, SARIF exports, isolated implementation worktrees, automatic file checkpoints and actual check receipts.
- **MCP and integrations:** 17 standalone tools, resources/prompts, startup checks and protocol validation; 42 scoped agent tools; optional signed GitHub webhook checks, repository-scoped team roles/comments, and a separately packaged VS Code extension.
- **Interface and privacy:** dark diagrams, consistent dropdown arrows, saved views and clearer lock hints. Browser provider keys remain in tab memory rather than persistent storage.

AI, the optional compiler, team access and GitHub publication require explicit configuration. Runtime traces are imported samples; static links are not proof of runtime execution. GitHub publication defaults off. The VS Code extension is provided as a VSIX rather than installed automatically or published to the Marketplace.

Install:

```sh
npm install -g codebase-onboarder@1.0.5
onboarder --version
onboarder intelligence scan . --json
```

Documentation: https://onboarder.intellimatrix.in/docs/
Advanced setup and limits: https://github.com/Amitpandey88/onboarder/blob/main/docs/ADVANCED_FEATURES.md

## Previous release: 1.0.4

- **Find commands quickly.** Ctrl-P opens a searchable command palette. Choose a command, add any arguments, then run it. Your unfinished question and cursor position are kept.
- **Explore files from chat.** Ctrl-O or `/open [query]` finds indexed code files and offers source, inspection, connections, graph, change-impact, and local-explanation actions. Browsing works offline and follows the active workspace.
- **Resume without copying IDs.** Ctrl-R or `/resume` searches conversations saved for the current repository and keeps your current permissions.
- **Clearer terminal conversations.** Separate You, Onboarder, and Result blocks have borders that resize with the terminal. A shaded model/status bar, labeled input, grouped help, and clear completion labels make the chat easier to follow. History stays in place while new output arrives; Ctrl-End returns to the latest output.

### Included from 1.0.3

- **Easier tree navigation.** Click a folder to expand or collapse it. Open all folders or collapse them from the toolbar; expansion keeps your zoom and position so large maps stay readable. **Fit** remains available when you want to see the whole map.
- **Choose where a canvas file opens.** Pick **Deep Dive**, **Code**, or **Docs** after clicking a file on the map. The sidebar file list opens files directly.
- **Trace and lock connections.** Hover or focus a node to highlight its connections and gently fade and blur the surrounding map. Use **Lock thread**, the Tree pin, or Shift-click to keep the highlight while panning and zooming. Escape unlocks it. Connection tracing works across all nine Explore views and the Graph tab.
- **Stronger supply-chain checks.** npm installation runs no install hooks. Optional analyzer packages use exact versions; Hermes bootstrap scripts and Gitleaks downloads are checked against pinned hashes before execution. Browser assets have an integrity inventory, and CI audits both development tools and vendored libraries.

One low-severity upstream KaTeX advisory remains in the official Mermaid bundle. Strict rendering and SVG sanitization mitigate the application path; the [security guide](docs/SUPPLY_CHAIN_SECURITY.md#known-upstream-advisory) records the remaining risk and review deadline.

## Release links

- [npm package 1.0.4](https://www.npmjs.com/package/codebase-onboarder/v/1.0.4)
- [GitHub release v1.0.4](https://github.com/Amitpandey88/onboarder/releases/tag/v1.0.4)
- [Source and previous releases](https://github.com/Amitpandey88/onboarder/releases)

```sh
npm install -g codebase-onboarder@1.0.4 --prefer-online
onboarder --version
```

These previous-release notes describe version 1.0.4. Building and deploying this website does not upgrade an installed local or VPS copy of the CLI.
