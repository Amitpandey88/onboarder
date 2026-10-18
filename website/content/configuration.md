## One settings file

The setup wizard, CLI flags, and web **Server** drawer share validated settings. The default file is `~/.config/onboarder/config.json`, written privately with mode `0600`. `XDG_CONFIG_HOME` changes the base config directory. `--config <file>` or `ONBOARDER_CONFIG` selects a different file.

```sh
onboarder setup
onboarder config show
onboarder config path
onboarder config get port
onboarder config set port 4311
onboarder config key rotate
```

`config show` masks the access key. `--reveal` or `config key show` can display a credential; use them privately and keep their output out of screenshots and logs.

## Defaults

| Setting | Default | Meaning |
| --- | --- | --- |
| `mode` | `local` | Loopback-only service |
| `host` | `127.0.0.1` | Listening address |
| `port` | `4310` | HTTP port |
| `domain` | Empty | Optional public hostname |
| `https` | `false` | Caddy-backed TLS configuration |
| `autoOpen` | `false` in schema | Browser opening; offered during setup |
| `accessKey` | Empty in schema | Generated during self-hosted setup |
| `account` | Empty name, email, URL, model | Optional connection metadata |
| `tunnel` | Both disabled | Cloudflare and Tailscale preferences |

Local mode rejects network binds. HTTPS needs a configured domain. Changing the server's listening address or port requires restarting it.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ONBOARDER_CONFIG` | Override the settings file |
| `XDG_CONFIG_HOME` | Override the config directory base |
| `ONBOARDER_AGENT_HOME` | Override agent records and workspace storage |
| `ONBOARDER_HERMES_BIN` | Select the Hermes executable |
| `HERMES_HOME`, `HERMES_RUNTIME_DIR` | Preserve nonstandard Hermes runtime locations |
| `ONBOARDER_AI_BASE_URL`, `ONBOARDER_AI_MODEL` | Compatible endpoint for optional AI |
| `ONBOARDER_AI_API_KEY` | Optional endpoint credential |
| `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY` | Supported aliases for endpoint settings |
| `GITHUB_TOKEN`, `GH_TOKEN` | GitHub API access for private resources and authorized writes |
| `ONBOARDER_LOG=json` | JSON log records |
| `LOG_LEVEL=debug`, `ONBOARDER_LOG_VERBOSE=1` | Verbose request logging |
| `ONBOARDER_MCP_LOG=1` | MCP diagnostics on stderr |
| `NO_COLOR`, `COLUMNS` | Terminal color and width preferences |

## Stored records

Agent data defaults to `~/.config/onboarder/agent`. It contains chats, runs, analysis reports, exports, persistent cloned repositories, and implementation workspaces. Hermes config and transcripts use a dedicated named profile under its installation's profiles folder.

Conversation summaries and diagnostics redact known environment credentials, but prompts and source can remain in Hermes transcripts. Redaction is not a substitute for keeping secrets out of prompts. Back up useful workspaces before manually removing agent data.

## Scan options

Scan limits are separate from durable server settings. Pass flags to `report` and `explore`, or validated options to the scan endpoint. See [Analysis and limits](/docs/analysis/) for defaults and maximums.
