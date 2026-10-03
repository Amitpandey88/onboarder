// Rebuild TypeScript and restart the server only after a successful compilation.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const entry = fileURLToPath(new URL('../server/index.js', import.meta.url));
let server = null;
let stopping = false;
let restarting = Promise.resolve();

async function stopServer() {
  const child = server;
  server = null;
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 1500);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

const watcher = spawn(process.execPath, [compiler, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], {
  cwd: root, stdio: ['ignore', 'pipe', 'inherit'],
});
let buffer = '';
watcher.stdout.setEncoding('utf8');
watcher.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!/Found 0 errors\. Watching for file changes\./.test(line)) continue;
    restarting = restarting.then(async () => {
      await stopServer();
      if (stopping) return;
      server = spawn(process.execPath, ['--enable-source-maps', entry], { cwd: root, stdio: 'inherit' });
      server.on('error', (error) => console.error(error.message));
    });
  }
});
watcher.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
watcher.on('exit', async (code) => {
  stopping = true;
  await restarting;
  await stopServer();
  process.exitCode = code || 0;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { stopping = true; watcher.kill('SIGTERM'); });
}
