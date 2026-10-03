// Source checkouts need compilation; published npm installs already contain it.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(path.join(root, 'src')) && existsSync(path.join(root, 'tsconfig.json'))) {
  const compiler = path.join(root, 'node_modules/typescript/bin/tsc');
  if (!existsSync(compiler)) {
    console.error('Run npm ci to install the TypeScript development tools before starting from source.');
    process.exitCode = 1;
  } else {
    for (const args of [
      ['-p', 'tsconfig.json', '--noEmit'],
      ['-p', 'tsconfig.strict.json'],
      ['-p', 'tsconfig.json'],
    ]) {
      const result = spawnSync(process.execPath, [compiler, ...args], { cwd: root, stdio: 'inherit' });
      if (result.status !== 0) { process.exitCode = result.status || 1; break; }
    }
  }
}
