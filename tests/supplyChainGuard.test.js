import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-package-guard-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (name, value) => {
    const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  await write('scripts/check-supply-chain.mjs', await fs.readFile(fileURLToPath(new URL('../scripts/check-supply-chain.mjs', import.meta.url)), 'utf8'));
  const pkg = { name: 'onboarder-guard-fixture', version: '1.0.0', type: 'module', files: ['bin', 'cli', 'shared', 'public', 'server', 'docs', 'integrations', 'scripts/package-editor.mjs', 'CHANGELOG.md', 'SECURITY.md'], scripts: {}, devDependencies: {} };
  await write('package.json', pkg); await write('package-lock.json', { packages: { '': { devDependencies: {} } } });
  const components = [{ name: 'mermaid', version: '11.17.2' }, { name: 'monaco-editor', version: '0.52.2' }];
  const manifest = { components, files: {} }; let html = '';
  await write('security/vendor/package.json', { dependencies: { mermaid: '11.17.2', 'monaco-editor': '0.52.2' } });
  await write('security/vendor/package-lock.json', { packages: { '': {}, 'node_modules/mermaid': {version:'11.17.2',resolved:'https://registry.npmjs.org/mermaid/mermaid-11.17.2.tgz',integrity:'sha512-YQ=='}, 'node_modules/monaco-editor':{version:'0.52.2',resolved:'https://registry.npmjs.org/monaco-editor/monaco-editor-0.52.2.tgz',integrity:'sha512-YQ=='} } });
  for (const name of ['monaco/vs/loader.js', 'mermaid.min.js']) {
    const content = 'fixture asset'; await write('public/vendor/' + name, content);
    manifest.files[name] = createHash('sha256').update(content).digest('hex');
    html += `<script src="/vendor/${name}?v=${name.startsWith('monaco/') ? '0.52.2' : '11.17.2'}" integrity="sha384-${createHash('sha384').update(content).digest('base64')}"></script>`;
  }
  await write('public/vendor/manifest.json', manifest); await write('public/index.html', html);
  for (const file of ['bin/onboarder.js', 'public/app.js', 'server/security/download.js', 'server/reviewEvidence.js', 'server/intelligence/githubReview.js', 'server/reviewAI.js', 'server/reviewContext.js', 'cli/review.js', 'public/js/reviewAI.js', 'server/fixEngine.js', 'server/fixProposal.js', 'server/fixStore.js', 'server/fixSource.js', 'cli/fix.js', 'cli/agent/checks.js', 'cli/agent/workspace.js', 'cli/agent/gitSafety.js', 'shared/review/fixContracts.js', 'public/js/reviewFix.js', 'docs/AI_FIX_VERIFICATION.md', 'server/triage.js', 'server/triageAI.js', 'server/apiTriage.js', 'server/providers/github.js', 'server/providers/contracts.js', 'shared/triage/contracts.js', 'shared/triage/priority.js', 'cli/triage.js', 'public/js/triageView.js', 'docs/PR_TRIAGE.md', 'docs/PHASE4A_VERIFICATION.md', 'docs/SUPPLY_CHAIN_SECURITY.md', 'docs/UNIFIED_REVIEW_FOUNDATION.md', 'docs/CONTEXTUAL_AI_REVIEW.md', 'SECURITY.md']) await write(file, 'fixture');
  for (const file of ['server/security/deadline.js', 'CHANGELOG.md', 'docs/RELEASE_1.1.0.md', 'docs/MIGRATING_TO_1.1.md', 'integrations/vscode/package.json', 'integrations/vscode/extension.cjs', 'integrations/vscode/README.md', 'scripts/package-editor.mjs']) await write(file, 'fixture');
  await write('.github/workflows/ci.yml', 'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
  const run = () => spawnSync(process.execPath, ['scripts/check-supply-chain.mjs'], { cwd: root, encoding: 'utf8', timeout: 15_000 });
  return { root, pkg, write, run };
}

test('release guard accepts a complete package and rejects a newly shipped credential file', async t => {
  const { write, run } = await fixture(t);
  let result = run(); assert.equal(result.status, 0, result.stderr);
  await write('public/credential.pem', 'fixture private key');
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Unexpected published file.*credential.pem/);
});

test('release guard rejects a package missing unified review modules or its guide', async t => {
  const { root, run, write } = await fixture(t);
  for (const file of ['server/reviewEvidence.js', 'server/intelligence/githubReview.js', 'docs/UNIFIED_REVIEW_FOUNDATION.md', 'server/reviewAI.js', 'server/reviewContext.js', 'public/js/reviewAI.js', 'docs/CONTEXTUAL_AI_REVIEW.md', 'server/security/deadline.js', 'integrations/vscode/extension.cjs', 'scripts/package-editor.mjs', 'docs/MIGRATING_TO_1.1.md']) {
    await fs.unlink(path.join(root, file));
    const result = run(); assert.notEqual(result.status, 0); assert.ok(result.stderr.includes('Missing packaged file: ' + file));
    await write(file, 'fixture');
  }
});

