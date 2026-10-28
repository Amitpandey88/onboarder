import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

/** Own exactly one process group; never address another Onboarder instance. */
export class BackendClient {
  constructor(resources, root, env, onEvent) {
    Object.assign(this, { resources, root, env, onEvent }); this.pending = new Map(); this.stopping = false; this.active = false;
  }
  async start() {
    this.token = randomBytes(32).toString('hex'); this.stopping = false;
    const child = this.child = spawn(path.join(this.resources, 'node/bin/node'), [path.join(this.resources, 'backend/backend.mjs')], {
      cwd: this.resources, env: this.env, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('The project service did not start.')); this.stop(); }, 20000);
      const fail = error => { clearTimeout(timeout); reject(error); };
      child.once('error', fail);
      child.on('message', message => {
        if (message.type === 'ready') { clearTimeout(timeout); this.port = message.port; child.removeListener('error', fail); resolve(); }
        else if (message.requestId) {
          const request = this.pending.get(message.requestId);
          if (request) { this.pending.delete(message.requestId); clearTimeout(request.timeout); message.error ? request.reject(new Error(message.error)) : request.resolve(message.result); }
        } else { if (message.type === 'activity') this.active = message.active; this.onEvent(message); }
      });
      child.once('exit', () => {
        clearTimeout(timeout); this.port = null;
        for (const p of this.pending.values()) { clearTimeout(p.timeout); p.reject(new Error('The project service stopped.')); } this.pending.clear();
        if (!this.stopping) { reject(new Error('The project service stopped.')); this.onEvent({ type: 'backend-down' }); }
      });
      child.send({ type: 'init', token: this.token, root: this.root, resources: this.resources });
    });
  }
  request(action, input) {
    if (!this.child?.connected) return Promise.reject(new Error('Reload the workspace to reconnect.'));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(requestId); reject(new Error('The operation timed out.')); }, action === 'clone' ? 190000 : 15000);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.child.send({ type: 'request', requestId, action, input }, error => { if (error) { this.pending.delete(requestId); clearTimeout(timeout); reject(error); } });
    });
  }
  stop() {
    this.stopping = true;
    const child = this.child; if (!child?.pid) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1800); timer.unref();
    child.once('exit', () => { clearTimeout(timer); /* PTYs have separate process groups and are cleaned by the backend. */ });
  }
}
