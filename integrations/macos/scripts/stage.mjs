import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { root, run, nodeRuntime, NODE_VERSION, hashes } from './setup.mjs';

export async function stage(arch = process.arch) {
  const project = path.resolve(root, '../..');
  const desktopPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const corePackage = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
  run('npm', ['run', 'build'], { cwd: project });
  const runtime = await nodeRuntime(arch);
  // Explicit, reproducible native build for the sidecar Node ABI, never Electron's ABI.
  run(process.execPath, [path.join(root, 'node_modules/node-gyp/bin/node-gyp.js'), 'rebuild', '--directory', path.join(root, 'node_modules/node-pty'), '--arch=' + arch, '--target=' + NODE_VERSION, '--dist-url=https://nodejs.org/download/release'], { env: { ...process.env, npm_config_runtime: 'node' } });
  const output = path.join(root, 'dist/stage'); await fs.rm(output, { recursive: true, force: true }); await fs.mkdir(output, { recursive: true });
  // npm's explicit packlist is the same boundary used by core release guards.
  const { spawnSync } = await import('node:child_process');
  const packed = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: project, encoding: 'utf8' });
  if (packed.status) throw new Error('Could not inspect core package files.');
  const inventory = JSON.parse(packed.stdout), entry = Array.isArray(inventory) ? inventory[0] : Object.values(inventory)[0];
  for (const { path: relative } of entry.files) {
    const source = path.join(project, relative), target = path.join(output, 'core', relative);
    if (relative.includes('..') || (await fs.lstat(source)).isSymbolicLink()) throw new Error('Unsafe core package entry.');
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(source, target);
  }
  await fs.cp(runtime, path.join(output, 'node'), { recursive: true, verbatimSymlinks: true });
  await fs.rm(path.join(output, 'node/include'), { recursive: true, force: true });
  await fs.rm(path.join(output, 'node/share'), { recursive: true, force: true });
  await fs.mkdir(path.join(output, 'desktop-bin'), { recursive: true });
  const launcher = '#!/bin/sh\nbundle_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexec "$bundle_root/node/bin/node" "$bundle_root/core/bin/onboarder.js" "$@"\n';
  for (const command of ['onboarder', 'codebase-onboarder']) await fs.writeFile(path.join(output, 'desktop-bin', command), launcher, { mode: 0o755 });
  await fs.mkdir(path.join(output, 'backend/node_modules'), { recursive: true });
  for (const name of ['backend.mjs', 'policy.mjs', 'clones.mjs']) await fs.copyFile(path.join(root, 'src', name), path.join(output, 'backend', name));
  const ptyOutput = path.join(output, 'backend/node_modules/node-pty');
  await fs.mkdir(path.join(ptyOutput, 'build/Release'), { recursive: true });
  for (const file of ['package.json', 'LICENSE', 'lib', 'build/Release/pty.node', 'build/Release/spawn-helper']) await fs.cp(path.join(root, 'node_modules/node-pty', file), path.join(ptyOutput, file), { recursive: true });
  await build({ entryPoints: [path.join(root, 'src/terminal.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(output, 'desktop/terminal.js'), minify: true, legalComments: 'linked' });
  // The terminal CSS is desktop-only; the ordinary npm/browser package stays dependency-free.
  const html = path.join(output, 'core/public/index.html'); await fs.writeFile(html, (await fs.readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="/desktop/terminal.css"></head>'));
  for (const name of ['@xterm/xterm', '@xterm/addon-fit', 'node-pty']) {
    const target = path.join(output, 'licenses', name.replaceAll('/', '-') + '.txt'); await fs.mkdir(path.dirname(target), { recursive: true });
    const base = path.join(root, 'node_modules', name); const file = (await fs.readdir(base)).find(n => /^licen[cs]e(?:\.|$)/i.test(n)); if (file) await fs.copyFile(path.join(base, file), target);
  }
  await fs.writeFile(path.join(output, 'build-info.json'), JSON.stringify({ desktopVersion: desktopPackage.version, coreVersion: corePackage.version, arch, node: NODE_VERSION, nodeArchiveSha256: hashes[arch], stagingOnly: true, coreFileCount: entry.files.length }, null, 2));
  const files = {};
  async function inventoryFiles(dir) { for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await inventoryFiles(file); else if (entry.isFile()) files[path.relative(output, file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex'); } }
  await inventoryFiles(output); await fs.writeFile(path.join(root, 'dist/stage-sha256.json'), JSON.stringify(files, null, 2));
  console.log(`Staged ${arch} app with bundled Node ${NODE_VERSION} and ${entry.files.length} core files.`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await stage(process.argv[2] || process.arch);
