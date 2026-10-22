import { impactReport } from '../shared/intelligence/analysis.js';
import { installSemanticEngine } from '../server/intelligence/semantic.js';
import { realpath } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { workspaceFor, IntelligenceWorkspace, compareRevisions, portfolioFor } from '../server/intelligence/workspace.js';
import { IntelligenceStore } from '../server/intelligence/store.js';
import { expandHome } from '../server/paths.js';
export const INTELLIGENCE_HELP = [
    'Onboarder intelligence',
    '  scan [folder] --semantic --json     Inspect evidence, packages, routes, boundaries and coverage',
    '  impact <folder> <file>             Trace dependents, semantic references and relevant tests',
    '  ask [folder] <question>             Retrieve cited source evidence and related tests offline',
    '  compare [folder] --base ref --head ref  Compare exact committed architecture',
    '  snapshot [folder]                  Save a private source-free snapshot',
    '  history [folder]                   List saved snapshots',
    '  rules [folder]                     Print boundary violations; --fail-on high exits 1 for new violations',
    '  coverage|packages|routes|journeys [folder]  Inspect a focused report',
    '  watch [folder]                     Refresh changed source; Ctrl-C stops',
    '  benchmark [folder]                 Measure actual cold/warm indexing',
    '  portfolio <folder> <folder>         Connect declared packages across repositories',
    '  semantic-setup                     Install the pinned optional compiler API',
    '  doctor [folder]                    Show runtime and repository identity',
    'Optional semantic engine: set ONBOARDER_TYPESCRIPT_MODULE to a trusted TypeScript Compiler API lib/typescript.js.',
].join('\n');
export async function intelligenceCommand(sub, rest, flags) {
    if (flags.help || sub === 'help') {
        console.log(INTELLIGENCE_HELP);
        return 0;
    }
    const commands = ['scan', 'ask', 'compare', 'snapshot', 'history', 'rules', 'coverage', 'packages', 'routes', 'journeys', 'watch', 'benchmark', 'doctor', 'portfolio', 'semantic-setup', 'impact'];
    const command = sub && commands.includes(sub) ? sub : 'scan';
    const args = sub && !commands.includes(sub) ? [sub, ...rest] : rest;
    if (command === 'semantic-setup') {
        console.log(JSON.stringify(await installSemanticEngine(), null, 2));
        return 0;
    }
    const root = await realpath(expandHome(args[0] || '.'));
    const workspace = await workspaceFor(root);
    const print = (data) => console.log(JSON.stringify(data, null, flags.json || command === 'watch' ? undefined : 2));
    if (command === 'portfolio') {
        print(await portfolioFor(args.map(expandHome)));
        return 0;
    }
    if (command === 'compare') {
        print(await compareRevisions(root, flags.base || 'HEAD~1', flags.head || 'HEAD'));
        return 0;
    }
    if (command === 'history') {
        print((await new IntelligenceStore().read(root)).snapshots);
        return 0;
    }
    if (command === 'doctor') {
        const report = await workspace.refresh({ semantic: true });
        print({ executable: process.execPath, entry: process.argv[1], node: process.version, repository: root,
            revision: report.snapshot.revision, analyzer: report.snapshot.analyzerVersion, sourceFingerprint: report.snapshot.fingerprint, semantic: { available: report.semantic.available, engine: report.semantic.engine, reason: report.semantic.reason } });
        return 0;
    }
    if (command === 'benchmark') {
        const fresh = new IntelligenceWorkspace(root);
        const start = performance.now();
        const first = await fresh.refresh();
        const coldMs = performance.now() - start;
        const warmStart = performance.now();
        const second = await fresh.refresh();
        const warmMs = performance.now() - warmStart;
        print({ coldMs, warmMs, parsedFiles: first.snapshot.metrics.files, warmReused: second.snapshot.metrics.reused, stableFingerprint: first.snapshot.fingerprint === second.snapshot.fingerprint, heapBytes: process.memoryUsage().heapUsed });
        return 0;
    }
    if (command === 'watch') {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        process.once('SIGINT', cancel);
        process.once('SIGTERM', cancel);
        let previous = '';
        try {
            while (!controller.signal.aborted) {
                const result = await workspace.refresh({ signal: controller.signal, semantic: flags.semantic === true });
                if (result.snapshot.fingerprint !== previous) {
                    print(result);
                    previous = result.snapshot.fingerprint;
                }
                await delay(3000, undefined, { signal: controller.signal });
            }
        }
        catch (error) {
            if (!controller.signal.aborted)
                throw error;
        }
        finally {
            process.off('SIGINT', cancel);
            process.off('SIGTERM', cancel);
        }
        return 0;
    }
    const report = await workspace.refresh({ semantic: flags.semantic === true });
    if (command === 'impact') {
        print(impactReport(report, args[1] || ''));
        return 0;
    }
    if (command === 'ask') {
        print(workspace.evidence(args.slice(1).join(' ')));
        return 0;
    }
    if (command === 'snapshot') {
        await new IntelligenceStore().saveSnapshot(root, report.snapshot);
        print(report.snapshot);
        return 0;
    }
    if (command === 'rules') {
        print(report.rules);
        return flags.failOn && report.rules.some(v => !v.baseline) ? 1 : 0;
    }
    if (['coverage', 'packages', 'routes', 'journeys'].includes(command)) {
        print(report[command]);
        return 0;
    }
    print(report);
    return 0;
}
//# sourceMappingURL=intelligence.js.map