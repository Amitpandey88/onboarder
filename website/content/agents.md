`onboarder agent` adds multi-step repository work through [Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent). Hermes is an optional, separately installed Python runtime; Onboarder's npm package still has no runtime dependencies. The TypeScript harness supplies **39 scoped MCP tools** built around Onboarder's existing analysis and GitHub's API.

```sh
onboarder agent setup
onboarder agent model                 # choose a provider/model in the dedicated profile
onboarder agent doctor
onboarder agent ask . --task "Explain the authentication flow"
onboarder agent review . --pr 42 --task "Review correctness and security"
onboarder agent triage . --issue 12 --task "Investigate the cause and propose labels"
onboarder agent implement . --issue 12 --task "Fix this issue" --allow-checks
onboarder agent pr . --task "Implement the fix and open a draft PR" --allow-checks --allow-github-writes
onboarder agent github . --task "Explain why the latest CI run failed"
onboarder agent runs
onboarder agent show <run-id>
```

The same commands work inside the explorer: `agent review --pr 42` uses the loaded repository. Implementation and PR work require a persistent local checkout; the explorer's temporary URL clones are removed on exit. `agent help` lists setup and workflow options. Use `--dry-run --json` to inspect a plan without creating a workspace or calling a model. Use `--json` for one machine-readable result; progress stays on stderr.

| Workflow | Result |
| --- | --- |
| `ask` | Repository Q&A grounded in scan, architecture, search and source tools |
| `review` | Local-change or GitHub PR findings, patch coverage, discussion and checks at the PR head SHA |
| `triage` | Issue investigation, duplicate candidates, priority, labels and a proposed implementation plan |
| `implement` | Edits in a separate Git worktree, diff inspection and optional npm checks |
| `pr` | Implementation plus a proposed PR; publishes a **draft** when GitHub writes are enabled |
| `github` | Repository, issues, PR discussions, labels, CI runs/jobs, comments and review tasks |

GitHub access uses the local checkout's **github.com `origin`** and `GITHUB_TOKEN` or `GH_TOKEN`. Public reads can work without a token; private reads and writes need a token with access to the requested resources. Git transport uses your existing Git credentials. Publishing a review requires the freshly read PR head SHA and refuses a changed head.

Source editing is available only in `implement`/`pr` worktrees created at **committed HEAD** on a `codex/agent-…` branch. Uncommitted changes in your source checkout are excluded. File tools refuse symlinks, credential files, traversal and files larger than 128 KiB; edits require the hash of a fresh read. Workspaces remain available after completion or failure for inspection. Publishing commits workspace changes, pushes that task branch and creates a draft PR; it does not merge. The PR target defaults to the cached `origin/HEAD` branch, falling back to the current branch; choose another with `--base`. Repeated identical successful writes are deduplicated within one running tool server.

`--allow-checks` allows lockfile dependency installation with lifecycle scripts disabled, plus `npm test`, `npm run typecheck` and `npm run build`. Test/build scripts can execute repository code and may write files. `--allow-github-writes` enables issue updates, comments, PR reviews and draft PR publishing. Both permissions are enforced by the tools and default to off. Onboarder supplies only its dedicated MCP toolset to Hermes.

Runs have a default 24-turn, 300-second limit; adjust with `--max-turns` and `--timeout`. Ctrl-C cancels an active agent in both the CLI and explorer. `--resume <run-id>` continues a saved Hermes session in its original workspace; repeat any enabled permission flags. Resume cannot expand the original permissions. Timeouts, missing completion frames and nonzero process exits are recorded as failures.

Run metadata, final answers and operation audits live under `~/.config/onboarder/agent` (override with `ONBOARDER_AGENT_HOME`). Hermes configuration and transcripts use a dedicated named profile under the installation's `profiles` folder; `agent setup` prints its path. Audit records contain operation names, outcome and timing; Hermes session transcripts can contain prompts and source. Repository/tool content is sent to the configured model during agent tasks. Known environment credentials are redacted from Onboarder diagnostics and final answers. API keys supplied through the environment are not written by Onboarder.

For an existing compatible endpoint, set `ONBOARDER_AI_BASE_URL`, `ONBOARDER_AI_MODEL` and optionally `ONBOARDER_AI_API_KEY` **before the first `agent setup`**. Standard `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY` aliases also work. Later, `agent model` updates the dedicated profile without changing your normal Hermes profile. Use `ONBOARDER_HERMES_BIN` to select a Hermes executable. For a nonstandard source installation, preserve its `HERMES_HOME`/`HERMES_RUNTIME_DIR` environment so the harness can locate its shared Python packages.

`onboarder agent source` fetches the official MIT-licensed source at the researched revision into the agent source cache. This does not install Python dependencies or vendor Hermes into the npm package. The source review and integration decisions are documented in [Hermes research](docs/HERMES_RESEARCH.md). Developers can run `node scripts/hermes-smoke.mjs` after building to verify a real installed Hermes runtime against a local model fixture, without external inference or GitHub writes.
