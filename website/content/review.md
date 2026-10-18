After opening a repository by its local path, the **Review** tab is the first
workspace. Choose working-tree changes (including untracked files), staged
changes, or a branch/commit range, then select **Run review**.

- Security and quality patterns are flagged on **added lines**, with file and
  line references, severity, and suggested next steps. Credential excerpts are
  redacted from reports, including other findings on the same credential line.
- A risk-sorted walkthrough groups source, tests, documentation, dependencies,
  and configuration changes. Dependency impact uses the last repository scan;
  rescan after structural edits and treat branch-range impact as an estimate.
- The checklist reports high-severity patterns, conflict markers, test-file
  changes, change size, and skipped files. Tests are **not executed** and
  test-file changes do not establish coverage.
- Filter findings, acknowledge them locally, and export Markdown or JSON.
  Acknowledgements belong to an exact comparison fingerprint; editing the
  change starts a fresh review. Exports always include all detected findings.
- An optional **reviewer's brief** sends the report to your configured AI
  provider for a summary and testing plan. It does not send the raw diff.
  Core reviews work offline without an API key.

The same review is available to scripts:

```bash
onboarder review .
onboarder review . --staged --json
onboarder review . --base main --head feature/my-change
onboarder review . --profile focused --fail-on high
```

`--fail-on` exits with status 1 for findings at or above the selected severity.
Conflict markers also return 1. Invalid comparisons return a failure instead
of falling back to a different diff. Reviews use the Git repository root;
subfolder scans cannot read changes outside the scanned folder.

Optional `.onboarder-review.json` in the repository root:

```json
{
  "profile": "balanced",
  "exclude": ["dist/**", "**/*.generated.ts"],
  "instructions": [
    { "path": "src/auth/**", "instruction": "Check permission boundaries and failure handling." }
  ]
}
```

Profiles: `focused` includes medium/above, `balanced` low/above, and `thorough`
all patterns. Exclusions use `*`, `**`, and `?` path globs. Guidelines are shown
for human review and included in the optional AI brief; the pattern engine
does not claim to enforce natural-language guidelines. Configuration always
comes from the current working tree, including for staged and branch reviews.
This project's configuration excludes generated JavaScript and vendored files
so changes are reviewed in their canonical TypeScript source.

Git commands have a 15-second timeout and a 5 MB output limit. Working reviews
include at most 200 untracked files, each at most 1 MB; oversized inputs fail
explicitly. Binary content, deleted files, metadata-only changes, exclusions,
and untracked symlinks have visible skip reasons. Reviews can be canceled.

Inspired by CodeRabbit's change summaries, path guidelines, and pre-merge
checks, this is a local pattern review workflow. It does not install a GitHub
App, automatically post PR comments, apply fixes, execute repository scripts,
or replace a human/security review.
