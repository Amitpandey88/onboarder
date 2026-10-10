import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import { verifiedDownload } from '../server/security/download.js';
import { isolatedEnvironment } from '../server/security/environment.js';
import { installHermes } from '../cli/chat/runtime.js';
import { gitleaksAsset, plansFor } from '../server/tools/install.js';
import { serveStatic } from '../server/static.js';

const content = 'reviewed executable bytes';
const artifact = { url: 'https://upstream.example/release', sha256: createHash('sha256').update(content).digest('hex'), maxBytes: 1024 };
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-supply-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('verified downloads accept reviewed bytes and pass a bounded, manual-redirect request', async () => {
  const bytes = await verifiedDownload(artifact, undefined, async (url, options) => {
    assert.equal(url, artifact.url);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(content);
  });
  assert.equal(bytes.toString(), content);
});

test('modified installer bytes cannot start a process', async () => {
  let executed = false;
  await assert.rejects(installHermes(new AbortController().signal, process.env, {
    artifact, download: async () => new Response('tampered script'),
    execute: async () => { executed = true; return 0; },
  }), /SHA-256 mismatch/);
  assert.equal(executed, false);
});

test('downloads reject empty bodies, HTTP errors and invalid integrity policies', async () => {
  await assert.rejects(verifiedDownload(artifact, undefined, async () => new Response('')), /empty/);
  await assert.rejects(verifiedDownload(artifact, undefined, async () => new Response('error', { status: 500 })), /HTTP 500/);
  await assert.rejects(verifiedDownload({ ...artifact, sha256: 'invalid' }), /integrity policy/);
  await assert.rejects(verifiedDownload({ ...artifact, maxBytes: Infinity }), /integrity policy/);
});

test('oversized declared and chunked downloads are stopped before buffering the full artifact', async () => {
  await assert.rejects(verifiedDownload(artifact, undefined, async () => new Response(content, { headers: { 'content-length': '2048' } })), /size limit/);
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1025)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(verifiedDownload(artifact, undefined, async () => new Response(stream)), /size limit/);
  assert.equal(cancelled, true);
});

test('redirects cannot escape HTTPS or the reviewed origin allowlist', async () => {
  for (const location of ['https://attacker.example/payload', 'http://upstream.example/payload', 'https://user:password@upstream.example/payload']) {
    let calls = 0;
    await assert.rejects(verifiedDownload(artifact, undefined, async () => { calls++; return new Response(null, { status: 302, headers: { location } }); }), /not trusted/);
    assert.equal(calls, 1);
  }
  await assert.rejects(verifiedDownload({ ...artifact, url: 'http://upstream.example/release' }), /not trusted/);
});

test('reviewed release-asset redirects work and redirect loops stop', async () => {
  let calls = 0;
  const data = await verifiedDownload({ ...artifact, redirectOrigins: ['https://assets.example'] }, undefined, async url => {
    calls++;
    return url === artifact.url ? new Response(null, { status: 302, headers: { location: 'https://assets.example/download' } }) : new Response(content);
  });
  assert.equal(data.toString(), content); assert.equal(calls, 2);
  await assert.rejects(verifiedDownload(artifact, undefined, async () => new Response(null, { status: 302, headers: { location: artifact.url } })), /Too many/);
});

test('already-cancelled downloads never issue a request', async () => {
  const controller = new AbortController(); controller.abort(); let fetched = false;
  await assert.rejects(verifiedDownload(artifact, controller.signal, async () => { fetched = true; return new Response(content); }), { name: 'AbortError' });
  assert.equal(fetched, false);
});

