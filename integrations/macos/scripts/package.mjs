import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, run } from './setup.mjs';
import { stage } from './stage.mjs';
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const packageDirectory = path.join(root, pkg.build.directories.output);
const release = process.argv.includes('--release');
const arches = process.argv.includes('x64') ? ['x64'] : ['arm64'];
if (release && !process.env.CSC_LINK && !process.env.CSC_NAME) throw new Error('Release builds require a Developer ID identity through CSC_NAME or CSC_LINK.');
if (release && !process.env.APPLE_KEYCHAIN_PROFILE && !process.env.APPLE_API_KEY && !process.env.APPLE_APP_SPECIFIC_PASSWORD) throw new Error('Release builds require notarization credentials.');
for (const arch of arches) {
  await stage(arch);
  run(process.execPath, ['node_modules/electron-builder/cli.js', '--mac', '--' + arch, '--publish', 'never', ...(release ? ['-c.forceCodeSigning=true', '-c.mac.notarize=true'] : ['-c.mac.identity=-', '-c.mac.hardenedRuntime=false', '-c.mac.notarize=false', '-c.artifactName=Onboarder-${version}-DEVELOPMENT-${arch}.${ext}'])], { env: { ...process.env, ...(release ? {} : { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }) } });
  const app = path.join(packageDirectory, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Onboarder.app');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  if (release) { run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app]); run('/usr/bin/xcrun', ['stapler', 'validate', app]); }
}
const output = packageDirectory; const checksums = [];
for (const file of await fs.readdir(output)) if (/\.(?:dmg|zip)$/.test(file)) checksums.push(createHash('sha256').update(await fs.readFile(path.join(output, file))).digest('hex') + '  ' + file);
await fs.writeFile(path.join(output, 'SHA256SUMS'), checksums.join('\n') + '\n');
await fs.writeFile(path.join(output, 'BUILD-STATUS.json'), JSON.stringify({ version: pkg.version, architectures: arches, signedForDistribution: release, notarized: release, nativeIntelTested: false, note: release ? 'Verify native Intel testing separately before publishing.' : 'Ad-hoc signed development artifacts. Not notarized; public development preview only, not a signed distribution release.' }, null, 2));
