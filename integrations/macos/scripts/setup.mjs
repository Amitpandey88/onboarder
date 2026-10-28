import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const NODE_VERSION = '24.20.0';
export const hashes = { arm64: '40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8', x64: '9e5b2644cf107befb6aefca676b96d3296bc10138096f022ed378d6233ed81f4' };
export function run(command, args, options = {}) { const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options }); if (result.error) throw result.error; if (result.status) throw new Error(`${path.basename(command)} failed (${result.status}).`); }
export async function nodeRuntime(arch) {
  if (!hashes[arch]) throw new Error('Choose arm64 or x64.');
  const cache = path.join(root, '.cache'); await fs.mkdir(cache, { recursive: true });
  const directory = path.join(cache, `node-v${NODE_VERSION}-darwin-${arch}`);
  const archive = path.join(cache, path.basename(directory) + '.tar.gz');
  let bytes = await fs.readFile(archive).catch(() => null);
  if (!bytes) {
    const response = await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/${path.basename(archive)}`, { signal: AbortSignal.timeout(120000), redirect: 'error' });
    if (!response.ok) throw new Error('Could not download the pinned Node runtime.');
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > 100 * 1024 * 1024) throw new Error('Node archive exceeds its download limit.'); chunks.push(chunk); }
    bytes = Buffer.concat(chunks);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== hashes[arch]) throw new Error('Node runtime integrity verification failed.');
  await fs.writeFile(archive, bytes);
  await fs.rm(directory, { recursive: true, force: true });
  run('/usr/bin/tar', ['-xzf', archive, '-C', cache]);
  return directory;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run(process.execPath, ['node_modules/electron/install.js']);
  await nodeRuntime(process.arch);
  console.log('Verified Electron and Node runtime setup complete.');
}
