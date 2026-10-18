## Check the version and readiness

```sh
onboarder --version
onboarder doctor
onboarder agent doctor
```

Confirm version 1.0.5 if Ctrl-P, Ctrl-O, or the new conversation layout is missing. `doctor` checks server configuration; `agent doctor` checks the Hermes runtime and profile.

## Command not found or installation denied

Confirm npm's global executable directory is in your PATH. Use the Node installation appropriate for your shell. A user-owned Node version manager or npm prefix avoids needing a system-wide write. Restart the shell after adjusting PATH, then run `onboarder --version`.

## Port 4310 is already in use

```sh
onboarder status
onboarder config set port 4311
onboarder start
```

If status identifies an Onboarder-managed PID, use `onboarder stop` or `onboarder restart`. Inspect an unrelated listener rather than killing it blindly. A background start waits for health and returns failure with logs if startup fails.

## The browser cannot pick a folder

Use a supported File System Access browser such as Chrome or Edge, or enter a local path in the server-backed workspace. A local path refers to the server's disk; a browser folder belongs to your browsing device.

## Files or imports are missing from the map

Check that the language extension is supported, the file is readable, and scan limits are not excluding it. Review ignore folders, file size, and path aliases. Dynamic loading or generated modules may not resolve statically. Increase limits deliberately and rescan. Missing resolution means the graph's reachability is incomplete.

## No Git history or branch comparison

Confirm the loaded folder is a Git checkout and the required refs exist. Shallow clones may have limited history. Invalid refs fail explicitly. Use a persistent local checkout for agent implementation and PR workflows.

## Hermes is missing or no model is configured

Choose Continue offline to browse now, then use `/model configure` or `onboarder agent model`. The installer is explicit and hash verified. Check `ONBOARDER_HERMES_BIN` if the executable is not on PATH. Preserve runtime environment variables for a nonstandard installation.

## A deep analyzer is missing, failed, or timed out

Use `/engines` or the Deep Analysis panel to see detection and installation options. Enable checks permission in chat before requesting an analyzer run. A missing engine is not a clean report. Package runners and rule registries may need network access; Knip also has a newer Node requirement.

## Access denied in a self-hosted workspace

Use the configured hostname or permitted IP and the current access key. Rotating a key invalidates old browser sessions; sign in again. A proxy request with a public Host stays authenticated. Do not disable Host or Origin checks to bypass an error.

## Resume cannot find a conversation

Conversations belong to an exact repository. Reopen the same local path or saved Git URL checkout, then use `/history` or `/resume`. Chat resume takes a conversation ID; agent resume takes a run ID. Permission choices remain constrained when resuming.

## Cancelled output or a map that seems stale

Ctrl-C or `/cancel` cancels active terminal work. The web workspace exposes scan and sketch cancellation controls. A cancelled deep run preserves the previous report; inspect its timestamp. Rescan source after edits and rerun analyzers before treating the report as current.

## Report an issue

Open a [GitHub issue](https://github.com/Amitpandey88/onboarder/issues) with the tool version, OS, Node version, command, and a minimal non-secret reproduction. For a suspected vulnerability, use [private reporting](/docs/security/#report-a-vulnerability).
