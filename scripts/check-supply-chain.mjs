// Offline release guard: verify committed pins, browser bytes and the npm file boundary.
import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFile(path.join(root, name), 'utf8');
const fail = message => { throw new Error(message); };
const pkg = JSON.parse(await read('package.json'));
const lock = JSON.parse(await read('package-lock.json'));
for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  if (Object.keys(pkg[key] || {}).length) fail(`Unexpected runtime ${key}. Review the supply-chain policy.`);
}
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) if (pkg.scripts[hook]) fail(`Install hook ${hook} is forbidden.`);
for (const [name, version] of Object.entries(pkg.devDependencies)) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || lock.packages[''].devDependencies[name] !== version || lock.packages['node_modules/' + name]?.version !== version) fail(`Unpinned or inconsistent dependency: ${name}`);
}
for (const [name, entry] of Object.entries(lock.packages)) {
  if (!name) continue;
  if (!entry.resolved?.startsWith('https://registry.npmjs.org/') || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity || '') || entry.hasInstallScript) fail(`Untrusted dependency resolution or install hook: ${name}`);
}
const manifest = JSON.parse(await read('public/vendor/manifest.json'));
const vendorPackage = JSON.parse(await read('security/vendor/package.json'));
const vendorLock = JSON.parse(await read('security/vendor/package-lock.json'));
for (const name of ['mermaid', 'monaco-editor']) {
  const component = manifest.components.find(component => component.name === name);
  if (!component || !/^\d+\.\d+\.\d+$/.test(component.version) || vendorPackage.dependencies[name] !== component.version || vendorLock.packages['node_modules/' + name]?.version !== component.version) fail(`Vendor audit and asset versions differ: ${name}`);
}
for (const [name, entry] of Object.entries(vendorLock.packages)) {
  if (!name) continue;
  if (!entry.resolved?.startsWith('https://registry.npmjs.org/') || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity || '')) fail(`Untrusted vendor audit resolution: ${name}`);
}
let assets = 0;
async function verify(dir) {
  for (const entry of await readdir(path.join(root, 'public/vendor', dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) { await verify(relative); continue; }
    if (relative === 'manifest.json') continue;
    if (!entry.isFile()) fail(`Unexpected vendor symlink: ${relative}`);
    const hash = createHash('sha256').update(await readFile(path.join(root, 'public/vendor', relative))).digest('hex');
    if (manifest.files[relative] !== hash) fail(`Unreviewed vendor asset: ${relative}`);
    assets++;
  }
}
await verify('');
if (assets !== Object.keys(manifest.files).length) fail('Missing vendor assets.');
const html = await read('public/index.html');
for (const name of ['monaco/vs/loader.js', 'mermaid.min.js']) {
  const sri = 'sha384-' + createHash('sha384').update(await readFile(path.join(root, 'public/vendor', name))).digest('base64');
  const component = manifest.components.find(component => component.name === (name.startsWith('monaco/') ? 'monaco-editor' : 'mermaid'));
  if (!html.includes(`src="/vendor/${name}?v=${component.version}" integrity="${sri}"`)) fail(`Missing versioned browser integrity attribute for ${name}`);
}
for (const name of await readdir(path.join(root, '.github/workflows'))) {
  const workflow = await read('.github/workflows/' + name);
  for (const [, action, revision] of workflow.matchAll(/uses:\s*([^\s@]+)@([^\s#]+)/g)) {
    if (!/^[a-f0-9]{40}$/.test(revision)) fail(`Unpinned CI action: ${action}`);
  }
}
// Suppress lifecycle hooks during this read-only inspection of npm's canonical packlist.
const pack = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: process.platform === 'win32' });
if (pack.status !== 0) fail('Could not inspect npm package: ' + pack.stderr);
const packed = JSON.parse(pack.stdout);
// npm <=11 emits an array; npm 12 emits a map keyed by package name.
const entry = Array.isArray(packed) ? packed.length === 1 && packed[0] : packed && typeof packed === 'object' && Object.keys(packed).length === 1 && packed[pkg.name];
if (!entry || !Array.isArray(entry.files) || entry.files.some(file => !file || typeof file.path !== 'string')) fail('Could not inspect npm package: malformed single-package inventory.');
const files = entry.files.map(file => file.path);
const allowed = /^(?:bin\/|cli\/|server\/|shared\/|public\/|docs\/(?:HERMES_RESEARCH|SUPPLY_CHAIN_SECURITY|ADVANCED_FEATURES|UNIFIED_REVIEW_FOUNDATION|CONTEXTUAL_AI_REVIEW|AI_FIX_VERIFICATION|PR_TRIAGE|PHASE4A_VERIFICATION|RELEASE_1\.1\.0|MIGRATING_TO_1\.1)\.md$|integrations\/vscode\/(?:package\.json|extension\.cjs|README\.md)$|scripts\/package-editor\.mjs$|(?:package\.json|README\.md|CHANGELOG\.md|LICENSE|SECURITY\.md)$)/;
for (const file of files) {
  if (!allowed.test(file) || /(?:^|\/)(?:\.env(?:\.|$)|\.git|\.codex|node_modules|AGENTS\.md|PROJECT_MEMORY\.md)|\.(?:pem|key|p12|pfx)$|(?:^|\/)postinstall\.js$/.test(file)) fail(`Unexpected published file: ${file}`);
  if ((await lstat(path.join(root, file))).isSymbolicLink()) fail(`Package symlink: ${file}`);
}
for (const file of ['bin/onboarder.js', 'public/app.js', 'public/vendor/manifest.json', 'server/security/download.js', 'server/reviewEvidence.js', 'server/intelligence/githubReview.js', 'server/reviewAI.js', 'server/reviewContext.js', 'cli/review.js', 'public/js/reviewAI.js', 'server/fixEngine.js', 'server/fixProposal.js', 'server/fixStore.js', 'server/fixSource.js', 'cli/fix.js', 'cli/agent/checks.js', 'cli/agent/workspace.js', 'cli/agent/gitSafety.js', 'shared/review/fixContracts.js', 'public/js/reviewFix.js', 'docs/AI_FIX_VERIFICATION.md', 'server/triage.js', 'server/triageAI.js', 'server/apiTriage.js', 'server/providers/github.js', 'server/providers/contracts.js', 'shared/triage/contracts.js', 'shared/triage/priority.js', 'cli/triage.js', 'public/js/triageView.js', 'docs/PR_TRIAGE.md', 'docs/PHASE4A_VERIFICATION.md', 'docs/SUPPLY_CHAIN_SECURITY.md', 'docs/UNIFIED_REVIEW_FOUNDATION.md', 'docs/CONTEXTUAL_AI_REVIEW.md', 'SECURITY.md']) if (!files.includes(file)) fail(`Missing packaged file: ${file}`);
for (const file of ['server/security/deadline.js', 'CHANGELOG.md', 'docs/RELEASE_1.1.0.md', 'docs/MIGRATING_TO_1.1.md', 'integrations/vscode/package.json', 'integrations/vscode/extension.cjs', 'integrations/vscode/README.md', 'scripts/package-editor.mjs']) if (!files.includes(file)) fail(`Missing packaged file: ${file}`);
console.log(`Supply-chain checks passed: ${Object.keys(lock.packages).length - 1} locked dependencies, ${assets} vendor assets, ${files.length} package files.`);