test('release guard accepts npm 11 and npm 12 inventories and fails closed on malformed or forbidden files', { skip: process.platform === 'win32' }, async t => {
  const { root, write } = await fixture(t);
  const packed = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.equal(packed.status, 0, packed.stderr);
  const data = JSON.parse(packed.stdout), entry = Array.isArray(data) ? data[0] : Object.values(data)[0];
  const inventory = path.join(root, 'inventory.json'), shim = path.join(root, 'mock-bin', 'npm');
  await write('mock-bin/npm', '#!/usr/bin/env node\nimport fs from "node:fs";\nprocess.stdout.write(fs.readFileSync(' + JSON.stringify(inventory) + ', "utf8"));\n');
  await fs.chmod(shim, 0o755);
  const run = () => spawnSync(process.execPath, ['scripts/check-supply-chain.mjs'], { cwd: root, encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: path.dirname(shim) + path.delimiter + process.env.PATH } });
  for (const shape of [[entry], { [entry.name]: entry }]) {
    await write('inventory.json', shape); const result = run(); assert.equal(result.status, 0, result.stderr);
  }
  await write('inventory.json', { [entry.name]: { ...entry, files: [...entry.files, { path: 'public/credential.pem' }] } });
  assert.match(run().stderr, /Unexpected published file.*credential.pem/);
  for (const shape of [[], {}, [entry, entry], { [entry.name]: { files: [null] } }]) {
    await write('inventory.json', shape); const result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /malformed single-package inventory/);
  }
});

test('release guard rejects added automatic installation hooks', async t => {
  const { pkg, write, run } = await fixture(t); pkg.scripts.postinstall = 'node arbitrary.js';
  await write('package.json', pkg);
  const result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Install hook postinstall is forbidden/);
});

test('release guard refuses an audit version different from the inventoried embedded dependency', async t => {
  const { root, write, run } = await fixture(t);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/vendor/manifest.json'), 'utf8'));
  manifest.components[0].bundledDependencies = { katex: '0.18.11' };
  await write('public/vendor/manifest.json', manifest);
  assert.match(run().stderr, /Vendor audit and embedded dependency versions differ: mermaid\/katex/);
  const lock = JSON.parse(await fs.readFile(path.join(root, 'security/vendor/package-lock.json'), 'utf8'));
  lock.packages['node_modules/katex'] = { version: '0.18.11', resolved: 'https://registry.npmjs.org/katex/-/katex-0.18.11.tgz', integrity: 'sha512-YQ==' };
  await write('security/vendor/package-lock.json', lock);
  const result = run(); assert.equal(result.status, 0, result.stderr);
});

test('shipped Mermaid contains the reviewed patched KaTeX, without the obsolete exception', async () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(await fs.readFile(new URL('public/vendor/manifest.json', root), 'utf8'));
  const component = manifest.components.find(component => component.name === 'mermaid');
  assert.equal(component.version, '12.2.0');
  assert.equal(component.bundledDependencies.katex, '0.18.11');
  const bundle = await fs.readFile(new URL('public/vendor/mermaid.min.js', root), 'utf8');
  // This literal is the KaTeX version export in the integrity-reviewed upstream build.
  assert.ok(bundle.includes('="0.18.11",'));
  assert.ok(!bundle.includes('"0.16.47"'));
  const exceptions = JSON.parse(await fs.readFile(new URL('security/vendor/advisory-exceptions.json', root), 'utf8'));
  assert.ok(!exceptions.some(exception => exception.url.endsWith('GHSA-238p-pmpm-9mq7')));
});

test('release guard rejects modified browser bytes and missing integrity attributes', async t => {
  const { write, run } = await fixture(t);
  await write('public/vendor/mermaid.min.js', 'tampered');
  let result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Unreviewed vendor asset/);
  await write('public/vendor/mermaid.min.js', 'fixture asset'); await write('public/index.html', 'no script integrity attributes');
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Missing versioned browser integrity/);
});

test('release guard rejects moving CI tags and non-registry dependency resolutions', async t => {
  const { write, run } = await fixture(t);
  await write('.github/workflows/ci.yml', 'uses: actions/checkout@v4');
  let result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Unpinned CI action/);
  await write('.github/workflows/ci.yml', 'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
  await write('package-lock.json', { packages: { '': { devDependencies: {} }, 'node_modules/unreviewed': { resolved: 'https://attacker.example/pkg.tgz', integrity: 'sha512-YQ==' } } });
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Untrusted dependency resolution/);
});
