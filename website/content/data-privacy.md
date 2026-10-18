## Core repository analysis

Local scans, architecture maps, indexed search, offline explanations, and pattern review run on the machine hosting Onboarder or inside the selected browser folder. They do not require an account or model endpoint.

This public website does not scan your repository. Its example map is illustrative. Documentation search runs in your browser against a static index fetched from this site.

## Explicit network operations

| Action | Data or destination |
| --- | --- |
| Load or update a Git URL | Git host and your configured Git credentials |
| Read GitHub metadata or work on issues/PRs | GitHub API; optional `GITHUB_TOKEN` or `GH_TOKEN` |
| Ask AI, explain findings, sketch diagrams | Supplied task context and requested source/report to your model provider |
| Install optional tooling | Official installer or package registry |
| Run package-based analyzers or registry rules | Package or rules registry; behavior depends on the selected engine |
| Read this documentation | Website server/CDN receives normal web requests |

Provider accounts, costs, retention, and data rules belong to the configured services. Do not include confidential code in AI tasks without authorization.

## Credentials

Hermes owns its provider login and stores it in its dedicated profile. API-mode web keys are saved in browser localStorage, not Onboarder's server disk. Environment-provided endpoint keys are not written to the app's config. Remote self-hosted browsers exchange an access key for a signed HttpOnly session cookie.

Known environment credentials are redacted from Onboarder diagnostics and final answers. Unexpected secrets in source or conversation text may still require manual removal.

## Local records

Conversation summaries, run metadata, operation audits, analyzer snapshots, and exports can remain under the agent home. Persistent clones and implementation workspaces remain so work can resume. Hermes transcripts may contain prompts and source.

Inspect [Configuration](/docs/configuration/) for storage locations before cleanup. An npm uninstall does not imply deletion of these separate records. Keep source changes you need before removing an implementation workspace.

## This website

The website uses a saved theme preference and standard hosting logs. It has no documentation search service receiving your query and no repository upload form. Read the existing [Privacy Policy](/privacy/) and [Cookies & preferences](/cookies/) for website practices and preference reset controls.
