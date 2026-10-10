// Select only shipped language workers. Their AMD modules are loaded through
// Monaco's standard worker handshake, which is required for diagnostics.
const allowedWorkers = new Set([
  'vs/language/typescript/tsWorker',
  'vs/language/json/jsonWorker',
  'vs/language/css/cssWorker',
  'vs/language/html/htmlWorker',
]);
const mod = new URLSearchParams(location.search).get('module') || decodeURIComponent(location.search.slice(1));
if (!allowedWorkers.has(mod)) throw new Error('Unsupported Monaco worker module.');
self.MonacoEnvironment = { baseUrl: location.origin + '/vendor/monaco/' };
importScripts(location.origin + '/vendor/monaco/vs/base/worker/workerMain.js');
const initialize = self.onmessage;
self.onmessage = event => {
  if (event.data !== 'vs/base/common/worker/simpleWorker') throw new Error('Unsupported Monaco worker bootstrap.');
  self.onmessage = initialize;
  initialize(event);
};
