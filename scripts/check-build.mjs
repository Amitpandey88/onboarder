// Verify that the distributable JavaScript and declarations match src/.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = path.join(root, 'node_modules/typescript/bin/tsc');
const temporary = await mkdtemp(path.join(tmpdir(), 'onboarder-build-'));
try {
  const compiled = spawnSync(process.execPath, [compiler, '-p', path.join(root, 'tsconfig.json'), '--outDir', temporary], { cwd: root, stdio: 'inherit' });
  if (compiled.status !== 0) throw new Error('TypeScript compilation failed.');
  const stale = [];
  let checked = 0;
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await inspect(file); continue; }
      if (!entry.name.endsWith('.js') && !entry.name.endsWith('.d.ts')) continue;
      const relative = path.relative(temporary, file);
      const expected = await readFile(file, 'utf8');
      const actual = await readFile(path.join(root, relative), 'utf8').catch(() => null);
      checked++;
      if (actual !== expected) stale.push(relative);
    }
  }
  await inspect(temporary);
  if (stale.length) throw new Error(`Run npm run build; generated files differ:\n${stale.join('\n')}`);
  console.log(`Verified ${checked} generated JavaScript and declaration files.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
