```
codebase-onboarder/
├── src/                  # Canonical TypeScript application source
│   ├── cli/              # Wizard, lifecycle commands, terminal explorer, reports
│   ├── server/           # HTTP server, auth, settings, clone sessions, MCP, tools
│   ├── shared/           # Portable contracts and the isomorphic analysis engine
│   │   ├── contracts.ts  # FileSource, scan options/progress, settings, analysis types
│   │   ├── analyzer/     # Language parsers, graph analytics, scan controls, metrics
│   │   ├── diagram/      # Mermaid and AI diagram generation
│   │   └── search/       # Shared query language
│   └── public/           # Browser application, views, components, integration types
├── bin/                  # npm entry-point trampoline and source build helper
├── cli/                  # Generated terminal runtime and declarations
├── server/               # Generated server/MCP runtime and declarations
├── shared/               # Generated shared engine, served at /shared/
├── public/
│   ├── app.js & js/      # Generated browser ES modules
│   ├── vendor/           # Offline Mermaid and Monaco builds
│   ├── index.html        # App shell and scan controls
│   ├── login.html        # Self-hosted access-key sign-in
│   └── styles.css        # Existing paper-and-ink design
├── scripts/              # Development watcher and build consistency verification
├── tsconfig.json         # Whole-application compilation
├── tsconfig.strict.json  # Strict core checks
└── tests/                # Native node:test regression suite
```

---

## 🧪 Testing

Onboarder includes a comprehensive automated test suite built with Node's native test runner:

```bash
# Run all checks (also exercised in CI on Node 20, 22, and 24)
npm run check

# Run the regression suite
npm test
```

Test suites cover:
- Parser edge cases across all supported languages (JavaScript, TypeScript, Python, Go, C/C++, Java, Rust, Ruby, PHP).
- Graph algorithms (Tarjan SCC, PageRank, topological layering, transitive test reach).
- Security rules, health scoring, and sanitization boundaries.
- HTTP security guards, path-traversal prevention, and session lifecycle.
- The settings layer end to end: schema validation, atomic config writes, the
  Bearer auth gate, key rotation, DNS-rebinding protection, and the wizard's
  branching/flag logic.
- Scan cancellation, bounded concurrent reads, UTF-8 limits, and request validation.
- Deep Analysis tooling: engine detection across Windows/macOS/Linux, install-plan
  validation, output parsing, and report shaping.

## Make a focused contribution

Report a reproducible bug, improve a guide, or propose an implementation through [GitHub](https://github.com/Amitpandey88/onboarder). Keep credentials and private repository contents out of issues. Include a relevant test for behavioral changes and run the required checks before a PR.

Edit canonical TypeScript under `src/`, rebuild generated output, and review integrity metadata when changing browser assets or optional-tool download pins. Never skip the hash checks simply to make an installer work.

The static public website lives in `website/`. Its documentation build and validation use Python's standard library, with no extra runtime server or package dependencies. See `website/README.md` in the source tree for the build procedure.