test('installer environments omit credentials, loader hooks, source overrides and relative PATH entries', () => {
  const env = isolatedEnvironment({ HOME: '/home/user', PATH: ['/usr/bin', '.', '', 'node_modules/.bin'].join(path.delimiter),
    OPENAI_API_KEY: 'secret', NPM_TOKEN: 'secret', GITHUB_TOKEN: 'secret', BASH_ENV: '/evil', NODE_OPTIONS: '--require=/evil',
    PYTHONPATH: '/evil', LD_PRELOAD: '/evil', HERMES_REPO_URL: 'https://evil', UV_INDEX_URL: 'https://evil',
    NPM_CONFIG_REGISTRY: 'https://evil', HERMES_HOME: '/home/user/hermes' }, ['HERMES_HOME']);
  assert.equal(env.HOME, '/home/user'); assert.equal(env.HERMES_HOME, '/home/user/hermes');
  assert.equal(env.PATH, '/usr/bin'); assert.equal(env.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
  assert.equal(env.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org/');
  for (const key of ['OPENAI_API_KEY', 'NPM_TOKEN', 'GITHUB_TOKEN', 'BASH_ENV', 'NODE_OPTIONS', 'PYTHONPATH', 'LD_PRELOAD', 'HERMES_REPO_URL', 'UV_INDEX_URL']) assert.equal(env[key], undefined, key);
});

test('Gitleaks supports only release architectures with reviewed hashes', () => {
  for (const [platform, arch] of [['linux', 'x64'], ['linux', 'arm64'], ['darwin', 'x64'], ['darwin', 'arm64'], ['win32', 'x64']]) {
    const asset = gitleaksAsset(platform, arch);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/); assert.match(asset.url, /v8\.24\.3/);
  }
  for (const [platform, arch] of [['linux', 'riscv64'], ['win32', 'arm64'], ['freebsd', 'x64']]) assert.throws(() => gitleaksAsset(platform, arch), /No verified/);
});

test('archive extraction selects only the executable, stages it privately and replaces target symlinks', { skip: process.platform === 'win32' }, async t => {
  const tmpDir = await temporary(t), binDir = path.join(tmpDir, 'bin');
  const staging = path.join(tmpDir, 'staging'); await fs.mkdir(staging); await fs.mkdir(binDir);
  const ctx = { platform: 'linux', arch: 'x64', tmpDir: staging, binDir };
  const plan = plansFor('gitleaks', 'linux').find(plan => plan.id === 'download');
  assert.deepEqual(plan.steps('/usr/bin/tar', ctx), [['/usr/bin/tar', ['-xf', path.join(staging, 'gitleaks.tar.gz'), '-C', staging, 'gitleaks']]]);
  const untouched = path.join(tmpDir, 'unrelated'); await fs.writeFile(untouched, 'keep');
  await fs.symlink(untouched, path.join(binDir, 'gitleaks'));
  await fs.writeFile(path.join(staging, 'gitleaks'), 'binary');
  assert.equal(plan.after(ctx), path.join(binDir, 'gitleaks'));
  assert.equal(await fs.readFile(untouched, 'utf8'), 'keep');
  assert.equal(await fs.readFile(path.join(binDir, 'gitleaks'), 'utf8'), 'binary');
  assert.equal((await fs.lstat(path.join(binDir, 'gitleaks'))).isSymbolicLink(), false);
  await fs.unlink(path.join(staging, 'gitleaks')); await fs.symlink(untouched, path.join(staging, 'gitleaks'));
  assert.throws(() => plan.after(ctx), /regular Gitleaks binary/);
  assert.deepEqual(await fs.readdir(binDir), ['gitleaks']);
});

test('Monaco rejects arbitrary module URLs and malformed selectors before importing scripts', async () => {
  const script = await fs.readFile(path.join(sourceRoot, 'public/vendor/monaco/worker-boot.js'), 'utf8');
  for (const selector of ['?https://attacker.example/code', '?module=vs%2Funknown', '?%ZZ', '?module=%2Fapp.js']) {
    let imported = false;
    assert.throws(() => vm.runInNewContext(script, { self: {}, location: { origin: 'https://local.example', search: selector }, URLSearchParams, importScripts: () => { imported = true; } }));
    assert.equal(imported, false);
  }
  for (const language of ['typescript/ts', 'json/json', 'css/css', 'html/html']) {
    const module = 'vs/language/' + language + 'Worker', imports = [], messages = [];
    const self = {};
    const importScripts = url => { imports.push(url); self.onmessage = event => messages.push(event.data); };
    vm.runInNewContext(script, { self, location: { origin: 'https://local.example', search: '?module=' + encodeURIComponent(module) + '&v=3' }, URLSearchParams, importScripts });
    assert.deepEqual(imports, ['https://local.example/vendor/monaco/vs/base/worker/workerMain.js']);
    assert.throws(() => self.onmessage({ data: 'https://attacker.example/payload' }), /Unsupported Monaco worker bootstrap/);
    self.onmessage({ data: 'vs/base/common/worker/simpleWorker' });
    assert.deepEqual(messages, ['vs/base/common/worker/simpleWorker']);
  }
});

test('static browser responses restrict scripts and framing while retaining Monaco compatibility', async () => {
  let headers, status, body;
  await serveStatic({ writeHead(code, value) { status = code; headers = value; }, end(value) { body = value; } }, '/', { publicDir: path.join(sourceRoot, 'public'), sharedDir: path.join(sourceRoot, 'shared') });
  assert.equal(status, 200); assert.ok(body.length);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.match(headers['content-security-policy'], /script-src 'self' 'unsafe-eval'/);
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
});

test('analyzer fallbacks run exact npm packages away from repository configuration without server credentials', { skip: process.platform === 'win32' }, async t => {
  const directory = await temporary(t), repo = path.join(directory, 'repository'), output = path.join(directory, 'observed.json');
  await fs.mkdir(repo); await fs.writeFile(path.join(repo, '.npmrc'), 'registry=https://attacker.example\nignore-scripts=false\n');
  await fs.writeFile(path.join(directory, 'npx'), `#!${process.execPath}\nimport fs from 'node:fs';fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),env:process.env}));console.log('{"files":[]}');`, { mode: 0o700 });
  await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  const script = `import { runExternalAnalysis } from ${JSON.stringify(path.join(sourceRoot, 'server/tools/scan.js'))}; const result=await runExternalAnalysis(${JSON.stringify(repo)},{tools:['knip']});if(!result.passes[0].ok)throw Error(JSON.stringify(result));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: repo, env: { ...process.env, HOME: directory, PATH: directory, OPENAI_API_KEY: 'fixture-secret', NPM_TOKEN: 'fixture-secret', BASH_ENV: '/evil' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(await fs.readFile(output, 'utf8'));
  assert.ok(observed.args.includes('--package=knip@6.41.0')); assert.ok(observed.args.includes('--ignore-scripts'));
  assert.ok(observed.args.includes('--registry=https://registry.npmjs.org/'));
  assert.notEqual(observed.cwd, repo); assert.equal(await fs.access(observed.cwd).then(() => true).catch(() => false), false);
  for (const name of ['OPENAI_API_KEY', 'NPM_TOKEN', 'BASH_ENV']) assert.equal(observed.env[name], undefined);
});


test('real npm accepts isolated private configuration paths without executing lifecycle hooks', { skip: process.platform === 'win32' }, async t => {
  const directory = await temporary(t);
  const result = spawnSync('npm', ['config', 'get', 'ignore-scripts'], { cwd: directory, env: isolatedEnvironment(process.env, [], directory), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'true');
});
