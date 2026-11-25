// CLI `onboarder update` command and terminal formatting helpers.
//
// Keeps terminal rendering pure where possible so tests can inspect output
// formatting and command behavior without spawning a real npm install.
import { installMethodLabel } from '../shared/update.js';
import { configPath, readSettings } from '../server/config.js';
import { pidIsAlive, readPidFile, readRunInfo } from '../server/pidfile.js';
import { applyUpdate, checkForUpdates, isAutoUpdateCheckDisabled } from '../server/update.js';
import { bad, bold, cyan, dim, hint, ok, panel, row, tick, warn } from './ui.js';
import { wrapText } from './explorer/wrap.js';
export const UPDATE_HELP = `
  Onboarder update — detect and install the latest release

  Usage
    onboarder update                 Check for an update and prompt to install
    onboarder update check           Check the npm registry without installing
    onboarder update install         Install the latest compatible release
    onboarder update --check         Same as \`onboarder update check\`
    onboarder update --yes           Install without prompting (for scripts)
    onboarder update --restart       Restart a running background server after updating
    onboarder update --notes         Include GitHub release notes when available
    onboarder update --json          Machine-readable JSON output

  Aliases
    onboarder upgrade

  Environment
    ONBOARDER_NO_UPDATE_CHECK=1      Disable automatic background update checks
`;
export function formatUpdateHintLine(status) {
    if (!status?.updateAvailable || !status.latestVersion)
        return '';
    return `  ${warn('Update available:')} v${status.currentVersion} → ${bold(cyan('v' + status.latestVersion))}`
        + dim(' · run `onboarder update`');
}
export function formatUpdateStatusText(status, options = {}) {
    const stateText = status.error && !status.latestVersion
        ? bad(status.error)
        : status.updateAvailable && status.latestVersion
            ? warn(`Update available (v${status.currentVersion} → v${status.latestVersion})`)
            : status.checkDisabled
                ? dim('Automatic checks disabled')
                : status.latestVersion
                    ? ok(`Up to date (v${status.currentVersion})`)
                    : dim('Unknown');
    const rows = [
        row('Current', `v${status.currentVersion}`),
        row('Latest', status.latestVersion ? cyan(`v${status.latestVersion}`) : dim('unavailable')),
        row('Status', stateText),
        row('Install', installMethodLabel(status.installMethod)),
        row('Node', status.nodeCompatible
            ? `v${process.versions.node} (compatible)`
            : bad(`v${process.versions.node} (needs ${status.requiredNode || '>=20'})`)),
    ];
    if (status.checkedAt) {
        const label = new Date(status.checkedAt).toLocaleString();
        rows.push(row('Checked', dim(status.fromCache ? `${label} (cached)` : label)));
    }
    if (status.releaseUrl)
        rows.push(row('Release', dim(status.releaseUrl)));
    if (status.updateAvailable && status.canAutoUpdate && !options.verbose) {
        rows.push(hint('Run `onboarder update` to install, or `onboarder update check --notes` for release notes.'));
    }
    const parts = ['', panel('Onboarder update', rows)];
    if (status.reason && !status.canAutoUpdate) {
        parts.push('  ' + warn(status.reason));
    }
    if (status.updateAvailable && (!status.canAutoUpdate || options.verbose)) {
        parts.push('  ' + dim('Command: ') + cyan(status.manualCommand));
    }
    if (options.verbose && status.releaseNotes) {
        parts.push('', bold('  Release notes'), wrapText(status.releaseNotes, '  '));
    }
    if (status.error && status.latestVersion) {
        parts.push('', '  ' + warn(status.error));
    }
    parts.push('');
    return parts.join('\n');
}
export async function readCachedUpdateHint(configFile = configPath(), settings, env = process.env) {
    try {
        if (isAutoUpdateCheckDisabled(env, settings))
            return null;
        const resolvedSettings = settings ?? await readSettings(configFile).catch(() => null);
        if (isAutoUpdateCheckDisabled(env, resolvedSettings))
            return null;
        const status = await checkForUpdates({ cacheOnly: true, configFile, settings: resolvedSettings, env });
        return status.updateAvailable ? status : null;
    }
    catch {
        return null;
    }
}
async function defaultConfirm(question, fallback = true) {
    const { default: readline } = await import('node:readline/promises');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await rl.question(`  ${bold(question)} ${dim(fallback ? '(Y/n)' : '(y/N)')} `);
        const v = answer.trim().toLowerCase();
        return v ? v === 'y' || v === 'yes' : fallback;
    }
    finally {
        rl.close();
    }
}
function defaultRunningPid(configFile) {
    const pid = readPidFile(configFile);
    return pid && pidIsAlive(pid) ? pid : null;
}
async function defaultRestartBackground({ flags, out, err }) {
    const { runStop, runStartBackground } = await import('./commands.js');
    const stopCode = await runStop({ flags, out, err });
    if (stopCode !== 0)
        return stopCode;
    return runStartBackground({ flags, out, err });
}
export async function updateCommand(action, rest = [], deps = {}) {
    const flags = deps.flags || {};
    const out = deps.out || console.log;
    const err = deps.err || console.error;
    const checkFn = deps.checkFn || checkForUpdates;
    const applyFn = deps.applyFn || applyUpdate;
    const confirmFn = deps.confirmFn || defaultConfirm;
    const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
    const file = flags.config || configPath();
    if (rest.length > 0) {
        throw new Error('Usage: onboarder update [check|install]');
    }
    let settings = null;
    try {
        settings = await readSettings(file);
    }
    catch {
        settings = null;
    }
    const normalized = action?.toLowerCase();
    const mode = normalized === 'check' || normalized === 'status' || flags.checkOnly || flags.dryRun
        ? 'check'
        : normalized === undefined || normalized === 'install' || normalized === 'apply' || normalized === 'now'
            ? (normalized === 'install' || normalized === 'apply' || normalized === 'now' ? 'install' : 'auto')
            : null;
    if (!mode) {
        throw new Error('Usage: onboarder update [check|install]');
    }
    const status = await checkFn({
        force: true,
        includeNotes: Boolean(flags.notes || flags.verbose || mode === 'check'),
        configFile: file,
        settings,
    });
    if (mode === 'check') {
        if (flags.json) {
            out(JSON.stringify(status, null, 2));
        }
        else {
            out(formatUpdateStatusText(status, { verbose: Boolean(flags.notes || flags.verbose || status.updateAvailable) }));
        }
        return status.error && !status.latestVersion ? 1 : 0;
    }
    if (status.error && !status.latestVersion) {
        if (flags.json)
            out(JSON.stringify(status, null, 2));
        else
            err('  ' + bad(status.error));
        return 1;
    }
    if (!status.updateAvailable && !flags.force) {
        if (flags.json) {
            out(JSON.stringify({ ok: true, alreadyCurrent: true, currentVersion: status.currentVersion, latestVersion: status.latestVersion }, null, 2));
        }
        else {
            out(tick + `Onboarder is already on the latest version (v${status.currentVersion}).`);
        }
        return 0;
    }
    if (!status.canAutoUpdate) {
        if (flags.json) {
            out(JSON.stringify({ ok: false, ...status }, null, 2));
        }
        else {
            out(formatUpdateStatusText(status, { verbose: Boolean(flags.notes) }));
            err('  ' + warn(status.reason || 'Automatic update is not supported for this installation.'));
            err(dim('    Run manually: ') + cyan(status.manualCommand));
        }
        return 1;
    }
    if (!flags.yes) {
        if (!isTTY) {
            if (flags.json) {
                out(JSON.stringify({ ok: false, confirmationRequired: true, ...status }, null, 2));
            }
            else {
                out(formatUpdateStatusText(status, { verbose: Boolean(flags.notes) }));
                err('  Non-interactive terminal — pass `--yes` to install automatically, or run:');
                err('    ' + cyan(status.manualCommand));
            }
            return 1;
        }
        out(formatUpdateStatusText(status, { verbose: Boolean(flags.notes) }));
        const okConfirm = await confirmFn(`Update Onboarder from v${status.currentVersion} to v${status.latestVersion}?`, true);
        if (!okConfirm) {
            out(dim('  Update skipped. You can run it later with: ') + cyan(status.manualCommand));
            return 0;
        }
    }
    else if (!flags.json) {
        out(`  Updating Onboarder v${status.currentVersion} → v${status.latestVersion}…`);
    }
    const logs = [];
    const result = await applyFn({
        configFile: file,
        settings,
        targetVersion: status.latestVersion || undefined,
        force: Boolean(flags.force),
    }, (event) => {
        if (event.type === 'log') {
            logs.push(event.line);
            if (!flags.json)
                out(dim('    ' + event.line));
        }
    });
    if (!result.ok) {
        if (flags.json) {
            out(JSON.stringify({ ...result, logs }, null, 2));
        }
        else {
            err('  ' + bad(result.error || 'Update failed.'));
            if (result.manualCommand)
                err(dim('    Manual command: ') + cyan(result.manualCommand));
        }
        return 1;
    }
    const runningPid = (deps.isServerRunning || defaultRunningPid)(file);
    const runInfo = runningPid ? readRunInfo(file) : null;
    const canAutoRestart = Boolean(runningPid && (!runInfo?.mode || runInfo.mode === 'background'));
    let restarted = false;
    if (runningPid && canAutoRestart) {
        const shouldRestart = Boolean(flags.restart) || (!flags.yes && isTTY && await confirmFn(`Background server is running (PID ${runningPid}). Restart it now?`, true));
        if (shouldRestart) {
            const restartFn = deps.restartFn || defaultRestartBackground;
            const restartCode = await restartFn({
                flags: { ...flags, json: Boolean(flags.json) },
                out: flags.json ? (..._args) => { } : out,
                err,
            });
            restarted = restartCode === 0;
        }
    }
    if (flags.json) {
        out(JSON.stringify({ ...result, logs, runningServerPid: runningPid, restarted }, null, 2));
        return 0;
    }
    out('');
    out(tick + bold(`Updated Onboarder to v${result.currentVersion}.`));
    if (runningPid && !restarted) {
        out(dim(`  Server PID ${runningPid} (${runInfo?.mode || 'running'}) is still running the previous version. Restart it with: `) + cyan('onboarder restart'));
    }
    out('');
    return 0;
}
//# sourceMappingURL=update.js.map