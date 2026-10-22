import { promises as fs } from 'node:fs';
import path from 'node:path';
import { captureFixSource, privateText } from '../../server/fixSource.js';
import { hash } from '../../server/intelligence/workspace.js';
import { runProcess, terminalText } from './process.js';
/** Definitions are displayed and approved by the operator; model text is never a command. */
export async function fixCheckPlan(root) {
    const source = await captureFixSource(root, { mode: 'working' });
    let scripts = {};
    try {
        scripts = JSON.parse(source.files.get('package.json') || '{}').scripts || {};
    }
    catch { /* No valid project scripts. */ }
    const checks = [];
    for (const name of ['test', 'typecheck', 'lint', 'build'])
        if (typeof scripts[name] === 'string' && scripts[name].length <= 4000) {
            const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
            const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run ' + name] : ['run', name];
            const lifecycle = ['pre' + name, name, 'post' + name].filter(key => typeof scripts[key] === 'string');
            checks.push({ id: name, command, args, definitionHash: hash(JSON.stringify(lifecycle.map(key => [key, scripts[key]]))),
                script: lifecycle.map(key => key + ': ' + privateText(scripts[key])).join('\n'), description: 'Project-defined ' + name + ' script (executes repository code)' });
        }
    const tests = [...source.files.keys()].filter(p => /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?js$/.test(p) && /^[\w./-]+$/.test(p)).slice(0, 20);
    for (const file of tests)
        checks.push({ id: 'node-test:' + file, command: 'node', args: ['--test', file], description: 'Node test file: ' + file });
    return { digest: hash(JSON.stringify(checks)), checks, notice: 'Worktrees isolate file edits, not execution. Run only reviewed checks in a trusted repository on this computer, or use your own OS/container isolation. No dependency installation, network setup, or model-generated commands run automatically.' };
}
export async function executeFixCheck(manifest, check, phase, options = {}) {
    if (!manifest.permissions.checks || manifest.root === manifest.sourceRoot || !manifest.branch)
        throw new Error('Checks require explicit permission in an isolated implementation workspace.');
    // Capture a receipt even when cancellation arrives during the pre-execution read.
    const start = Date.now(), before = await captureFixSource(manifest.root, { mode: 'working' });
    const receipt = { id: check.id, phase, status: 'error', code: null, output: '', startedAt: new Date().toISOString(), durationMs: 0,
        sourceBefore: before.fingerprint, sourceAfter: null, sourceChanged: false, commandDigest: hash(JSON.stringify(check)) };
    // Remove inherited model, GitHub and session credentials, executable injection and Node preload hooks.
    const env = {};
    for (const name of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'])
        if (process.env[name])
            env[name] = process.env[name];
    env.CI = 'true';
    env.GIT_CONFIG_NOSYSTEM = '1';
    env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
    try {
        const result = await runProcess(check.command === 'node' ? process.execPath : check.command, check.args, { cwd: manifest.root, env, timeoutMs: options.timeoutMs || 120000, maxBytes: 256 * 1024, signal: options.signal });
        receipt.code = result.code;
        receipt.status = result.code === 0 ? 'passed' : 'failed';
        receipt.output = privateText(terminalText(result.stdout + result.stderr)).slice(-16000);
    }
    catch (e) {
        receipt.status = options.signal?.aborted ? 'cancelled' : /time limit/.test(e.message) ? 'timed-out' : 'error';
        // Subprocess errors can contain repository output and environment values.
        receipt.output = privateText(terminalText(e.message)).slice(-2000);
    }
    try {
        receipt.sourceAfter = (await captureFixSource(manifest.root, { mode: 'working' })).fingerprint;
    }
    catch {
        receipt.sourceAfter = null;
    }
    receipt.sourceChanged = receipt.sourceAfter !== receipt.sourceBefore;
    receipt.durationMs = Date.now() - start;
    await fs.appendFile(path.join(path.dirname(manifest.auditFile), 'checks.jsonl'), JSON.stringify(receipt) + '\n', { mode: 0o600 });
    return receipt;
}
//# sourceMappingURL=checks.js.map