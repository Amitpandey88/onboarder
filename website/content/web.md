## Open the workspace

```sh
onboarder start
```

Open http://localhost:4310 and load a repository. The workspace combines the file sidebar, a central canvas or report, and an inspector for selected items. **New repo** switches sources. **Dark** changes the appearance; **Server**, **AI connection**, and **MCP** configure their corresponding features.

## Explore without losing your place

In **Tree**, click a folder to expand or collapse it. The toolbar can open all folders or collapse them. Expanding preserves the canvas position and zoom; **Fit** deliberately frames the full map when you want an overview.

Click a file on the canvas to choose **Deep Dive**, **Code**, or **Docs**. Files in the sidebar open directly. Use the file filter or Search when a tree becomes large.

Hover or keyboard-focus a node to highlight its connected thread and gently fade the surrounding map. **Lock thread**, the Tree pin, or Shift-click keeps the highlight while you pan and zoom. Escape unlocks it. Tracing works across all nine Explore views and the Graph tab.

## Explore views

| View | Use it to |
| --- | --- |
| Tree | Expand folders and navigate the repository hierarchy |
| Files | Inspect dependencies within a folder and dive into calls |
| Layers | Read architectural strata, cycles, and unreachable source |
| Health | Compare risk, complexity, centrality, and blast radius |
| Security | Investigate built-in security and quality patterns |
| History | Connect Git churn and recent activity to source |
| Services | Inspect Compose services, Procfiles, and workspace structure |
| Tour | Follow a curated reading path through key modules |
| Atlas | Browse the generated diagram collection |

## The other workspace tabs

| Tab | Purpose |
| --- | --- |
| Deep Analysis | Run optional engines and filter their normalized findings |
| Review | Inspect a Git comparison with findings on added lines |
| Graph | Follow the interactive dependency graph |
| Heatmap | Compare traffic and coupling between folders |
| Insights | Read architectural signals and repository findings |
| Diff | Inspect changed files and estimated dependent-file impact |
| Workflows | Read GitHub Actions jobs and triggers |
| SBOM | Inspect declared dependencies and licenses |
| Code | Read source with Monaco and dependency navigation |
| Docs | Read or generate repository documentation |
| About | Inspect the repository and application details |

## Search, export, and refresh

Cmd/Ctrl-K opens file, symbol, and source search. [Search syntax](/docs/search/) covers filters and keyboard controls. Use **Copy Mermaid** to reuse diagrams and **Save SVG** where available. AI sketches need a configured connection; static maps work offline.

Rescan after structural edits. A cached dependency map and a branch-range comparison may describe different source states, so estimated change impact needs review.

## Product preview

![Onboarder web explorer with a file sidebar, architecture map, and inspector](/assets/web-explore-1.0.5-light.jpg)

This screenshot shows Onboarder inspecting the imports and dependents of its own scan-options module in the Files view. It follows your selected website theme. The dark preview shows the updated interface with improved diagram contrast.

## Repository intelligence

Open **Intelligence** for source evidence, saved answers, semantic references, boundaries, onboarding journeys, measured coverage, revision comparisons and optional team/fix workflows. See [repository intelligence](/docs/intelligence/) for setup and limits.

## Lightweight Graph

The Graph tab uses stable placement and bounded rendering. Search covers every scanned file. Shift-click a node to lock its thread; press Escape to unlock. See [Graph](/docs/graph/) for interaction and display limits.
