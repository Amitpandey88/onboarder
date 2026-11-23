## Build a stack

Open **Changes → Change Stack** in the web workspace, choose a base and head, and build. The comparison uses the merge base and exact head commit from the existing Git range service; it never substitutes a dirty working tree.

```sh
onboarder intelligence changes . --base HEAD~1 --head HEAD
onboarder intelligence changes . --base origin/main --head HEAD --semantic --json
```

The result includes the captured exact-range Review report. **Open Review** carries that report into the existing Review view, and **Return to Change Stack** preserves the built stack.

## Review order

Every changed file appears once in a deterministic review order:

1. **Public contracts:** removed and added exports, compiler-linked symbol moves and caller evidence.
2. **Dependencies and boundaries:** changed imports, cycles and configured architecture violations.
3. **Implementation:** source without a detected contract or boundary change.
4. **Tests:** intended verification, not executed or passed tests.
5. **Documentation, configuration and other files.**

Each file retains its additions/deletions, movement evidence, export delta and captured patch status. Group explanations describe why the layer matters and where to start.

## Before/after overlays

The overlay uses canonical file identities so a renamed file remains one node with a base path and head path. **Changed only** focuses on changed nodes and edges; **With direct context** adds one dependency hop.

Git rename records provide path pairs. A delete/add pair is paired only when base and head content hashes are identical and unique. This prevents an unchanged import from appearing as a removed and added dependency.

The overlay is capped at 160 nodes and 400 edges, with totals disclosed. Caller and related-test lists are static reverse-import estimates from the head snapshot, capped at 200 each.

## Use your workflow

The HTTP API is available on an installed workspace server:

```http
POST /api/intelligence
Content-Type: application/json

{"action":"change-stack","scanId":"SCAN_ID","base":"HEAD~1","head":"HEAD","semantic":false}
```

MCP uses `onboarder_intelligence` with `action: "change-stack"`, an absolute repository `path`, `base` and `head`. Its bounded projection caps files, findings and architecture lists and fails above 512 KB. Captured patches, finding excerpts and related source text require explicit `includeSource: true`; returned and total counts appear under `mcp`.

Triage's **Open Change Stack** is enabled when exact local architecture evidence is available. Non-local commits fail with the normal Git resolution error instead of substituting another range.

## Optional semantic analysis

Enable **Semantic symbol analysis** or pass `--semantic`. The separately installed TypeScript Compiler API reads declarations and references in both immutable snapshots. It does not send source to an AI provider or execute repository source.

- **Compiler-supported moves** follow a unique exported declaration and retargeted caller references.
- **Rename candidates** combine export changes, matching symbol kinds and caller changes. They are not declared rename facts.

Without an engine or with a truncated index, the report marks semantic coverage partial or unavailable. Git and exact-content file moves remain available.

## Evidence boundaries

- Architecture rules come from the exact head `.onboarder.json`; both snapshots use that policy.
- Dependency and caller results are static estimates. Dynamic imports, runtime registration and unsupported languages reduce coverage.
- Binary, oversized and unreadable patches stay visible with their capture limitation.
- No source or tests are executed by Change Stack. A clean result does not prove correctness or safety.
- Phase 4C–4F planning, collaboration and post-merge work are outside this release.

Read the complete [Change Stack guide](https://github.com/Amitpandey88/onboarder/blob/main/docs/CHANGE_STACK.md), [1.3.0 release notes](https://github.com/Amitpandey88/onboarder/releases/tag/v1.3.0) and [verification record](https://github.com/Amitpandey88/onboarder/blob/main/docs/PHASE4B_VERIFICATION.md).
