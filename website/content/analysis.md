## Language coverage

Onboarder uses lightweight language-specific analysis rather than executing your application. Supported source families include JavaScript, TypeScript, Python, Go, Rust, Java, C#, and generic C/C++, Ruby, and PHP parsing.

The generated [language reference](#language-extensions) below lists extensions from the current language registry. Syntax highlighting in Code supports additional languages; editor highlighting does not imply equivalent dependency analysis.

## What the graph can tell you

- Resolved imports connect files and identify central modules.
- Tarjan strongly connected components identify dependency cycles.
- Architecture layers organize entry points through foundation files.
- Health signals combine centrality, complexity, blast radius, and cycle participation.
- Git hotspots combine churn and complexity; authorship and co-change patterns provide context.
- Dependency drift compares supported manifests with source imports.
- Test reachability traces import paths from recognized tests to source.

These are static signals. Dynamic imports, runtime registration, generated modules, reflection, or framework conventions may be missed. Potential dead exports or unconnected files can be legitimate entry points. Test reachability is not measured test coverage.

## Scan limits

| Option | Default | Maximum |
| --- | --- | --- |
| `maxFiles` | 4,000 files | 100,000 files |
| `maxFileSize` | 204,800 UTF-8 bytes (200 KiB) | 10 MiB |
| `readConcurrency` | 8 | 32 |

```sh
onboarder report . --max-files 10000 --max-file-size 524288 --read-concurrency 4
onboarder explore . --max-files 10000 --read-concurrency 4
```

Limits are validated. Explorer choices persist across rescans and repository changes. File-size limits count UTF-8 bytes, including non-ASCII source. The web UI provides Cancel scan; disconnected server requests stop scanning.

## TypeScript resolution

`tsconfig.json` and `jsconfig.json` support comments, trailing commas, slash aliases, and mapping generated JavaScript imports back to TypeScript source. Unresolved imports deserve inspection before relying on a map's reachability claims.

## Manifests and generated outputs

Supported dependency drift sources include `package.json`, `requirements.txt`, `go.mod`, and `Cargo.toml`. Services can be detected from Compose, Procfiles, and monorepo workspaces. A manifest declaration does not guarantee a vulnerable dependency is reachable or that a license inventory is a complete legal assessment.

## Refresh after edits

Use `rescan` in the explorer or `/rescan` in chat after changing files. Scan cache keys include every indexed file's imports, exports, and findings. Review comparisons use their own fingerprint; acknowledging a finding in one comparison does not hide it from another.

## Language extensions

{{languages}}
