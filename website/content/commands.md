## Top-level commands

```text
onboarder [chat|tui] [folder|GitHub URL]
onboarder explore [folder|Git URL]
onboarder report [folder|Git URL] [--json]
onboarder review [folder] [--staged] [--base ref --head ref] [--ai] [--json|--sarif]
onboarder fix <propose|show|apply|verify|status|accept|rollback|reject> [folder]
onboarder triage <list|inspect> [folder|owner/repository]
onboarder intelligence <scan|ask|impact|rules|semantic-setup> [folder]
onboarder mcp [serve|config|check]
onboarder agent <workflow|setup|model|doctor|runs|show|source>
onboarder setup
onboarder start [background|startup install|startup remove|startup status]
onboarder logs [-n count] [-f]
onboarder status
onboarder stop
onboarder restart
onboarder config [show|get key|set key value|path|reset|key rotate|key show|key set]
onboarder tunnel [cloudflare|tailscale]
onboarder https [check|setup|start|stop|status]
onboarder doctor
```

`onboarder web` and bare `onboarder --server` start the web UI. Bare `onboarder` opens terminal chat. Use `onboarder --help` and `onboarder agent --help` for the installed version's complete option descriptions.

## General flags

| Flag | Meaning |
| --- | --- |
| `--config <file>` | Override the settings file |
| `--non-interactive` | Use flags and defaults without prompts |
| `--json` | Machine-readable output for supported commands |
| `--no-color` | Plain terminal output |
| `-v`, `--version` | Print the installed version |
| `-h`, `--help` | Usage reference |
| `--max-files`, `--max-file-size`, `--read-concurrency` | Validated limits for report and explore |
| `--profile`, `--fail-on`, `--staged`, `--base`, `--head` | Review comparison and severity controls |

See [contextual AI review](/docs/ai-review/), [approved fixes](/docs/fixes/) and [PR triage](/docs/triage/) for permissions, exact digest approval and machine-readable examples. `--ai` is explicit; requesting a patch preview never applies it.

## Chat shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl-P | Search commands, insert one, then add arguments and execute |
| Ctrl-O | Find a code file and choose an offline action |
| Ctrl-R | Search saved conversations for this repository |
| PgUp / PgDn | Scroll output without editing the draft |
| Ctrl-End | Return to the latest output |
| Alt-Enter | Add a line to the composer |
| Ctrl-A / Ctrl-E | Start / end of the input |
| Ctrl-U | Clear the draft |
| Ctrl-C | Cancel the active task |
| Ctrl-D | Cancel, save, and exit when the draft is empty |
| Escape | Dismiss menus and restore normal navigation |

## Slash commands

The following list is generated from the **1.2.0 command registry**, grouped by task. Angle brackets indicate a required value; square brackets indicate an optional value. The installed `/help <command>` gives local usage.

{{commands}}

## Offline explorer commands

Explorer commands omit the leading slash. Its navigation, analysis, diagrams, reviews, and optional analyzers are described in [Offline explorer](/docs/explorer/). `pick` and bare `cd` open the source picker; `!<command>` executes a shell command explicitly. Shell commands can execute arbitrary code and are separate from the offline analyzer.
