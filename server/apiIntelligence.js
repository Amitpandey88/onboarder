import { getSession } from './sessions.js';
import { sendError, sendJSON } from './http.js';
import { workspaceFor, compareRevisions, portfolioFor } from './intelligence/workspace.js';
import { IntelligenceStore } from './intelligence/store.js';
import { compareSnapshots, relativePath, impactReport } from '../shared/intelligence/analysis.js';
export async function handleIntelligence(res, body, store = new IntelligenceStore()) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        return sendError(res, 400, 'Provide an intelligence request.');
    const b = body;
    if (typeof b.scanId !== 'string')
        return sendError(res, 400, 'Open a server-scanned repository first.');
    const session = getSession(b.scanId);
    if (!session)
        return sendError(res, 404, 'Repository session expired. Scan it again.');
    const abort = new AbortController();
    const close = () => { if (!res.writableEnded)
        abort.abort(); };
    res.once('close', close);
    try {
        const workspace = await workspaceFor(session.root);
        const action = b.action || 'refresh';
        let result;
        if (action === 'state')
            result = (await store.read(session.root)).state;
        else if (action === 'save-state')
            result = (await store.saveState(session.root, b.state)).state;
        else if (action === 'history')
            result = (await store.read(session.root)).snapshots;
        else if (action === 'clear-history') {
            await store.clear(session.root);
            result = { ok: true };
        }
        else if (action === 'portfolio') {
            if (!Array.isArray(b.scanIds) || b.scanIds.length < 1 || b.scanIds.length > 4 || b.scanIds.some(id => typeof id !== 'string'))
                throw new Error('Choose one to four repository scans.');
            const roots = b.scanIds.map(id => getSession(id)?.root);
            if (roots.some(root => !root))
                throw new Error('One repository session expired.');
            result = await portfolioFor(roots);
        }
        else if (action === 'compare') {
            if (typeof b.base !== 'string' || typeof b.head !== 'string')
                throw new Error('Choose two Git references.');
            result = await compareRevisions(session.root, b.base, b.head);
        }
        else if (action === 'compare-snapshots') {
            if (typeof b.before !== 'string' || typeof b.after !== 'string')
                throw new Error('Choose two saved snapshots.');
            const snapshots = (await store.read(session.root)).snapshots;
            const before = snapshots.find(s => s.id === b.before);
            const after = snapshots.find(s => s.id === b.after);
            if (!before || !after)
                throw new Error('Snapshot unavailable.');
            result = compareSnapshots(before, after);
        }
        else {
            const report = ['refresh', 'evidence', 'impact', 'flow'].includes(String(action)) || !workspace.report ? await workspace.refresh({ signal: abort.signal, semantic: typeof b.semantic === 'boolean' ? b.semantic : undefined }) : workspace.report;
            if (action === 'refresh')
                result = { ...report, repository: workspace.repository };
            else if (action === 'snapshot') {
                await store.saveSnapshot(session.root, report.snapshot);
                result = report.snapshot;
            }
            else if (action === 'evidence') {
                if (typeof b.question !== 'string')
                    throw new Error('Enter a question.');
                result = workspace.evidence(b.question);
            }
            else if (action === 'flow') {
                const file = relativePath(b.file);
                if (!Number.isInteger(b.line) || Number(b.line) < 1)
                    throw new Error('Choose a detected route line.');
                const route = report.routes.find(r => r.path === file && r.line === b.line);
                if (!route)
                    throw new Error('This route is no longer in the current snapshot.');
                const directReferences = report.semantic.references.filter(r => r.path === file && r.line === route.line);
                const downstream = new Set([file]);
                for (let more = true; more;) {
                    more = false;
                    for (const edge of report.snapshot.edges)
                        if (downstream.has(edge.from) && !downstream.has(edge.to)) {
                            downstream.add(edge.to);
                            more = true;
                        }
                }
                result = { route, fingerprint: report.snapshot.fingerprint, directReferences, potentialModules: [...downstream].filter(p => p !== file),
                    potentialModels: report.dataModels.filter(m => downstream.has(m.path)),
                    limitation: 'Middleware order comes from the declaration; references and imports identify candidate downstream code. This does not prove runtime control or data flow. Imported traces are observed samples.' };
            }
            else if (action === 'impact') {
                result = impactReport(report, relativePath(b.file));
            }
            else
                throw new Error('Unknown intelligence action.');
        }
        if (!abort.signal.aborted)
            sendJSON(res, 200, result);
    }
    catch (error) {
        if (!abort.signal.aborted)
            sendError(res, 400, error instanceof Error ? error.message : 'Intelligence request failed.');
    }
    finally {
        res.off('close', close);
    }
}
//# sourceMappingURL=apiIntelligence.js.map