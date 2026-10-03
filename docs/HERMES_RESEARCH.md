# Hermes integration research

Research date: 2026-10-03. Official source: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), revision [`eb7e8620324b32424c06218f6a28094df2e921f8`](https://github.com/NousResearch/hermes-agent/tree/eb7e8620324b32424c06218f6a28094df2e921f8). Upstream is MIT licensed, copyright Nous Research. The installed runtime used for integration testing reports `0.21.5+2584.g1c535d9`; the harness tests its required CLI interfaces rather than assuming that version string alone proves compatibility.

## Findings and implementation choice

Hermes supplies the model/provider routing, iterative agent loop, sessions, streaming, tool selection, skills, memory and integrations. Its core runtime is Python. Onboarder is a TypeScript/Node application with no npm runtime dependencies. A separate Hermes subprocess plus a scoped MCP server lets both projects retain their existing runtime contracts. No Hermes source files or Python package tree are copied into Onboarder. See the official [architecture guide](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture/) and [MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).

The source was pulled and inspected before implementation. The following upstream files establish the actual contract used by this harness:

| Upstream source | Verified behavior | Harness use |
| --- | --- | --- |
| `hermes_cli/main.py`, `hermes_cli/_parser.py` | One-shot chat, stdin query files, structured format, turn and wall-clock limits, model overrides and session resume | Argument arrays with `--query-file -`; bounded subprocess lifecycle |
| `hermes_cli/stream_json.py` | JSONL `system`, `text`, `tool_use`, `tool_result`, `result` events; terminal text, exit code, session ID, usage | Typed event validation; successful completion requires both terminal result and successful process exit |
| `hermes_cli/mcp_startup.py` | `--toolsets` filters which configured MCP servers start | Only the dedicated `onboarder` server is selected |
| `hermes_cli/_launchers.py`, `model_switch_providers.py`, `model_switch.py` | Installation-bound runtime command, native model catalog, credential resolution, model selection and persistence | Searchable inline provider/model picker; only display fields cross the Python/Node boundary; full `hermes model` setup remains available |
| `tools/mcp_tool_config.py` | Stdio children receive a filtered environment; `${VAR}` values in explicit server config are interpolated | Explicit run-manifest and GitHub token placeholders; no assumption that ambient secrets reach MCP |
| `tools/mcp_tool_registration.py` | Server-name aliases resolve to dynamically registered MCP toolsets | `--toolsets onboarder` selects the scoped tools |
| `tools/mcp_tool_schema.py` | Tool names follow `mcp__<server>__<tool>` with bounded names | Real-runtime fixture verifies discovered tools belong to Onboarder |
| `tools/tool_search.py`, `hermes_cli/config_defaults.py` | MCP tools may be collapsed behind progressive-discovery bridge tools by default | The dedicated profile uses `tools.tool_search.enabled: off` so this small fixed catalog is explicit |
| `hermes_constants.py`, `pm/environments.py` | Named profiles share installation dependency state while having separate config/data | A stable named Onboarder profile supports current source installs without duplicating Python packages |

Changing `HERMES_HOME` to an arbitrary directory initially exposed a current-source-install issue: its Python dependency selection is also rooted there. The integration uses an installation-root named profile instead. A live local fixture also caught progressive tool disclosure: the initial model surface contained three bridge tools. Making the scoped catalog explicit resolved this and allowed verification of all 37 exposed tool names.

## Workflow coverage

The CLI supports repository Q&A, local/PR review, issue triage, isolated implementation, draft PR preparation/publishing, and general GitHub tasks. It reuses Onboarder's scan, architecture, dependencies, health, security, history, tour and search engines. Additional tools cover bounded text reads/edits, working diffs, deterministic local review, npm checks, repository facts, issue/PR lists and details, source at exact commit SHAs, review discussions, labels, exact-head check runs, CI workflows/jobs, issue creation/updates, comments, PR review submission and draft PR creation.

GitHub routes are pinned to the checkout's github.com origin. PR files are capped at 300, ordinary paginated lists at 200, and CI collections at 100; truncation and missing patches are reported. Local source is explicitly distinguished from a remote PR's head. PR review submission includes the expected commit SHA and checks that the head has not changed.

Exact-commit source reads traverse immutable Git trees and check file modes before reading a blob. They reject symlinks/submodules and incomplete trees. This uses the documented [Git tree modes](https://docs.github.com/en/rest/git/trees#get-a-tree) and [Git blob API](https://docs.github.com/en/rest/git/blobs#get-a-blob). Review writes bind their evidence to `commit_id` as documented in [GitHub's review API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).

Implementation starts in a Git worktree at committed HEAD on its own `codex/agent-…` branch. Fresh file hashes prevent stale overwrites. `--allow-checks` and `--allow-github-writes` are separate, enforced capabilities; neither is enabled by default. Fixed check commands use argument arrays. Draft publishing verifies origin and branch, disables Git commit/push hooks for those commands, pushes only the task branch without force, checks for an existing PR and creates a draft. This integration does not include automatic merging, GitHub Enterprise origins, webhook hosting, sandboxed script execution, or a background review bot.

## Lifecycle and data handling

Onboarder stores manifests, final results, event metadata and operation audits with private file permissions. Hermes keeps its own session transcripts inside the dedicated profile. Audit entries omit tool arguments, source and comment bodies; transcripts/final answers can contain source. Known environment credentials are redacted from Onboarder output. A configured model receives selected repository and GitHub content when a task runs.

The Node supervisor imposes output, turn and time limits and cancels its process group on POSIX. The stdio server watches its parent because some Hermes releases start MCP children in separate process groups. Windows uses process-tree termination. Worktrees remain inspectable on failure. Resume pins the original repository/workspace and cannot expand permissions. A recorded completion describes the agent run; a model's claims still need the associated tool evidence, and check results remain visible in its transcript.

## Validation and practical limits

Automated fixtures cover path containment, symlinks, stale edits, subprocess Unicode/framing, cancellation/timeouts/output limits, GitHub identity/authentication/pagination/errors, capability enforcement, write deduplication, PR coverage/exact-head checks, structured completion, isolated worktrees, saved failures, dry runs and bounded resume permissions. The existing MCP transport and explorer command table continue to be exercised by their regression tests.

`node scripts/hermes-smoke.mjs` runs the actual installed Hermes runtime against a loopback OpenAI-compatible model fixture. It verifies the native model catalog, model selection and profile persistence, tool selection, MCP discovery, a real context-tool invocation, structured streaming and saved audit/result files. It makes no paid model call or GitHub mutation. Live provider authentication and actual GitHub issue/review/PR publishing require the user's model and GitHub credentials and are not claimed as exercised by this fixture.

The chat welcome, composer and inline `/model` menu were compared with the installed interactive Hermes CLI on October 3, 2026. An unconfigured Onboarder profile offers model/provider setup or offline browsing. The full official model wizard owns the terminal exclusively: the parent input stream is paused during the handoff and resumed afterward. Native terminal tests cover keystroke delivery, startup setup, cancellation, model-menu search and keeping the existing conversation when no selection succeeds. The quick picker uses the published launcher command and verifies its bootstrap shape; installations without that boundary fall back to the full wizard.

The full-screen chat uses the terminal's alternate buffer, a bottom-pinned composer, and a bounded, scrollable transcript. Resizing reflows both the welcome and conversation; only changed rows are painted. Model setup temporarily restores the original terminal buffer, and chat restores its viewport and draft afterward. Native terminal tests resize a running chat and verify that exit returns to the shell. Onboarder's original code-compass mark replaces the Hermes-inspired mascot, with full/compact terminal representations and a reusable SVG.

The harness requires a compatible Hermes installation. `agent doctor` checks the CLI flags, compiled MCP entry point and profile presence; it does not verify provider credentials or GitHub token scopes. Upstream interfaces can evolve; update the source revision and rerun both fixtures and the live-runtime smoke before expanding compatibility claims.
