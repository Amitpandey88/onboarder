// Optional real Hermes + HTTP integration check using a loopback model fixture.
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HermesWeb } from '../server/hermesChat.js';
import { createRouter } from '../server/router.js';
import { setupAgent } from '../cli/agent/config.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-web-live-'));
let calls = 0, contextSeen = false;
const model = http.createServer(async (req, res) => {
  if (req.method === 'GET') { res.end(JSON.stringify({ data: [{ id: 'web-fixture' }] })); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  if (req.url === '/api/show') { res.end(JSON.stringify({ model_info: { 'general.architecture': 'llama', 'llama.context_length': 128000 } })); return; }
  calls++;
  assert.ok(!body.tools?.length, 'Web explanations must expose zero machine tools');
  contextSeen ||= JSON.stringify(body.messages).includes('const webFixture = 42');
  const message = { role: 'assistant', content: 'HERMES_WEB_STREAM_OK' };
  if (body.stream) {
    res.setHeader('content-type', 'text/event-stream');
    res.write('data: ' + JSON.stringify({ id: 'web', choices: [{ index: 0, delta: { content: message.content }, finish_reason: null }] }) + '\n\n');
    res.end('data: ' + JSON.stringify({ id: 'web', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  } else {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'web', object: 'chat.completion', model: 'web-fixture', choices: [{ index: 0, message, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
  }
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const home = path.join(temp, 'agent');
const env = { ...process.env, ONBOARDER_AI_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`, ONBOARDER_AI_MODEL: 'web-fixture', ONBOARDER_AI_API_KEY: 'loopback-only' };
let web;
try {
  await setupAgent(home, env);
  web = http.createServer(createRouter({ hermes: new HermesWeb(home, env) }));
  await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${web.address().port}`;
  const status = await (await fetch(url + '/api/hermes')).json();
  assert.equal(status.available, true); assert.equal(status.model, 'web-fixture');
  const response = await fetch(url + '/api/explain', { method: 'POST', body: JSON.stringify({ connection: 'hermes', purpose: 'diagram', messages: [{ role: 'system', content: 'Explain only the supplied source.' }, { role: 'user', content: 'const webFixture = 42;' }] }) });
  const stream = await response.text();
  assert.equal(response.status, 200); assert.ok(!stream.includes('"error"'), stream);
  assert.match(stream, /HERMES_WEB_STREAM_OK/); assert.ok(stream.endsWith('data: [DONE]\n\n'));
  assert.ok(contextSeen && calls > 0); assert.equal(stream.split('HERMES_WEB_STREAM_OK').length - 1, 1);
  console.log('Real Hermes web connection verified: profile login resolution, supplied source, zero tools, streamed answer, no duplicate completion.');
} finally {
  if (web) { web.closeAllConnections(); await new Promise(resolve => web.close(resolve)); }
  model.closeAllConnections(); await new Promise(resolve => model.close(resolve));
  const { runtimePaths } = await import('../cli/agent/config.js');
  await fs.rm(runtimePaths(home, env).profile, { recursive: true, force: true });
  await fs.rm(temp, { recursive: true, force: true });
}
