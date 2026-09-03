import { Worker } from 'node:worker_threads';
import os from 'node:os';

export function createPool(workerPath, size) {
  const poolSize = size || Math.max(1, Math.min(8, os.availableParallelism?.() || os.cpus().length || 4));
  const workers = [];
  const idle = [];
  const queue = [];

  for (let i = 0; i < poolSize; i++) {
    const worker = new Worker(workerPath);
    workers.push(worker);
    idle.push(worker);
  }

  function runNext() {
    if (queue.length === 0 || idle.length === 0) return;
    const worker = idle.pop();
    const { data, resolve, reject } = queue.shift();

    worker.once('message', (msg) => {
      idle.push(worker);
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg.result);
      }
      runNext();
    });

    worker.once('error', (err) => {
      idle.push(worker);
      reject(err);
      runNext();
    });

    worker.postMessage(data);
  }

  return {
    exec(data) {
      return new Promise((resolve, reject) => {
        queue.push({ data, resolve, reject });
        runNext();
      });
    },
    async drain() {
      // wait until queue is empty and all workers are idle
      while (queue.length > 0 || idle.length < poolSize) {
        await new Promise(r => setTimeout(r, 50));
      }
    },
    terminate() {
      for (const w of workers) w.terminate();
    }
  };
}
