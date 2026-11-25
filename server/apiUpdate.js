// HTTP handlers for update detection, streaming updates, and managed server restarts.
//
// Protected by the router's same-origin gate, self-hosted access-key gate,
// and excluded from TeamMember allowances so only the local operator or owner
// can inspect installation details or apply an update.
import { sendError, sendJSON } from './http.js';
import { applyUpdate, checkForUpdates, isUpdating } from './update.js';
function serverCapabilities(config) {
    const serverMode = config?.update?.serverMode ?? config?.boot?.mode ?? null;
    const canRestart = Boolean(config?.update?.canRestart ?? (typeof config?.update?.restart === 'function' && serverMode === 'background'));
    return { serverMode, canRestart };
}
export async function handleUpdateStatus(res, url, config, settings) {
    const refreshParam = url.searchParams.get('refresh') || url.searchParams.get('force');
    const force = refreshParam === '1' || refreshParam === 'true';
    const notesParam = url.searchParams.get('notes');
    const includeNotes = notesParam === '1' || notesParam === 'true' || force;
    const { serverMode, canRestart } = serverCapabilities(config);
    const checkFn = config?.update?.check || checkForUpdates;
    const status = await checkFn({
        force,
        includeNotes,
        configFile: config?.configPath ?? null,
        settings,
        serverMode,
        canRestart,
        fetchImpl: config?.update?.fetchImpl,
    });
    sendJSON(res, 200, status, { 'cache-control': 'no-store' });
}
export async function handleUpdateInstall(req, res, body, config, settings) {
    const updatingFn = config?.update?.isUpdating || isUpdating;
    if (updatingFn()) {
        return sendError(res, 409, 'An Onboarder update is already in progress.');
    }
    const { serverMode, canRestart } = serverCapabilities(config);
    const applyFn = config?.update?.apply || applyUpdate;
    const controller = new AbortController();
    const abortOnClose = () => {
        if (!res.writableEnded)
            controller.abort();
    };
    req.on('close', abortOnClose);
    res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
    });
    const send = (event) => {
        if (res.writableEnded || res.destroyed)
            return;
        try {
            res.write('data: ' + JSON.stringify(event) + '\n\n');
        }
        catch {
            /* client disconnected */
        }
    };
    try {
        const targetVersion = typeof body?.version === 'string' && body.version.trim() ? body.version.trim() : undefined;
        const force = body?.force === true;
        await applyFn({
            configFile: config?.configPath ?? null,
            settings,
            serverMode,
            canRestart,
            targetVersion,
            force,
            signal: controller.signal,
            fetchImpl: config?.update?.fetchImpl,
        }, send);
    }
    catch (error) {
        send({
            type: 'done',
            ok: false,
            previousVersion: '0.0.0',
            currentVersion: '0.0.0',
            error: error instanceof Error ? error.message : 'The update failed.',
        });
    }
    finally {
        req.off('close', abortOnClose);
        if (!res.writableEnded)
            res.end();
    }
}
export async function handleUpdateRestart(res, config) {
    const updatingFn = config?.update?.isUpdating || isUpdating;
    if (updatingFn()) {
        return sendError(res, 409, 'Cannot restart while an update is still installing.');
    }
    const { canRestart, serverMode } = serverCapabilities(config);
    const restartFn = config?.update?.restart;
    if (!canRestart || typeof restartFn !== 'function') {
        const hint = serverMode === 'foreground'
            ? 'This server is running in the foreground. Press Ctrl-C and run `onboarder start` (or `onboarder restart`) to load the update.'
            : 'Automatic restart is only available for a background server started with `onboarder start background`. Run `onboarder restart` in your terminal.';
        return sendError(res, 400, hint);
    }
    sendJSON(res, 200, { ok: true, restarting: true, message: 'Restarting Onboarder server…' }, { 'cache-control': 'no-store' });
    setImmediate(() => {
        Promise.resolve(restartFn()).catch(() => { });
    });
}
//# sourceMappingURL=apiUpdate.js.map