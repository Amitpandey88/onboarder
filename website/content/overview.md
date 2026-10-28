Onboarder turns a repository into a map you can read. It finds entry points, follows imports, surfaces architectural risks, and connects your changes to the modules they affect.

Core analysis runs locally without an account. Choose a web workspace, an offline terminal explorer, or terminal chat with optional AI. All three share the same analysis engine.

## Your first five minutes

1. Install Onboarder with Node.js 20 or newer.
2. Open your repository with `onboarder explore ./your-project` or `onboarder start`.
3. Read the overview and take the **Tour** to find useful starting points.
4. Pick a file and trace its imports and dependents.
5. Review a change or export a diagram before sharing what you learned.

[Follow the quickstart →](/docs/quickstart/)

## Choose your workspace

| Workspace | Start with | Good for |
| --- | --- | --- |
| Web UI | `onboarder start` | Zoomable maps, source browsing, review, and analyzer reports |
| Offline explorer | `onboarder explore .` | Reading structure and source directly in a terminal |
| Terminal chat | `onboarder` | Offline tools, saved conversations, and optional AI workflows |
| One-shot report | `onboarder report . --json` | Scripts and CI without an interactive terminal |
| Agent workflow | `onboarder agent ask . --task "Explain this repo"` | Multi-step work through a configured Hermes runtime |
| MCP | `node /absolute/path/to/server/mcp/standalone.js` | Giving an MCP client access to the analysis engine |

## What stays local

Repository scans, maps, search, pattern review, and offline browsing do not require a model provider. Opening a Git URL contacts its host. Optional AI sends task context and requested source to your configured provider. External analyzers can fetch packages or rules when you request a run.

This public website hosts documentation and an illustrative example map. To analyze your own code, install the tool on your machine or a server you control.

## Read the map with context

Dependency edges describe resolved static imports. Health scores, potential unused code, change impact, and security patterns are signals to investigate. Dynamic loading and framework conventions can fall outside the map. A review does not execute tests. The separate [fix verification workflow](/docs/fixes/) can run reviewed checks only after explicit execution permission.

[Understand analysis limits](/docs/analysis/) · [Read the security guide](/docs/security/)

## Documentation version

These guides describe **Onboarder 1.1.0**, published as `codebase-onboarder` under the MIT license. The full [source repository](https://github.com/Amitpandey88/onboarder) remains the authority for implementation details. The terminal layout preview remains a labeled 1.0.4 controlled sample. Existing web screenshots retain their actual 1.0.5 provenance. Version 1.1.0 adds [contextual AI review](/docs/ai-review/), [approved fixes and verification](/docs/fixes/) and [read-only PR triage](/docs/triage/). The dedicated Change Stack, engineering planner, full team platform and post-merge drafts remain unfinished.
