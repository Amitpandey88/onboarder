## Requirements

Onboarder's core needs **Node.js ≥20**, npm, and readable repository files. Git is needed for cloning, history, change review, and implementation worktrees. The offline explorer requires an interactive terminal; use `report` or `review --json` in scripts.

Hermes is an optional separately installed Python runtime. External analyzers have their own requirements. Knip 6.41.0 requires Node 20.19+ or 22.12+; use a compatible maintained Node release when enabling it.

## Install from npm

```sh
npm install -g codebase-onboarder@1.0.5
onboarder --version
onboarder --help
```

Both `onboarder` and `codebase-onboarder` invoke the same CLI. The distribution includes compiled modules and offline browser libraries; there is no build step after an npm install.

## Update an existing installation

```sh
npm install -g codebase-onboarder@1.0.5 --prefer-online
onboarder --version
```

Confirm `1.0.5` before troubleshooting a feature introduced in that release. A newly published version can briefly be unavailable while npm processes it; do not replace it with an unrelated package.

## Build from source

```sh
git clone https://github.com/Amitpandey88/onboarder.git
cd onboarder
npm ci --ignore-scripts
npm run build
npm start
```

`npm start` serves the UI at http://localhost:4310. After editing `src/`, rebuild or use `npm run dev`. The checked-in TypeScript under `src/` is canonical; generated JavaScript is the runtime output.

## Verify a source build

```sh
npm run check
npm run security:audit
```

These checks cover typing, native Node tests, generated output, integrity, and advisory reporting. Network access is needed for the advisory audit. The vendored KaTeX exception is documented in [Security](/docs/security/).

## Remove the npm package

```sh
onboarder stop
npm uninstall -g codebase-onboarder
```

Remove any login startup registration with `onboarder start startup remove` before uninstalling. Saved configuration, conversations, reports, and workspaces can remain on disk. Back up useful records and inspect the locations in [Configuration](/docs/configuration/) before deleting them.
