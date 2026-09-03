// Onboarder's local server: where it lives on disk, and how it starts.
//
// The work is elsewhere. `router.js` holds the route table and the two request
// gates; each endpoint has its own module beside it (`apiScan`, `apiFile`,
// `apiDocs`, `llmProxy`); `static.js` serves the page and the shared engine;
// `sessions.js` remembers which directory a scan came from. What is left here is
// the part that has to know about the filesystem it was installed into, and the
// difference between being imported and being run.
//
// It binds 127.0.0.1 and nothing else. There is no authentication anywhere in
// this server, so "only this machine can reach it" is not a default — it is the
// security model, and the guards in `router.js` exist to keep a browser from
// being used to get around it.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRouter } from './router.js';
import { installExitCleanup } from './sessions.js';
import { createLogger } from './logger.js';

const logger = createLogger();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');

const CONFIG = {
  projectRoot: PROJECT_ROOT,
  publicDir: path.join(PROJECT_ROOT, 'public'),
  // Served at `/shared/`, which is what lets the browser and the server import
  // the same analyzer. See `static.js` for why that mapping constrains the code.
  sharedDir: path.join(PROJECT_ROOT, 'shared'),
};

const PORT = Number(process.env.PORT) || 4310;
const HOST = '127.0.0.1'; // local tool — never answer the network

// The tests want a server they can put on an ephemeral port; `npm start` wants
// one on 4310. Same router either way.
export function createServer(config = CONFIG) {
    const router = createRouter(config);
  return http.createServer((req, res) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.http({ method: req.method, path: req.url, status: res.statusCode, ms: Date.now() - start });
    });
    router(req, res);
  });
}

// `node server/index.js` listens. Importing this module — which the tests do, to
// drive the real router — does not, and does not install signal handlers either:
// a test runner should keep its own Ctrl-C.
const THIS_FILE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
  installExitCleanup();
  createServer().listen(PORT, HOST, () => {
    console.log('');
    console.log('  Onboarder is up.');
    console.log('  → http://localhost:' + PORT);
    console.log('');
  });
}
