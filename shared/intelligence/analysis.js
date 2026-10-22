import { matchesReviewPath } from './pathGlob.js';
const record = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected a JSON object.');
    return value;
};
function text(value, name, max = 2000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
        throw new Error(name + ' must be a nonempty string under ' + max + ' characters.');
    return value;
}
function list(value, max = 100) {
    if (!Array.isArray(value) || value.length > max)
        throw new Error('Expected an array of at most ' + max + ' items.');
    return value;
}
export function relativePath(value) {
    const p = text(value, 'path', 500);
    if (/^[\\/]|^[a-z]:|\\|[\x00-\x1f]/i.test(p) || p.split('/').some(s => !s || s === '..' || s === '.'))
        throw new Error('Use a relative repository path.');
    return p;
}
export function parseIntelligenceConfig(input) {
    const v = record(input);
    if (v.version !== 1 || Object.keys(v).some(k => !['version', 'rules', 'baseline', 'knowledge', 'journeys', 'coverage', 'telemetry'].includes(k)))
        throw new Error('Use .onboarder.json version 1 with rules, baseline, knowledge, journeys, coverage or telemetry.');
    const rules = list(v.rules ?? []).map(raw => {
        const r = record(raw);
        return { id: text(r.id, 'rule id', 100), from: text(r.from, 'from', 200), forbid: text(r.forbid, 'forbid', 200), message: text(r.message, 'message') };
    });
    if (new Set(rules.map(r => r.id)).size !== rules.length)
        throw new Error('Rule IDs must be unique.');
    const journeys = list(v.journeys ?? [], 20).map(raw => {
        const j = record(raw);
        const steps = list(j.steps, 50).map(rawStep => {
            const s = record(rawStep);
            return { id: text(s.id, 'step id', 100), title: text(s.title, 'title', 200), instruction: text(s.instruction, 'instruction'), ...(s.path ? { path: relativePath(s.path) } : {}) };
        });
        if (new Set(steps.map(s => s.id)).size !== steps.length)
            throw new Error('Step IDs must be unique within each journey.');
        return { id: text(j.id, 'journey id', 100), title: text(j.title, 'title', 200), role: text(j.role, 'role', 100), steps };
    });
    const knowledge = list(v.knowledge ?? []).map(raw => {
        const k = record(raw);
        if (k.hash !== undefined && (typeof k.hash !== 'string' || !/^[a-f0-9]{64}$/.test(k.hash)))
            throw new Error('Knowledge hash must be a SHA-256.');
        return { id: text(k.id, 'note id', 100), path: relativePath(k.path), text: text(k.text, 'note', 4000), ...(k.hash ? { hash: String(k.hash) } : {}), ...(k.owner ? { owner: text(k.owner, 'owner', 200) } : {}) };
    });
    if (new Set(journeys.map(j => j.id)).size !== journeys.length || new Set(knowledge.map(k => k.id)).size !== knowledge.length)
        throw new Error('Journey and knowledge IDs must be unique.');
    let coverage;
    if (v.coverage !== undefined) {
        const c = record(v.coverage);
        if (!c.revision && !c.metadata || c.revision && c.metadata)
            throw new Error('Coverage needs either a revision or a generated metadata path.');
        coverage = { path: relativePath(c.path), ...(c.metadata ? { metadata: relativePath(c.metadata) } : { revision: text(c.revision, 'coverage revision', 100) }), ...(c.sourceFingerprint ? { sourceFingerprint: text(c.sourceFingerprint, 'source fingerprint', 64) } : {}) };
    }
    return { version: 1, rules, journeys, knowledge, baseline: list(v.baseline ?? [], 1000).map(id => text(id, 'baseline id', 1000)), ...(coverage ? { coverage } : {}), ...(v.telemetry ? { telemetry: { path: relativePath(record(v.telemetry).path) } } : {}) };
}
export const emptyIntelligenceConfig = () => ({ version: 1, rules: [], baseline: [], knowledge: [], journeys: [] });
export function architectureViolations(edges, config) {
    const violations = [];
    for (const rule of config.rules)
        for (const e of edges)
            if (matchesReviewPath(e.from, rule.from) && matchesReviewPath(e.to, rule.forbid)) {
                if (violations.length >= 10000)
                    throw new Error('Architecture output exceeds 10,000 violations. Narrow the configured rules.');
                const id = rule.id + ':' + e.from + '->' + e.to;
                violations.push({ id, rule: rule.id, from: e.from, to: e.to, message: rule.message, baseline: config.baseline.includes(id) });
            }
    return violations;
}
/** Measured execution data. Ambiguous paths and entity-bearing XML fail closed. */
export function parseCoverage(source) {
    if (source.length > 8 * 1024 * 1024)
        throw new Error('Coverage report exceeds 8 MB.');
    const files = new Map();
    const get = (name) => {
        const path = relativePath(name.replace(/^\.\//, ''));
        let f = files.get(path);
        if (!f) {
            f = { path, covered: [], uncovered: [], branchesCovered: 0, branchesTotal: 0 };
            files.set(path, f);
        }
        return f;
    };
    if (/<!DOCTYPE|<!ENTITY/i.test(source))
        throw new Error('Coverage XML cannot contain a DTD or entities.');
    let format;
    if (/^\s*</.test(source)) {
        format = 'cobertura';
        if (!/<coverage\b/.test(source))
            throw new Error('Expected Cobertura coverage XML.');
        for (const match of source.matchAll(/<class\b[^>]*\bfilename=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/class>/g)) {
            const f = get(match[2].replace(/&amp;/g, '&'));
            for (const line of match[3].matchAll(/<line\b([^>]*?)(?:\/>|>)/g)) {
                const n = /\bnumber=["'](\d+)["']/.exec(line[1]);
                const h = /\bhits=["'](\d+)["']/.exec(line[1]);
                if (!n || !h || +n[1] < 1)
                    throw new Error('Invalid Cobertura line.');
                (+h[1] > 0 ? f.covered : f.uncovered).push(+n[1]);
                const branches = /\bcondition-coverage=["'][^"']*\((\d+)\/(\d+)\)/.exec(line[1]);
                if (branches) {
                    f.branchesCovered += +branches[1];
                    f.branchesTotal += +branches[2];
                }
            }
        }
    }
    else {
        format = 'lcov';
        let f;
        for (const line of source.split(/\r?\n/)) {
            if (line.startsWith('SF:'))
                f = get(line.slice(3));
            else if (line === 'end_of_record')
                f = undefined;
            else if (/^(DA|BRDA):/.test(line)) {
                if (!f)
                    throw new Error('Coverage data must follow an SF file.');
                if (line.startsWith('DA:')) {
                    const match = /^DA:(\d+),(\d+)(?:,.*)?$/.exec(line);
                    if (!match || +match[1] < 1)
                        throw new Error('Invalid LCOV line.');
                    (+match[2] > 0 ? f.covered : f.uncovered).push(+match[1]);
                }
                else {
                    const match = /^BRDA:\d+,[^,]+,[^,]+,(\d+|-)$/.exec(line);
                    if (!match)
                        throw new Error('Invalid LCOV branch.');
                    f.branchesTotal++;
                    if (match[1] !== '-' && +match[1] > 0)
                        f.branchesCovered++;
                }
            }
        }
    }
    if (!files.size)
        throw new Error('No measured coverage files found.');
    for (const f of files.values()) {
        f.covered = [...new Set(f.covered)].sort((a, b) => a - b);
        f.uncovered = [...new Set(f.uncovered)].filter(n => !f.covered.includes(n)).sort((a, b) => a - b);
    }
    return { format, files: [...files.values()] };
}
export function packageMap(texts) {
    const packages = [];
    for (const [file, source] of texts)
        if (/(^|\/)package\.json$/.test(file)) {
            try {
                const pkg = record(JSON.parse(source));
                const deps = { ...record(pkg.dependencies ?? {}), ...record(pkg.devDependencies ?? {}), ...record(pkg.peerDependencies ?? {}) };
                packages.push({ name: typeof pkg.name === 'string' ? pkg.name : file, path: file.replace(/(^|\/)package\.json$/, ''), scripts: Object.keys(record(pkg.scripts ?? {})), dependencies: Object.fromEntries(Object.entries(deps).filter((entry) => typeof entry[1] === 'string')) });
            }
            catch { /* Invalid manifests are not invented as packages. */ }
        }
    const names = new Set(packages.map(p => p.name));
    const declarations = new Map();
    const edges = [];
    for (const pkg of packages)
        for (const [name, range] of Object.entries(pkg.dependencies)) {
            if (names.has(name))
                edges.push({ from: pkg.name, to: name, range });
            if (!declarations.has(name))
                declarations.set(name, new Set());
            declarations.get(name).add(range);
        }
    return { packages, edges, duplicateDeclarations: [...declarations].filter(([, ranges]) => ranges.size > 1).map(([name, ranges]) => ({ name, ranges: [...ranges] })) };
}
export function detectRoutes(texts) {
    const routes = [];
    for (const [path, source] of texts) {
        if (!/\.[cm]?[jt]sx?$|\.py$/.test(path))
            continue;
        if (/(?:^|\/)(?:__tests__|tests?|fixtures)\/|[.-](?:spec|test)\./.test(path))
            continue;
        const lines = source.split('\n');
        lines.forEach((line, i) => {
            if (/^\s*(?:\/\/|#|\*)/.test(line))
                return;
            const js = /\b(?:app|router|server)\.(get|post|put|patch|delete|options|head|use)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(.*)/i.exec(line);
            const py = /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/.exec(line);
            const declared = /method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"].*?path:\s*['"]([^'"]+)['"]/.exec(line);
            const m = js || py || declared;
            if (!m)
                return;
            const args = js ? js[3].replace(/\)\s*;?\s*$/, '').split(',').map(s => s.trim()) : [];
            const finalArgument = args.at(-1) || '';
            const handler = /^([\w.$]+)\s*\)/.exec(finalArgument)?.[1] || finalArgument;
            routes.push({ path, line: i + 1, method: m[1].toUpperCase(), route: m[2], handler: handler.slice(0, 120) || (py ? lines[i + 1]?.trim().slice(0, 120) : 'route table'),
                middleware: args.slice(0, -1).filter(s => /^[\w.$]+$/.test(s)), confidence: declared ? 'declared' : 'inferred' });
        });
    }
    return routes.slice(0, 1000);
}
export function detectDataModels(texts) {
    const out = [];
    for (const [path, source] of texts) {
        if (!/\.(prisma|sql|py|ts|js)$/.test(path))
            continue;
        source.split('\n').forEach((line, i) => {
            const m = /^\s*model\s+(\w+)\s*\{/.exec(line) || /\bCREATE\s+TABLE\s+(?:IF NOT EXISTS\s+)?["\x60]?(\w+)/i.exec(line) || /\bclass\s+(\w+)\s*\((?:[^)]*\bModel)[^)]*\)/.exec(line);
            if (m)
                out.push({ path, line: i + 1, name: m[1], kind: path.endsWith('.prisma') ? 'Prisma model' : path.endsWith('.sql') ? 'SQL table' : 'ORM model' });
        });
    }
    return out.slice(0, 1000);
}
export function ownersFor(file, codeowners) {
    let owners = [];
    const segments = file.split('/'), parentPaths = segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join('/'));
    for (const line of codeowners.split('\n')) {
        const [raw, ...people] = line.split('#')[0].trim().split(/\s+/);
        if (!raw || /[!\[\]\\]/.test(raw))
            continue;
        const directory = raw.endsWith('/'), anchored = raw.startsWith('/');
        let pattern = raw.replace(/^\//, '').replace(/\/$/, '');
        if (!pattern)
            continue;
        if (!anchored && !pattern.includes('/'))
            pattern = '**/' + pattern;
        const literalEnd = !/[?*]/.test(pattern.split('/').at(-1));
        // Bare directory names own descendants; docs/* deliberately owns only its immediate files.
        const ancestors = literalEnd && !directory ? parentPaths : [];
        if (matchesReviewPath(file, directory ? pattern + '/**' : pattern) || ancestors.some(p => matchesReviewPath(p, pattern)))
            owners = people.filter(s => s.startsWith('@') || s.includes('@'));
    }
    return owners;
}
export function defaultJourneys(files, entries) {
    const select = (pattern) => files.find(f => pattern.test(f.path))?.path;
    return [
        { id: 'orientation', title: 'Understand the repository', role: 'Everyone', steps: [
                { id: 'entry', title: 'Find the front door', path: entries[0] || files[0]?.path, instruction: 'Read the entry point and follow its first internal dependency.' },
                { id: 'test', title: 'Inspect a test', path: select(/(?:test|spec)[/.]/), instruction: 'Read an existing test. Identify its behavior and the documented command to run it.' },
            ] },
        { id: 'frontend', title: 'Explore the interface', role: 'Frontend developer', steps: [
                { id: 'screen', title: 'Follow a screen', path: select(/(?:public|frontend|components|pages)\//), instruction: 'Follow an interaction from the screen to its data source.' },
                { id: 'contract', title: 'Find its contract', path: select(/(?:contracts|types|api)\./), instruction: 'Inspect the data contract and error handling used by the interface.' },
            ] },
        { id: 'backend', title: 'Follow a request', role: 'Backend developer', steps: [
                { id: 'route', title: 'Read a route', path: select(/(?:server|routes|controllers)\//), instruction: 'Find request validation, authorization, and the handler.' },
                { id: 'check', title: 'Trace a failure', path: select(/(?:test|spec)[/.]/), instruction: 'Find a test for a rejected request and inspect its assertions.' },
            ] },
        { id: 'contribution', title: 'Make a first change', role: 'Contributor', steps: [
                { id: 'scope', title: 'Choose a small task', instruction: 'Choose an issue, inspect related files, and record an implementation plan.' },
                { id: 'review', title: 'Verify the change', instruction: 'Run relevant checks and review the exact patch before preparing a pull request.' },
            ] },
    ];
}
export function compareSnapshots(before, after) {
    const edgeKey = (e) => e.from + '->' + e.to;
    const a = new Set(before.edges.map(edgeKey));
    const b = new Set(after.edges.map(edgeKey));
    const previous = new Map(before.files.map(f => [f.path, f]));
    const current = new Map(after.files.map(f => [f.path, f]));
    const cycles = new Set(before.cycles.map(c => [...c].sort().join('|')));
    return {
        base: before.revision, head: after.revision,
        addedConnections: [...b].filter(e => !a.has(e)), removedConnections: [...a].filter(e => !b.has(e)),
        introducedCycles: after.cycles.filter(c => !cycles.has([...c].sort().join('|'))),
        addedFiles: after.files.filter(f => !previous.has(f.path)).map(f => f.path),
        removedFiles: before.files.filter(f => !current.has(f.path)).map(f => f.path),
        changedFiles: after.files.filter(f => previous.has(f.path) && previous.get(f.path).hash !== f.hash).map(f => f.path),
        removedExports: before.files.flatMap(f => f.exports.filter(name => !current.get(f.path)?.exports.includes(name)).map(name => ({ path: f.path, name }))),
        newViolations: after.violations.filter(v => !before.violations.some(old => old.id === v.id)),
        securityDelta: after.metrics.security - before.metrics.security,
    };
}
export function impactReport(report, file) {
    relativePath(file);
    if (!report.snapshot.files.some(f => f.path === file))
        throw new Error('Choose a file in this snapshot.');
    const paths = new Map([[file, [file]]]);
    const queue = [file];
    const reverse = new Map();
    for (const edge of report.snapshot.edges) {
        const items = reverse.get(edge.to) || [];
        items.push(edge.from);
        reverse.set(edge.to, items);
    }
    for (let i = 0; i < queue.length; i++)
        for (const from of reverse.get(queue[i]) || []) {
            if (!paths.has(from)) {
                paths.set(from, [...paths.get(queue[i]), from]);
                queue.push(from);
            }
        }
    return { file, fingerprint: report.snapshot.fingerprint,
        dependents: [...paths].filter(([p]) => p !== file).map(([path, via]) => ({ path, via })),
        suggestedTests: [...paths.keys()].filter(p => /(?:^|\/)(?:__tests__|tests?)\/|[.-](?:spec|test)\./.test(p)),
        measuredCoverage: report.coverage.status === 'current' ? report.coverage.report?.files.find(f => f.path === file) || null : null,
        coverageStatus: report.coverage.status, symbolReferences: report.semantic.references.filter(r => r.targetPath === file).slice(0, 200),
        limitation: 'Dependency paths and suggested tests are static estimates. Measured coverage requires a matching execution report.' };
}
//# sourceMappingURL=analysis.js.map