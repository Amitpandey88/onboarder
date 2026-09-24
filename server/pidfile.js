// Who is serving? One small file next to the config: `onboarder.pid`.
//
// The auto-open flow starts the server detached from the terminal that asked
// for it, which makes "is it running?" a question ps(1) answers badly. The
// pidfile is the answer the CLI can act on: `onboarder status` reads it,
// `onboarder stop` kills it, and a busy-port error can say "that is us,
// pid N" instead of shrugging. Writes are best-effort — a read-only config
// dir must never stop the server from booting.

import fs from 'node:fs';
import path from 'node:path';

export function pidPath(configFile) {
  return path.join(path.dirname(path.resolve(configFile)), 'onboarder.pid');
}

// The pid in the file, or null when there is no file or it is garbage. A
// garbage file is treated as absent rather than parsed charitably — it was
// either written by us (one integer) or it is not ours to interpret.
export function readPidFile(configFile) {
  try {
    const pid = Number(fs.readFileSync(pidPath(configFile), 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

// Signal 0 probes existence without delivering anything. EPERM means the
// process exists but belongs to someone else — still alive, just not ours
// to signal.
export function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

export function writePidFile(configFile) {
  fs.writeFileSync(pidPath(configFile), String(process.pid) + '\n', { mode: 0o600 });
}

// Remove the file only when it still points at `pid` — a second server that
// rewrote the file must not lose its record because the first one exited.
export function removePidFile(configFile, pid = process.pid) {
  if (readPidFile(configFile) === pid) fs.rmSync(pidPath(configFile), { force: true });
}
