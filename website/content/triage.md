Onboarder 1.1.0 adds a read-only GitHub PR queue in web, CLI, MCP and VS Code. It combines exact-head observations, explainable priority, ownership suggestions and statically discoverable dependencies. It never merges, assigns reviewers or posts comments automatically.

## Open the queue

Scan a repository and choose **Triage**. Leave repository blank for its GitHub origin or enter `owner/repository`. Loading the queue makes no AI request.

```sh
onboarder triage list owner/repository --json
onboarder triage list . --state all --page 2 --limit 10 --json
onboarder triage inspect . --pr PR_NUMBER --json
```

Use the actual PR number. Write `./folder` for a relative path containing a slash: a bare `owner/name` denotes GitHub. Browser folders can inspect a named remote repository but do not supply local Git architecture.

## Inspect observations

Queue priorities are provisional until inspection. Select a PR for changed files, deterministic findings, observed checks/reviews, CODEOWNERS and available architecture candidates. Paths, patches and remote links retain the captured revision.

Named deterministic priority factors include severity, changed trust policy, dependency reach, cycles/boundaries, sensitive-path heuristics, failed CI, size and age. P0–P3 mean investigation urgency, not merge permission. Critical findings retain P0; high findings and changed trust policy retain at least P1.

Readiness is separate. Empty, skipped, stale or inaccessible checks are not passed. Even successful observed checks do not establish all required branch protections or rulesets; merge readiness can remain **unknown**. No PR is called safe or automatically approved.

## Ownership and architecture

CODEOWNERS and optional `.onboarder-triage.json` are read at the exact target base. A PR cannot lower its own scoring policy through head changes. Ownership suggestions do not establish reviewer membership, availability or access.

Architecture needs exact commits already present in a matching local checkout. The existing Git-object scanner and import graph provide dependency changes, potential tests, removed exports, cycles and boundary candidates within a 500-file ceiling. Triage never fetches, checks out or executes source. Unsupported, unresolved and truncated analysis stays partial/unavailable.

## Optional explanation

```sh
onboarder triage inspect . --pr PR_NUMBER --ai --json
```

The model receives bounded redacted observations, explains them without tools and does not change priority. Reasoning is inference. Failures and stale revisions remain visible; no automatic retries or background polling occur.

**Open findings in Review** opens captured evidence and exports; **Return to PR triage** preserves selection. Remote observations do not authorize a fix: [fix proposals](/docs/fixes/) still need matching local source and exact approval.

## Access and integrations

Public reads work without credentials within GitHub rate limits. Supply `GITHUB_TOKEN` or `GH_TOKEN` privately through the CLI/server environment when needed. Existing configured GitHub App authentication reuses repository allowlists and read-only token scopes. Triage does not install an App or enable publishing.

Web triage is owner-only; team viewers/reviewers cannot use the owner's GitHub credentials. Local repository preferences may persist, while credentials, captured patches and reports are not saved in browser localStorage. Cancellation stops the current request; observations retain timestamps/freshness.

The standalone MCP tool is `onboarder_triage`. VS Code 0.2.0 provides **Triage Pull Requests** through the local CLI. See [MCP schemas](/docs/mcp-reference/) and the [editor guide](/docs/editor/). GitHub is the only implemented provider.

This is Phase 4A. Dedicated Change Stack, editable engineering planner, full team collaboration and post-merge drafts are not delivered in 1.1.0. See [release scope](/docs/changelog/).
