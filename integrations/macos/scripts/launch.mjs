import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { root } from './setup.mjs';
const staged = JSON.parse(await fs.readFile(path.join(root, 'dist/stage/build-info.json'), 'utf8').catch(() => { throw new Error('Run npm run setup and npm run stage before starting the desktop preview.'); }));
if (staged.arch !== process.arch) throw new Error('The staged runtime targets a different Mac architecture. Run npm run stage to prepare this Mac.');
const child = spawn(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), ['.', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
