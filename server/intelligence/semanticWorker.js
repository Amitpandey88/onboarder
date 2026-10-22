// CompilerHost only sees the captured snapshot. It cannot read dependencies,
// plugins, source files, or configurations elsewhere on the machine.
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseJsonConfig } from '../../shared/analyzer/jsonConfig.js';
// TypeScript is an optional external API with a versioned runtime boundary.
const ts = createRequire(import.meta.url)(workerData.engine);
if (typeof ts.createProgram !== 'function')
    throw new Error('Compiler API unavailable.');
const texts = new Map(workerData.texts);
const prefix = '/onboarder-snapshot/';
const virtual = new Map([...texts].map(([file, value]) => [prefix + file, value]));
let configured = {};
try {
    configured = parseJsonConfig(texts.get('tsconfig.json') || '{}').compilerOptions || {};
}
catch { }
// Allow only declarative resolution settings, never plugins or external libs.
const converted = ts.convertCompilerOptionsFromJson(Object.fromEntries(Object.entries(configured).filter(([key]) => ['baseUrl', 'paths', 'jsx', 'module', 'moduleResolution', 'target'].includes(key))), prefix);
const options = { ...converted.options, allowJs: true, checkJs: false, noLib: true, noEmit: true, skipLibCheck: true };
const projects = [];
const packages = [];
for (const [file, source] of texts) {
    if (/(^|\/)[jt]sconfig\.json$/.test(file)) {
        try {
            const compilerOptions = parseJsonConfig(source).compilerOptions || {};
            const folder = path.posix.dirname(prefix + file) + '/';
            projects.push({ folder, options: ts.convertCompilerOptionsFromJson(Object.fromEntries(Object.entries(compilerOptions).filter(([key]) => ['baseUrl', 'paths', 'jsx', 'module', 'moduleResolution', 'target'].includes(key))), folder).options });
        }
        catch { }
    }
    if (/(^|\/)package\.json$/.test(file)) {
        try {
            const pkg = JSON.parse(source);
            const entry = pkg.source || pkg.types || pkg.module || pkg.main || 'index.ts';
            if (typeof pkg.name === 'string' && typeof entry === 'string')
                packages.push({ name: pkg.name, folder: path.posix.dirname(prefix + file), entry });
        }
        catch { }
    }
}
projects.sort((a, b) => b.folder.length - a.folder.length);
const host = {
    getSourceFile: (name, version) => virtual.has(name) ? ts.createSourceFile(name, virtual.get(name), version, true) : undefined,
    getDefaultLibFileName: () => '', writeFile: () => { }, getCurrentDirectory: () => prefix,
    getDirectories: () => [], fileExists: (name) => virtual.has(name),
    directoryExists: (name) => [...virtual.keys()].some(file => file.startsWith(name.replace(/\/$/, '') + '/')),
    readFile: (name) => virtual.get(name),
    getCanonicalFileName: (name) => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    realpath: (name) => path.posix.normalize(name),
    resolveModuleNames: (names, containing) => names.map(name => {
        const local = projects.find(project => containing.startsWith(project.folder));
        const resolved = ts.resolveModuleName(name, containing, { ...options, ...local?.options }, host).resolvedModule;
        if (resolved)
            return resolved;
        const pkg = packages.find(pkg => name === pkg.name || name.startsWith(pkg.name + '/'));
        if (!pkg)
            return undefined;
        const relative = name === pkg.name ? pkg.entry : name.slice(pkg.name.length + 1);
        const base = path.posix.join(pkg.folder, relative);
        const file = [base, base.replace(/\.js$/, '.ts'), base + '.ts', base + '.tsx', base + '.js', base + '/index.ts'].find(candidate => virtual.has(candidate));
        return file ? { resolvedFileName: file, isExternalLibraryImport: false } : undefined;
    }),
};
const roots = [...virtual.keys()].filter(file => /\.[cm]?[jt]sx?$/.test(file));
const program = ts.createProgram(roots, options, host);
const checker = program.getTypeChecker();
const result = { available: true, engine: 'TypeScript ' + ts.version, definitions: [], references: [] };
const locate = (node) => {
    const source = node.getSourceFile();
    return { path: source.fileName.slice(prefix.length), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 };
};
let visited = 0;
for (const source of program.getSourceFiles()) {
    const visit = (node) => {
        if (++visited > 500000 || result.references.length >= 20000) {
            result.truncated = true;
            return;
        }
        if (ts.isIdentifier(node)) {
            let symbol = checker.getSymbolAtLocation(node);
            if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node)
                symbol = checker.getShorthandAssignmentValueSymbol(node.parent) || symbol;
            if (symbol && (symbol.flags & ts.SymbolFlags.Alias))
                symbol = checker.getAliasedSymbol(symbol);
            const declaration = symbol?.valueDeclaration || symbol?.declarations?.[0];
            if (declaration && virtual.has(declaration.getSourceFile().fileName)) {
                const here = locate(node);
                const there = locate(declaration);
                if (declaration.name === node)
                    result.definitions.push({ name: node.text, ...here, kind: ts.SyntaxKind[declaration.kind] });
                else
                    result.references.push({ name: node.text, ...here, targetPath: there.path, targetLine: there.line,
                        kind: ((ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent)) && node.parent.expression === node) ||
                            (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node && (ts.isCallExpression(node.parent.parent) || ts.isNewExpression(node.parent.parent))) ? 'call' : 'reference' });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
}
parentPort?.postMessage(result);
//# sourceMappingURL=semanticWorker.js.map