import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractFile } from '@electron/asar';
import { root } from './setup.mjs';

// Compare the retained applications with the reviewed source, without extracting
// or executing repository code. The terminal CSS link is the only HTML change.
const project = path.resolve(root, '../..');
const packed = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: project, encoding: 'utf8' });
if (packed.status) throw new Error('Could not inspect the core package inventory.');
const inventory = JSON.parse(packed.stdout);
const entry = Array.isArray(inventory) ? inventory[0] : Object.values(inventory)[0];
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const report = { version: pkg.version, comparisons: 0, mismatches: [] };
for (const directory of ['mac-arm64', 'mac'].filter(dir => !process.argv.includes('--arm64') || dir === 'mac-arm64')) {
  if (!await fs.stat(path.join(root, pkg.build.directories.output, directory)).catch(() => null)) continue;
  const resources = path.join(root, pkg.build.directories.output, directory, 'Onboarder.app/Contents/Resources');
  for (const { path: relative } of entry.files) {
    let expected = await fs.readFile(path.join(project, relative));
    if (relative === 'public/index.html') expected = Buffer.from(expected.toString().replace('</head>', '<link rel="stylesheet" href="/desktop/terminal.css"></head>'));
    const actual = await fs.readFile(path.join(resources, 'workspace/core', relative));
    report.comparisons++; if (!actual.equals(expected)) report.mismatches.push(directory + '/' + relative);
  }
  for (const file of pkg.build.files.filter(file => file.startsWith('src/'))) {
    report.comparisons++;
    if (!extractFile(path.join(resources, 'app.asar'), file).equals(await fs.readFile(path.join(root, file)))) report.mismatches.push(directory + '/' + file);
  }
  for (const file of ['backend.mjs', 'policy.mjs', 'clones.mjs']) {
    report.comparisons++;
    if (!(await fs.readFile(path.join(resources, 'workspace/backend', file))).equals(await fs.readFile(path.join(root, 'src', file)))) report.mismatches.push(directory + '/backend/' + file);
  }
}
await fs.mkdir(path.join(root, 'dist/qa'), { recursive: true });
if (!report.comparisons) throw new Error('No packaged application was found to verify.');
await fs.writeFile(path.join(root, `dist/qa/source-comparison-${pkg.version}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.mismatches.length) process.exitCode = 1;
