## Install

You need **Node.js 20 or newer** and npm. Check your versions first:

```sh
node --version
npm --version
npm install -g codebase-onboarder@1.0.5
onboarder --version
```

The npm package includes compiled JavaScript, runs no installation hooks, and has zero runtime npm dependencies. If a global install is blocked by permissions, use a user-owned Node installation or npm prefix rather than changing system permissions blindly.

## Open a repository

For the simplest offline start:

```sh
onboarder explore ./your-project
```

Press Enter in the source picker to use the current directory. At the explorer prompt, try:

```text
map
tour
tree
find authentication
inspect src/auth.ts
deps src/auth.ts
```

Replace example file paths with files from your repository. `tour` suggests a reading order; `inspect` shows a file's role, exports, and findings.

## Prefer a visual map?

```sh
onboarder start
```

Open **http://localhost:4310**, then enter a local folder path. The server runs in the foreground; Ctrl-C stops it. Start with **Explore → Tree**, click a folder to expand it, and select a file to choose Deep Dive, Code, or Docs. The sidebar opens files directly.

The first workspace after a local-path load is **Review**. Switch to Explore for the map, or choose a comparison and run a local review.

## Try terminal chat

```sh
cd ./your-project
onboarder
```

Choose **Continue offline** if Hermes or a model is not configured. `/map`, `/tour`, and Ctrl-O file browsing work without AI. Ctrl-P searches commands. Configure optional AI later with `/model configure`.

## Export a first report

```sh
onboarder report ./your-project
onboarder report ./your-project --json
```

The JSON report has `schemaVersion: 1` and contains no source text. See [Reports and CI](/docs/reports/) for scripted reviews and exit codes.

## Next steps

- [Learn the web workspace](/docs/web/)
- [Navigate terminal chat](/docs/chat/)
- [Configure optional AI](/docs/ai/)
- [Fix installation or startup issues](/docs/troubleshooting/)
