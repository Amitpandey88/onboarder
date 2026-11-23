# Change Stack — Phase 4B

Change Stack is an ordered review of two exact Git revisions. It reuses the
immutable snapshots and captured comparison from Review; it is not a second diff
implementation and it never silently switches to the working tree.

Open **Change Stack** in the workspace navigation, choose a base and head, and
build the stack. The equivalent terminal command is:

    onboarder intelligence changes . --base HEAD~1 --head HEAD
    onboarder intelligence changes . --base origin/main --head HEAD --semantic --json

The browser calls `POST /api/intelligence` with
`{"action":"change-stack","scanId":"…","base":"…","head":"…","semantic":false}`.
The result includes the same bounded `review` report that **Open Review** uses, so
captured patch dialogs and Review findings describe the same range.

MCP exposes the same action through `onboarder_intelligence` with
`{"action":"change-stack","path":"/absolute/repository","base":"…","head":"…"}`.
Its projection caps files, findings, architecture lists and captured patches and
fails above 512 KB. Captured patches, finding excerpts and related source text are
omitted unless the caller explicitly sets `includeSource: true`; totals and limits
are returned under `mcp`.

## What it presents

1. **Public contracts** — removed and added exports, compiler-linked symbol moves
   and caller reference changes.
2. **Dependencies and boundaries** — import, cycle and configured architecture
   changes around the changed files.
3. **Implementation** — source without a detected contract or boundary change.
4. **Tests** — changed tests are described as intended verification, never as run
   or passed tests.
5. **Documentation**, **configuration and build**, then **other files**.

Every changed file appears once in the ordered groups. Each file card keeps its
captured additions/deletions, export delta, movement evidence and patch status.
The group explanation states what the layer means and where review should start.

## File moves and symbol renames

Git rename records are authoritative for path pairing. When Git reports a delete
and add instead of a rename, Change Stack pairs them only when the captured base
and head content hashes are identical and the match is unique. A paired old path
is aligned before structural comparison, so an unchanged import is not reported
as a removed and added dependency.

Optional semantic analysis asks the pinned TypeScript Compiler API for declarations
and references in both snapshots. It can report:

- **Compiler-supported symbol move:** a unique exported declaration with the same
  name and kind appears in another changed file and caller references retarget.
- **Candidate symbol rename:** one export disappears, another of the same symbol
  kind appears, and callers in the same files change references. This is explicitly
  a candidate, not a declared rename fact.

Semantic analysis is off by default. It sends no source to an AI provider, but it
loads a local compiler module when one is configured. Without an engine or with a
truncated index, Git and exact-content file moves still work; symbol-level changes
are unavailable and the report says so.

## Before/after overlay

The overlay uses canonical file identities so a renamed file is one node with a
base path and a head path. It shows changed nodes, changed dependency edges and
one hop of direct context. Toggle **Changed only** or **With direct context**.
Edges that exist only before are omitted from the after side; edges that exist only
after are omitted from the before side.

The overlay is bounded to 160 nodes and 400 edges. Totals report the untruncated
context size. Callers and related tests are reverse static-import traversal from
the head snapshot, capped at 200 each.

## Evidence and limits

- The range is resolved once by the existing diff service. Its merge base and exact
  head SHA become the base and head of both snapshots.
- Architecture rules come from the exact head `.onboarder.json`, so a rule changed
  in this range evaluates both sides under the head policy.
- Source and tests are not executed. A clean stack or no Review finding does not
  establish correctness or safety.
- Dependency and caller results are static estimates. Dynamic imports, runtime
  registration, unsupported languages and unresolved external packages can make
  coverage partial.
- Review patches can skip binary, oversized or unreadable files. Those files remain
  in the stack with their metadata and the capture limitation.
- Symbol moves and renames are TypeScript/JavaScript only and bounded by the
  optional compiler index. Renames inferred from references are candidates.

## Navigation and workflow

- **Triage → Open Change Stack** loads the inspected PR's exact local base and head
  when architecture evidence is available. Non-local commits fail with the normal
  Git resolution error; no partial range is substituted.
- **Open Review** carries the captured report into the existing Review workspace.
  **Return to Change Stack** restores the stack without rebuilding it.
- Captured patch buttons use the same redacted Review patch dialogs as Triaging and
  Review.

## Verification

Run:

    npm run build
    node --test tests/changeStack.test.js
    npm run security:check

The MCP contract is also covered: source-free calls omit comparison patches and
finding excerpts, while explicit `includeSource` returns bounded captured patches.

The focused tests cover Git rename alignment without false dependency adds, exact
content pairing, semantic moves and candidate renames, overlay bounds, partial
semantic coverage, and a real temporary Git repository whose dirty working tree
must not appear in the exact range. The service test also checks that the Change
Stack and its Review report share the same base, head and captured files.

Remaining Phase 4 milestones after 4B are the editable revision-bound plan,
collaboration and post-merge work. This guide does not claim those capabilities.
See the [Phase 4B verification record](PHASE4B_VERIFICATION.md) for executed checks
and their boundaries.
