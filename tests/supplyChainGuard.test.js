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
  const pkg = { name: 'onboarder-guard-fixture', version: '1.0.0', type: 'module', files: ['bin', 'public', 'server', 'docs', 'SECURITY.md'], scripts: {}, devDependencies: {} };
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
  for (const file of ['bin/onboarder.js', 'public/app.js', 'server/security/download.js', 'docs/SUPPLY_CHAIN_SECURITY.md', 'SECURITY.md']) await write(file, 'fixture');
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

test('release guard rejects added automatic installation hooks', async t => {
  const { pkg, write, run } = await fixture(t); pkg.scripts.postinstall = 'node arbitrary.js';
  await write('package.json', pkg);
  const result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Install hook postinstall is forbidden/);
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
