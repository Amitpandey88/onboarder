import { compareSnapshots } from '../intelligence/analysis.js';
const GROUP_ORDER = ['contracts', 'architecture', 'implementation', 'tests', 'documentation', 'configuration', 'other'];
const GROUP_COPY = {
    contracts: {
        title: 'Public contracts',
        explanation: 'Exports or compiler-linked symbols changed. Callers may need to change with this file.',
        reviewFocus: 'Read the removed and added exports first, then follow affected callers before judging the implementation.',
    },
    architecture: {
        title: 'Dependencies and boundaries',
        explanation: 'Import relationships, cycles or configured architecture boundaries changed around these files.',
        reviewFocus: 'Check the before/after overlay for added or removed edges, then verify the changed import against the intended layer.',
    },
    implementation: {
        title: 'Implementation',
        explanation: 'Source changed without a detected exported-contract or dependency-boundary change.',
        reviewFocus: 'Read the captured patch with the surrounding callers. Findings are static patterns, not proof of a behavior change.',
    },
    tests: {
        title: 'Tests',
        explanation: 'Test source changed. Tests describe intended verification; this report did not execute them.',
        reviewFocus: 'Check that assertions cover the changed behavior and run the relevant test command separately.',
    },
    documentation: {
        title: 'Documentation',
        explanation: 'Documentation or authored notes changed alongside the code.',
        reviewFocus: 'Check that the documented behavior, commands and limitations still match the implementation.',
    },
    configuration: {
        title: 'Configuration and build',
        explanation: 'Manifests, build settings, CI or repository configuration changed.',
        reviewFocus: 'Check dependency ranges, scripts and CI effects separately from source behavior.',
    },
    other: {
        title: 'Other files',
        explanation: 'Changed files that are not classified as source, tests, documentation or configuration.',
        reviewFocus: 'Check whether this asset or generated file belongs in the change and whether its producer needs an update.',
    },
};
const edgeKey = (from, to, kind) => from + '\0' + to + '\0' + kind;
const pathBase = (file) => file.slice(file.lastIndexOf('/') + 1);
const pathDir = (file) => file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
const isTest = (file) => /(?:^|\/)(?:__tests__|tests?|specs?|fixtures)\/|[.-](?:spec|test)\.[^/]+$/i.test(file);
const isDocumentation = (file) => /(?:^|\/)docs?\/|\.(?:md|mdx|rst|adoc)$/i.test(file);
const isConfiguration = (file) => /(?:^|\/)(?:\.github|ci|config|scripts?)\//i.test(file) || /(?:^|\/)(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|[jt]sconfig[^/]*\.json|vite\.config\.[^/]+|Dockerfile|Makefile|Procfile|docker-compose[^/]*\.ya?ml|\.onboarder[^/]*\.json|[^/]+\.(?:json|ya?ml|toml|ini|lock)|[^/]+\.config\.[^/]+)$/i.test(file);
const isCode = (file) => /\.[cm]?[jt]sx?$|\.(?:py|go|rs|java|kt|kts|cs|rb|php|swift|scala|cc|cpp|c|h|hpp)$/i.test(file);
function unique(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
function movementOf(oldPath, newPath) {
    if (oldPath === newPath)
        return 'none';
    if (oldPath ? pathBase(oldPath) === pathBase(newPath) : false)
        return 'moved';
    if (oldPath ? pathDir(oldPath) === pathDir(newPath) : false)
        return 'renamed';
    return 'renamed-moved';
}
function symbolMovement(oldPath, newPath) {
    const movement = movementOf(oldPath, newPath);
    return movement === 'none' ? 'renamed' : movement;
}
/** Reconcile files Git already paired with deleted/added pairs that have identical captured content. */
function pairFiles(before, after, patches) {
    const pairs = [];
    const used = new Set();
    for (const patch of patches) {
        if (patch.status !== 'renamed' || !patch.oldPath || !patch.newPath)
            continue;
        pairs.push({ oldPath: patch.oldPath, newPath: patch.newPath, evidence: ['Git rename detection'], patches: [patch] });
        used.add(patch);
    }
    const beforeFiles = new Map(before.files.map(file => [file.path, file]));
    const afterFiles = new Map(after.files.map(file => [file.path, file]));
    const deleted = patches.filter(patch => patch.status === 'deleted' && !used.has(patch) && beforeFiles.has(patch.oldPath));
    const added = patches.filter(patch => patch.status === 'added' && !used.has(patch) && afterFiles.has(patch.newPath));
    const deletedByHash = new Map();
    const addedByHash = new Map();
    for (const patch of deleted) {
        const hash = beforeFiles.get(patch.oldPath)?.hash;
        if (hash)
            deletedByHash.set(hash, [...(deletedByHash.get(hash) || []), patch]);
    }
    for (const patch of added) {
        const hash = afterFiles.get(patch.newPath)?.hash;
        if (hash)
            addedByHash.set(hash, [...(addedByHash.get(hash) || []), patch]);
    }
    for (const oldPatch of deleted) {
        const hash = beforeFiles.get(oldPatch.oldPath)?.hash;
        const newPatches = hash ? addedByHash.get(hash) : undefined;
        if (!newPatches || newPatches.length !== 1 || (hash ? deletedByHash.get(hash)?.length : 0) !== 1)
            continue;
        const newPatch = newPatches[0];
        if (!newPatch || used.has(newPatch))
            continue;
        pairs.push({ oldPath: oldPatch.oldPath, newPath: newPatch.newPath, evidence: ['Identical content hash in base and head'], patches: [oldPatch, newPatch] });
        used.add(oldPatch);
        used.add(newPatch);
    }
    return pairs.sort((a, b) => a.oldPath.localeCompare(b.oldPath) || a.newPath.localeCompare(b.newPath));
}
function alignedBefore(before, pairByOld) {
    const align = (file) => pairByOld.get(file)?.newPath || file;
    return {
        ...before,
        files: before.files.map(file => ({ ...file, path: align(file.path) })),
        edges: before.edges.map(edge => ({ ...edge, from: align(edge.from), to: align(edge.to) })),
        cycles: before.cycles.map(cycle => cycle.map(align)),
        violations: before.violations.map(violation => {
            const from = align(violation.from), to = align(violation.to);
            return { ...violation, from, to, id: violation.rule + ':' + from + '->' + to };
        }),
    };
}
function referencesBetween(before, after, beforeName, beforePath, afterName, afterPath) {
    const callers = new Map();
    const oldRefs = before.references.filter(ref => ref.name === beforeName && ref.targetPath === beforePath);
    const newRefs = after.references.filter(ref => ref.name === afterName && ref.targetPath === afterPath);
    for (const ref of oldRefs)
        callers.set(ref.path, { path: ref.path, beforeLine: ref.line });
    for (const ref of newRefs) {
        const existing = callers.get(ref.path);
        callers.set(ref.path, existing ? { ...existing, afterLine: ref.line } : { path: ref.path, afterLine: ref.line });
    }
    return [...callers.values()].sort((a, b) => a.path.localeCompare(b.path));
}
function symbolChanges(before, after, drafts, semantic) {
    if (!semantic?.before.available || !semantic.after.available)
        return [];
    const beforeFiles = new Map(before.files.map(file => [file.path, file]));
    const afterFiles = new Map(after.files.map(file => [file.path, file]));
    const exported = (files, path, name) => files.get(path)?.exports.includes(name) === true;
    const count = (definitions) => {
        const values = new Map();
        for (const definition of definitions)
            values.set(definition.name + '\0' + definition.kind, (values.get(definition.name + '\0' + definition.kind) || 0) + 1);
        return values;
    };
    const beforeCount = count(semantic.before.definitions), afterCount = count(semantic.after.definitions);
    const afterByKey = new Map();
    for (const definition of semantic.after.definitions)
        afterByKey.set(definition.name + '\0' + definition.kind, definition);
    const beforeReferences = new Map();
    for (const reference of semantic.before.references) {
        const key = reference.name + '\0' + reference.targetPath;
        beforeReferences.set(key, [...(beforeReferences.get(key) || []), reference]);
    }
    const changedPaths = new Set(drafts.flatMap(draft => [draft.oldPath, draft.newPath]));
    const changes = [];
    const seen = new Set();
    const add = (change) => {
        const identity = [change.before.path, change.before.line, change.after.path, change.after.line, change.symbolKind, change.name].join('\0');
        if (!seen.has(identity)) {
            seen.add(identity);
            changes.push({ id: '', ...change });
        }
    };
    // A unique exported declaration with the same name and kind in a new file is a symbol move.
    for (const definition of semantic.before.definitions) {
        if (!exported(beforeFiles, definition.path, definition.name) || beforeCount.get(definition.name + '\0' + definition.kind) !== 1 || afterCount.get(definition.name + '\0' + definition.kind) !== 1)
            continue;
        const next = afterByKey.get(definition.name + '\0' + definition.kind);
        if (!next || next.path === definition.path || !changedPaths.has(definition.path) || !changedPaths.has(next.path))
            continue;
        if (!exported(afterFiles, next.path, next.name))
            continue;
        const references = referencesBetween(semantic.before, semantic.after, definition.name, definition.path, next.name, next.path);
        add({
            name: definition.name, symbolKind: definition.kind, kind: symbolMovement(definition.path, next.path),
            before: { path: definition.path, line: definition.line }, after: { path: next.path, line: next.line },
            confidence: references.length ? 'compiler-supported' : 'candidate', references,
            explanation: references.length
                ? `The optional compiler found ${references.length} caller reference(s) retargeted from ${definition.name} in the base to the same declaration in the head.`
                : `A unique exported ${definition.kind} with this name appears in a new file. No caller reference was observed, so this move is a candidate.`,
        });
    }
    // An export removing one name while adding another of the same kind is only named a rename when references retarget.
    const removed = new Set(), added = new Set();
    for (const draft of drafts) {
        for (const name of draft.exportsRemoved)
            removed.add(draft.oldPath + '\0' + name);
        for (const name of draft.exportsAdded)
            added.add(draft.newPath + '\0' + name);
    }
    const addedDefinitions = new Map();
    for (const definition of semantic.after.definitions) {
        if (added.has(definition.path + '\0' + definition.name) && exported(afterFiles, definition.path, definition.name)) {
            addedDefinitions.set(definition.path + '\0' + definition.name + '\0' + definition.kind, definition);
        }
    }
    const afterReferences = new Map();
    for (const reference of semantic.after.references)
        afterReferences.set(reference.path, [...(afterReferences.get(reference.path) || []), reference]);
    for (const definition of semantic.before.definitions) {
        if (!removed.has(definition.path + '\0' + definition.name) || !exported(beforeFiles, definition.path, definition.name))
            continue;
        const candidates = new Map();
        for (const reference of beforeReferences.get(definition.name + '\0' + definition.path) || []) {
            for (const nextReference of afterReferences.get(reference.path) || []) {
                const candidate = addedDefinitions.get(nextReference.targetPath + '\0' + nextReference.name + '\0' + definition.kind);
                if (!candidate || candidate.name === definition.name)
                    continue;
                const entry = candidates.get(candidate.path + '\0' + candidate.name) || { definition: candidate, callers: new Set() };
                entry.callers.add(reference.path);
                candidates.set(candidate.path + '\0' + candidate.name, entry);
            }
        }
        if (candidates.size !== 1)
            continue;
        const candidate = [...candidates.values()][0];
        if (!candidate || candidate.callers.size === 0)
            continue;
        const references = referencesBetween(semantic.before, semantic.after, definition.name, definition.path, candidate.definition.name, candidate.definition.path);
        add({
            name: candidate.definition.name, previousName: definition.name, symbolKind: definition.kind,
            kind: symbolMovement(definition.path, candidate.definition.path),
            before: { path: definition.path, line: definition.line }, after: { path: candidate.definition.path, line: candidate.definition.line },
            confidence: 'candidate', references,
            explanation: `${definition.name} was removed and ${candidate.definition.name} was added with the same symbol kind, while ${references.length} caller(s) changed references in the same files. This is inferred from compiler references, not a declared rename.`,
        });
    }
    return changes.sort((a, b) => a.before.path.localeCompare(b.before.path) || a.name.localeCompare(b.name)).slice(0, 200).map((change, index) => ({ ...change, id: 'symbol-' + (index + 1) }));
}
function classify(file, draft, architecturePaths) {
    if (isTest(file))
        return 'tests';
    if (isDocumentation(file))
        return 'documentation';
    if (isConfiguration(file))
        return 'configuration';
    if (draft.exportsAdded.length || draft.exportsRemoved.length || draft.semanticChangeIds.length)
        return 'contracts';
    if (architecturePaths.has(draft.oldPath) || architecturePaths.has(draft.newPath))
        return 'architecture';
    if (isCode(file))
        return 'implementation';
    return 'other';
}
function buildOverlay(before, after, drafts, pairByOld, architecture) {
    const canonical = (file) => pairByOld.get(file)?.newPath || file;
    const beforeFiles = new Map();
    const afterFiles = new Map();
    for (const file of before.files)
        beforeFiles.set(canonical(file.path), file);
    for (const file of after.files)
        afterFiles.set(canonical(file.path), file);
    const draftAt = new Map();
    for (const draft of drafts)
        draftAt.set(canonical(draft.newPath), draft);
    const sides = (snapshot) => {
        const values = new Map();
        for (const edge of snapshot.edges) {
            const from = canonical(edge.from), to = canonical(edge.to);
            values.set(edgeKey(from, to, edge.kind), { edge, from, to });
        }
        return values;
    };
    const beforeEdges = sides(before), afterEdges = sides(after);
    const changedEdgeKeys = new Set();
    for (const key of new Set([...beforeEdges.keys(), ...afterEdges.keys()]))
        if (!beforeEdges.has(key) || !afterEdges.has(key))
            changedEdgeKeys.add(key);
    const seeds = new Set();
    for (const draft of drafts)
        seeds.add(canonical(draft.newPath));
    for (const key of changedEdgeKeys) {
        const side = beforeEdges.get(key) || afterEdges.get(key);
        if (side) {
            seeds.add(side.from);
            seeds.add(side.to);
        }
    }
    for (const violation of architecture.newViolations) {
        seeds.add(canonical(violation.from));
        seeds.add(canonical(violation.to));
    }
    for (const cycle of architecture.introducedCycles)
        for (const file of cycle)
            seeds.add(canonical(file));
    const context = new Set(seeds);
    for (const side of [...beforeEdges.values(), ...afterEdges.values()]) {
        if (seeds.has(side.from))
            context.add(side.to);
        if (seeds.has(side.to))
            context.add(side.from);
    }
    const nodeCanonical = [...context].sort((a, b) => {
        const ac = draftAt.has(a) ? 0 : 1, bc = draftAt.has(b) ? 0 : 1;
        return ac - bc || a.localeCompare(b);
    }).slice(0, 160);
    const nodeIds = new Map();
    nodeCanonical.forEach((path, index) => nodeIds.set(path, 'N' + (index + 1)));
    const nodes = nodeCanonical.map((path, index) => {
        const beforeFile = beforeFiles.get(path), afterFile = afterFiles.get(path), draft = draftAt.get(path);
        let beforePath = beforeFile?.path || null;
        let afterPath = afterFile?.path || null;
        if (!beforeFile && !afterFile && draft) {
            beforePath = draft.status === 'added' ? null : draft.oldPath;
            afterPath = draft.status === 'deleted' ? null : draft.newPath;
        }
        let status;
        if (beforePath && afterPath) {
            if (draft && draft.movement !== 'none')
                status = draft.movement;
            else if (draft)
                status = 'modified';
            else if (beforeFile && afterFile && beforeFile.hash === afterFile.hash)
                status = 'unchanged';
            else
                status = 'modified';
        }
        else
            status = afterPath ? 'added' : 'removed';
        return { id: 'N' + (index + 1), ...(draft ? { fileId: draft.id } : {}), beforePath, afterPath, status };
    });
    const edges = [];
    const relevant = [...new Set([...beforeEdges.keys(), ...afterEdges.keys()])];
    for (const key of relevant) {
        const oldSide = beforeEdges.get(key), newSide = afterEdges.get(key), side = oldSide || newSide;
        if (!side)
            continue;
        const from = nodeIds.get(side.from), to = nodeIds.get(side.to);
        if (!from || !to)
            continue;
        edges.push({ id: 'E' + (edges.length + 1), from, to, kind: side.edge.kind, status: !oldSide ? 'added' : !newSide ? 'removed' : 'unchanged' });
    }
    edges.sort((a, b) => Number(a.status === 'unchanged') - Number(b.status === 'unchanged') || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
    const displayed = edges.slice(0, 400);
    return { nodes, edges: displayed, truncated: nodeCanonical.length < context.size || displayed.length < edges.length, totalNodes: context.size, totalEdges: edges.length };
}
function impactFor(after, changed) {
    const reverse = new Map();
    for (const edge of after.edges)
        reverse.set(edge.to, [...(reverse.get(edge.to) || []), edge.from]);
    const known = new Set(after.files.map(file => file.path));
    const queue = changed.filter(file => known.has(file));
    const visited = new Set(queue);
    for (let index = 0; index < queue.length; index++)
        for (const caller of reverse.get(queue[index]) || [])
            if (!visited.has(caller)) {
                visited.add(caller);
                queue.push(caller);
            }
    const affected = [...visited].filter(file => !changed.includes(file)).sort((a, b) => a.localeCompare(b));
    const tests = [...visited].filter(isTest).sort((a, b) => a.localeCompare(b));
    return { affectedCallers: affected.slice(0, 200), relatedTests: tests.slice(0, 200), truncated: affected.length > 200 || tests.length > 200 };
}
/** Build the deterministic Change Stack from two immutable snapshots plus the captured exact diff. */
export function buildChangeStack(input) {
    const { before, after, patches } = input;
    const pairs = pairFiles(before, after, patches);
    const pairByOld = new Map(pairs.map(pair => [pair.oldPath, pair]));
    const used = new Set(pairs.flatMap(pair => pair.patches));
    const beforeFiles = new Map(before.files.map(file => [file.path, file]));
    const afterFiles = new Map(after.files.map(file => [file.path, file]));
    const draft = (oldPath, newPath, status, patchList, movement, evidence) => {
        const oldFile = beforeFiles.get(oldPath), newFile = afterFiles.get(newPath);
        const oldExports = oldFile?.exports || [], newExports = newFile?.exports || [];
        return {
            id: '', oldPath, newPath, status, movement, movementEvidence: evidence, groupId: 'other',
            additions: patchList.reduce((sum, patch) => sum + patch.additions, 0), deletions: patchList.reduce((sum, patch) => sum + patch.deletions, 0),
            exportsAdded: newExports.filter(name => !oldExports.includes(name)).sort(),
            exportsRemoved: oldExports.filter(name => !newExports.includes(name)).sort(),
            semanticChangeIds: [],
            patchAvailable: patchList.some(patch => !patch.binary && !patch.skipReason && patch.hunks.length > 0),
            patchSkipped: unique(patchList.map(patch => patch.binary ? 'Binary patch has no readable hunks' : patch.skipReason || '').filter(Boolean)),
        };
    };
    const drafts = [];
    for (const pair of pairs)
        drafts.push(draft(pair.oldPath, pair.newPath, 'renamed', pair.patches, movementOf(pair.oldPath, pair.newPath), pair.evidence));
    for (const patch of patches) {
        if (used.has(patch))
            continue;
        const oldPath = patch.oldPath || patch.newPath, newPath = patch.newPath || patch.oldPath;
        if (!oldPath || !newPath)
            continue;
        drafts.push(draft(oldPath, newPath, patch.status, [patch], 'none', []));
    }
    const architecture = compareSnapshots(alignedBefore(before, pairByOld), after);
    const changes = symbolChanges(before, after, drafts, input.semantic);
    const architecturePaths = new Set();
    for (const connection of [...architecture.addedConnections, ...architecture.removedConnections]) {
        const separator = connection.indexOf('->');
        if (separator > 0) {
            architecturePaths.add(connection.slice(0, separator));
            architecturePaths.add(connection.slice(separator + 2));
        }
    }
    for (const violation of architecture.newViolations) {
        architecturePaths.add(violation.from);
        architecturePaths.add(violation.to);
    }
    for (const cycle of architecture.introducedCycles)
        for (const file of cycle)
            architecturePaths.add(file);
    for (const change of changes) {
        for (const draft of drafts)
            if (draft.oldPath === change.before.path || draft.newPath === change.before.path || draft.oldPath === change.after.path || draft.newPath === change.after.path)
                draft.semanticChangeIds.push(change.id);
    }
    for (const draft of drafts)
        draft.groupId = classify(draft.newPath || draft.oldPath, draft, architecturePaths);
    drafts.sort((a, b) => GROUP_ORDER.indexOf(a.groupId) - GROUP_ORDER.indexOf(b.groupId) || (a.newPath || a.oldPath).localeCompare(b.newPath || b.oldPath));
    drafts.forEach((draft, index) => { draft.id = 'file-' + (index + 1); draft.semanticChangeIds = unique(draft.semanticChangeIds); });
    const groups = GROUP_ORDER.map(id => ({
        id, ...GROUP_COPY[id], fileIds: drafts.filter(draft => draft.groupId === id).map(draft => draft.id),
    })).filter(group => group.fileIds.length > 0);
    const overlay = buildOverlay(before, after, drafts, pairByOld, architecture);
    const changedAfterPaths = unique(drafts.filter(draft => draft.status !== 'deleted').map(draft => pairByOld.get(draft.oldPath)?.newPath || draft.newPath));
    const impact = impactFor(after, changedAfterPaths);
    const semantic = input.semantic;
    const reasons = semantic ? unique([semantic.before.reason || '', semantic.after.reason || ''].filter(Boolean)) : [];
    const semStatus = !semantic ? 'not-requested'
        : semantic.before.available && semantic.after.available ? (semantic.before.truncated || semantic.after.truncated ? 'partial' : 'available')
            : semantic.before.available || semantic.after.available ? 'partial' : 'unavailable';
    const engine = semantic?.before.engine || semantic?.after.engine;
    const limitations = [
        'Change Stack compares exact Git snapshots using the merge base selected by the range diff. It does not review the working tree.',
        'Architecture rules are read from the exact head .onboarder.json. A rule changed in this range therefore evaluates both snapshots under the head policy.',
        'Dependency edges and affected callers are static estimates. Unresolved imports and unsupported languages reduce coverage.',
        'Symbol moves and symbol renames use the optional compiler result. Renames are candidates inferred from retargeted references, not declared rename facts.',
        'The Change Stack groups files and explains captured evidence. No repository code or tests were executed.',
        ...(input.semantic ? ['Semantic analysis is optional and bounded. A missing or truncated index leaves file moves from Git and content hashes intact, but removes symbol-level rename and move analysis.'] : ['Semantic rename and move analysis was not requested. File renames still come from Git and exact content matches.']),
        ...(overlay.truncated ? ['The before/after dependency overlay is bounded to 160 nodes and 400 edges. Totals report the untruncated context size.'] : []),
        ...(before.scanCoverage?.unavailable || after.scanCoverage?.unavailable ? ['At least one snapshot contains source that could not be read. Those files are absent from its graph.'] : []),
        ...(before.scanCoverage?.truncated || after.scanCoverage?.truncated ? ['At least one snapshot reached the scan file limit; the affected side is partial.'] : []),
        ...(drafts.some(draft => draft.patchSkipped.length) ? ['Some changed files have binary or skipped patches. Their metadata is included, but no source hunks were captured for them.'] : []),
        ...(impact.truncated ? ['Affected callers and related tests are capped at 200 each.'] : []),
    ];
    const coverageLimitations = limitations.filter(value => /snapshot contains source|file limit|patch|Semantic analysis|Symbol moves|No repository/.test(value));
    return {
        schemaVersion: 1, generatedAt: input.generatedAt || new Date().toISOString(), base: before.revision, head: after.revision,
        summary: {
            files: drafts.length, additions: drafts.reduce((sum, draft) => sum + draft.additions, 0), deletions: drafts.reduce((sum, draft) => sum + draft.deletions, 0),
            fileMoves: drafts.filter(draft => draft.movement !== 'none').length, symbolChanges: changes.length,
            affectedCallers: impact.affectedCallers.length, relatedTests: impact.relatedTests.length,
        },
        files: drafts, groups, symbolChanges: changes, architecture, overlay,
        impact: { affectedCallers: impact.affectedCallers, relatedTests: impact.relatedTests },
        semantic: { requested: Boolean(semantic), status: semStatus, ...(engine ? { engine } : {}), reasons },
        coverage: {
            status: semantic && semStatus !== 'available' && semStatus !== 'not-requested' || before.scanCoverage?.truncated || after.scanCoverage?.truncated ? 'partial' : 'complete',
            limitations: coverageLimitations,
        },
        limitations,
    };
}
//# sourceMappingURL=analysis.js.map