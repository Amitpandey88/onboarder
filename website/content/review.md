Open a local Git repository and choose **Review**. Select working-tree changes, staged changes, or a base/head comparison, then choose **Static · offline** or explicitly enable **AI-assisted · selected source**.

Static review works without a provider. [Contextual AI review](/docs/ai-review/) adds bounded repository context and validated citations through your selected provider; it never starts automatically.

## Choose an exact comparison

```sh
onboarder review .
onboarder review . --staged --json
onboarder review . --base main --head feature/my-change --sarif
onboarder review . --profile focused --fail-on high
```

Working-tree reviews include bounded untracked files. Staged comparisons read the index. Base/head comparisons retain exact revisions and Git merge-base semantics. Invalid refs, unavailable source and oversized comparisons fail or explicitly report incomplete coverage; they do not silently switch to another comparison. A subfolder scan cannot read changes outside its scope.

Configuration provenance identifies working-tree configuration for working changes, index configuration for staged changes, and reviewed-head configuration for revision comparisons. Inspect policy changes and exclusions before relying on a result.

## Read findings and evidence

- Findings identify severity, category, changed file and line. Static patterns and model inferences have distinct source labels.
- Open the retained patch or supporting evidence to see captured ranges, revision and source fingerprint. Evidence validation checks locations and quotes; it does not reproduce the suspected behavior.
- Filter severity, category and static/AI source. Expand an AI finding for its stored explanation, confidence basis, impact and remediation.
- Read coverage and skip reasons. Deleted, binary, excluded, unsupported or oversized source can leave analysis incomplete.
- Acknowledgements belong to the exact comparison fingerprint. Source changes require a fresh review.

Known credentials are redacted from retained source and reports. Redaction is heuristic: keep secrets out of source and inspect artifacts before sharing them. No detected findings never means a change is safe.

## Export and CI gates

The web exports Markdown, JSON and SARIF. CLI `--json` and `--sarif` support automation. Exports include all detected findings, including acknowledged ones, with source and coverage information.

`--fail-on` accepts `critical`, `high`, `medium`, `low` or `info`; findings at or above the gate return exit 1. Conflict markers also trigger the gate. Requested AI that is unavailable, failed, stale or partial returns exit 2 while retaining static results.

## Repository review policy

Optional `.onboarder-review.json`:

```json
{
  "profile": "balanced",
  "exclude": ["dist/**", "**/*.generated.ts"],
  "instructions": [
    { "path": "src/auth/**", "instruction": "Check permission boundaries and failure handling." }
  ]
}
```

Profiles select minimum severity: focused is medium, balanced is low, thorough includes informational findings. Exclusions accept `*`, `**` and `?` globs. Natural-language policies guide a human or explicitly enabled model; static patterns do not enforce arbitrary prose. Repository content and policies remain untrusted data.

## From a finding to a fix

**Explain** reads the finding. **Propose fix** generates a read-only patch. Inspect it before approving the exact proposal; running tests requires separate execution permission. Follow [Approve and verify a fix](/docs/fixes/).

A normal review does not execute repository scripts, apply changes or write to GitHub. The optional reviewer's brief is a separate report summary, not the contextual finding engine. [PR triage](/docs/triage/) can open captured remote findings in Review, but fixing them still requires matching local source.
