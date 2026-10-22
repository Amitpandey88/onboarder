import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
const execute = promisify(execFile);
/** Git filters can execute code even for status/diff/checkout. Disable configured filters explicitly. */
export async function safeGitArguments(root, signal) {
    let text = '';
    try {
        text = (await execute('git', ['-C', root, 'config', '--get-regexp', '^filter\\..*\\.(smudge|clean|process|required)$'], { signal, timeout: 10000, maxBuffer: 65536 })).stdout;
    }
    catch (e) {
        if (signal?.aborted)
            throw e;
        if (e.code !== 1)
            throw new Error('Could not inspect Git filter configuration safely.');
    }
    const keys = [...new Set(text.split('\n').map(line => /^(filter\.[\w./-]+\.(?:smudge|clean|process|required))(?:\s|$)/.exec(line)?.[1]).filter(Boolean))];
    if (text.split('\n').some(line => line.startsWith('filter.') && !/^(filter\.[\w./-]+\.(?:smudge|clean|process|required))(?:\s|$)/.test(line)) || keys.length > 100)
        throw new Error('Unsupported Git filter configuration.');
    return ['--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', '-c', `core.hooksPath=${os.devNull}`, '-c', 'submodule.recurse=false',
        ...keys.flatMap(key => ['-c', key + '=' + (key.endsWith('.required') ? 'false' : '')])];
}
//# sourceMappingURL=gitSafety.js.map