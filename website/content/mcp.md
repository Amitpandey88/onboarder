Press **MCP** in the top bar and the whole analysis becomes callable by any agent
or harness that speaks the [Model Context Protocol](https://modelcontextprotocol.io)
— Claude Code, Cursor, Cline, Windsurf, or your own.

The server speaks **stdio** (the transport every major harness supports) and
exposes **17 tools** over the same analyzers the UI uses, so a number an agent
reports is the same number you see on screen.

| | |
|---|---|
| **Find your way in** | `onboarder_scan` · `onboarder_overview` · `onboarder_tour` |
| **Understand the shape** | `onboarder_architecture` · `onboarder_explain_file` · `onboarder_explain_folder` |
| **Get the source** | `onboarder_read_file` · `onboarder_search` · `onboarder_list_files` |
| **Judge the code** | `onboarder_health` · `onboarder_security` · `onboarder_history` · `onboarder_dependencies` |
| **Repository intelligence** | `onboarder_intelligence` |
| **Go deeper** | `onboarder_deep_analysis` · `onboarder_analyzer_status` |

Paste the JSON or TOML config from the panel into your client. Configuration is
available while the local check is stopped, and keeps the exact Node executable
path so desktop clients do not depend on your shell's PATH. **Check server**
verifies startup, initialization and the complete tool catalog. Each AI client
starts its own stdio process; stopping the panel's check does not stop those clients.

Setup and discovery are also available directly in the terminal:

```bash
node bin/onboarder.js mcp config       # ready-to-paste JSON
node bin/onboarder.js mcp config toml  # TOML
node bin/onboarder.js mcp catalog      # tools, resources and prompts
node bin/onboarder.js mcp check        # real startup and discovery check
node bin/onboarder.js mcp              # stdio server; stdout is only JSON-RPC
```

Add `--json` to `catalog` or `check` for scripts. The standalone entry still
works without the web UI or an AI login: `node server/mcp/standalone.js`.


### Configuration for common harnesses

**Claude Code** / **Cursor** / most MCP clients:

```json
{
  "mcpServers": {
    "onboarder": {
      "command": "node",
      "args": ["/absolute/path/to/onboarder/server/mcp/standalone.js"]
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`) uses the same shape under
`mcpServers`. **Cline** uses `"mcpServers"` in its settings file. **Windsurf**
uses `"mcpServers"` in `~/.codeium/windsurf/mcp_config.json`.



**Resources and guided prompts.** After a scan, `resources/list` exposes four
cached JSON views: overview, architecture, health and a reading tour.
`resources/templates/list` provides those views and a bounded text source
template. URIs include the URI-encoded absolute root; for example
`onboarder://repository/%2FUsers%2Fyou%2Fapp/file?path=src%2Fmain.ts`.
`prompts/list` offers `onboard_repository`, `review_change` and
`investigate_security`; use `prompts/get` with `path`, an optional `focus`, and
`file` for change review. These prompts guide analysis and do not run tools or AI
on their own. Resources reflect the cached scan; call `onboarder_rescan` after edits.

**Smaller source reads.** `onboarder_read_file` accepts optional one-based
`startLine`/`endLine`, up to 500 lines per range, and reports `totalLines`, the
returned range and truncation. Whole-file reads retain the 200 KB limit. Binary
files, symlinks (including directory symlinks), and paths outside the repository
are refused. Tool schemas reject wrong types, unknown keys, invalid enums and
out-of-range limits with errors the model can correct.

**Client compatibility and boundaries.** MCP negotiates 2025-11-25, 2025-06-18,
2025-03-26 and 2024-11-05 over stdio and reports the actual package version.
Every stdio connection remembers its own selected repository. The optional
stateless HTTP transport requires an explicit `path` for repository tools and
binds only to 127.0.0.1, with Host/Origin, MIME, version and message-size guards.
It supports a single JSON-RPC message per POST and does not offer SSE streams.
The Hermes harness exposes the same context features, pinned to its task root,
with its existing credential exclusions, redaction and execution permissions.

**Built-in tools read the repository.** The optional `onboarder_deep_analysis`
tool runs external engines, whose repository configuration or plugins may execute
code and write files; authorize that execution only for repositories you trust
or in an isolated environment. Tool annotations distinguish those engines from
read-only analysis. The scoped Hermes harness additionally enforces checks permission.

**Start and stop are real.** Stopping closes the child's stdin and lets it drain
rather than killing it mid-answer, and a Ctrl-C in the terminal takes the child
with it instead of orphaning a process holding the scan cache.

**Dark diagrams and navigation.** The renderer installs a trusted light/dark
palette for panels, node labels, connections and SVG exports. Repository or AI
directives cannot override protected theme/security settings. Large diagrams
open at readable size; **Fit** shows the complete graph and **100%** returns to
the selected node or an entry point. Switching themes keeps canvas zoom, position
and a locked connection thread. Tree root labels retain contrasting colors.


## Intelligence evidence

`onboarder_intelligence` supports repository scans, bounded evidence retrieval and exact-revision comparison. Source excerpts require `includeSource` in the standalone tool. The separately scoped agent integration has 42 tools and uses its own bounded reader.

[All 17 tools and input schemas](/docs/mcp-reference/).
