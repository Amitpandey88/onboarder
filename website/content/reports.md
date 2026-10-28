## A one-shot repository report

```sh
onboarder report .
onboarder report . --json
onboarder report . --json > onboarder-report.json
```

Reports summarize counts, import resolution, entry points, health, security patterns, and test reachability. JSON uses `schemaVersion: 1` and contains no source text. `report` exits after analysis and does not need a TTY. A Git URL can be analyzed instead of a local folder.

## Review changes in a script

```sh
onboarder review . --staged --json
onboarder review . --base main --head feature/my-change --profile focused --fail-on high
```

Choose working-tree changes by default, staged changes with `--staged`, or a branch comparison with `--base` and `--head`. Invalid comparisons fail rather than falling back to another diff.

`--fail-on` accepts `critical`, `high`, `medium`, `low`, or `info`. Findings at or above the chosen severity return exit 1; conflict markers also return 1. A review flags patterns on added lines and does not execute tests.

## Example CI step

```sh
npm install -g codebase-onboarder@1.2.0 --ignore-scripts
onboarder review . --base main --head HEAD --fail-on high --json > onboarder-review.json
```

Ensure the comparison refs exist in the CI checkout. Fetch the required history through your CI's normal checkout policy. Review artifacts may contain repository paths and redacted finding descriptions; treat them according to your repository's access policy.

## Export in interactive sessions

- Web Review exports Markdown, JSON or SARIF with all detected findings, including locally acknowledged ones.
- `/export` saves a private Markdown conversation under the agent home.
- `/deep export` saves the normalized analyzer report as private JSON.
- Diagram controls export Mermaid or SVG for sharing architecture.

Generated outputs are snapshots. Record the relevant source revision and rerun analysis after edits rather than reusing a stale report as current evidence.
