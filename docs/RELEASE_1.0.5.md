# Onboarder 1.0.5

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
