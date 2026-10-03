// Optional live-runtime integration check. The model is a loopback fixture:
// no provider account, tokens, GitHub mutations, or external inference needed.
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAgent } from '../cli/agent/runner.js';
import { ChatController } from '../cli/chat/controller.js';
import { ChatRenderer } from '../cli/chat/render.js';
import { ChatSources } from '../cli/chat/source.js';
import { HermesModels } from '../cli/chat/models.js';
import { profileDisplay } from '../cli/chat/profile.js';
import { runProcess } from '../cli/agent/process.js';
import { runtimePaths, setupAgent, hermesEnvironment, hermesBinary } from '../cli/agent/config.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-hermes-e2e-'));
const home = path.join(temp, 'agent'), root = path.join(temp, 'repo');
await fs.mkdir(root);
await fs.writeFile(path.join(root, 'hello.ts'), 'export const hello = "hello";\n');
await runProcess('git', ['init', '-b', 'main', root]);
await runProcess('git', ['-C', root, 'add', 'hello.ts']);
assert.equal((await runProcess('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture'])).code, 0);
const remote = path.join(temp, 'remote.git');
assert.equal((await runProcess('git', ['clone', '--bare', root, remote])).code, 0);
let calls = 0, contextSeen = false;
const conversations = [];
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET') {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [{ id: 'onboarder-fixture', object: 'model' }] })); return;
    }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (req.url === '/api/show') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ model_info: { 'general.architecture': 'llama', 'llama.context_length': 128000 } })); return; }
    calls++;
    // Hermes may generate a session title after the answer with no tools.
    if (!body.tools?.length) {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'fixture-title', object: 'chat.completion', model: 'onboarder-fixture', choices: [{ index: 0, message: { role: 'assistant', content: 'Onboarder fixture' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })); return;
    }
    console.error('Fixture request:', req.url, 'tools:', body.tools.length);
    const context = (body.messages || []).find(m => m.role === 'tool' && String(m.content).includes('sourceRoot'));
    contextSeen ||= Boolean(context);
    const tools = body.tools || [];
    conversations.push(body.messages);
    assert.ok(tools.length > 10, 'Hermes must expose Onboarder tools');
    assert.ok(tools.every(t => t.function?.name?.startsWith('mcp__onboarder__')), 'Only the dedicated MCP toolset may be exposed');
    const name = tools.find(t => t.function.name.endsWith('onboarder_agent_context'))?.function.name;
    assert.ok(name, 'Context tool discovered');
    const message = context ? { role: 'assistant', content: 'HERMES_ONBOARDER_TOOL_LOOP_OK' }
      : { role: 'assistant', content: null, tool_calls: [{ id: 'fixture-context', type: 'function', function: { name, arguments: '{}' } }] };
    const finish = context ? 'stop' : 'tool_calls';
    if (body.stream) {
      res.setHeader('content-type', 'text/event-stream');
      const delta = context ? { content: message.content } : { tool_calls: [{ index: 0, ...message.tool_calls[0] }] };
      const frame = (value) => res.write('data: ' + JSON.stringify({ id: 'fixture-' + calls, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'onboarder-fixture', ...value }) + '\n\n');
      frame({ choices: [{ index: 0, delta, finish_reason: null }] });
      frame({ choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } });
      res.end('data: [DONE]\n\n');
    } else {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'fixture-' + calls, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'onboarder-fixture', choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }));
    }
  } catch (e) { console.error('Fixture rejected request:', String(e)); res.statusCode = 500; res.end(String(e)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const env = { ...process.env, ONBOARDER_AI_BASE_URL: `http://127.0.0.1:${port}/v1`, ONBOARDER_AI_MODEL: 'onboarder-fixture', ONBOARDER_AI_API_KEY: 'fixture-local-only', GITHUB_TOKEN: '', GH_TOKEN: '' };
const profile = runtimePaths(home, env).profile;
try {
  // Exercise configuration saved by Hermes' own wizard/commands, not only the
  // initial JSON-as-YAML file generated by Onboarder.
  await setupAgent(home, env);
  const configFile = path.join(profile, 'config.yaml');
  const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
  config.custom_providers = [{ name: 'Onboarder fixture', base_url: env.ONBOARDER_AI_BASE_URL, api_key: env.ONBOARDER_AI_API_KEY,
    models: ['onboarder-fixture'] }];
  await fs.writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  const picker = new HermesModels(home, env);
  const catalog = await picker.catalog(new AbortController().signal);
  const provider = catalog.find(p => p.models.includes('onboarder-fixture') && p.id.startsWith('custom:'));
  assert.ok(provider, 'Hermes picker exposes the configured loopback provider');
  const selection = await picker.select('onboarder-fixture', provider.id, new AbortController().signal);
  assert.equal(selection.model, 'onboarder-fixture');
  assert.equal((await profileDisplay(home, env)).model, 'onboarder-fixture');
  console.error('Native Hermes model catalog, selection and persistence verified.');
  const configure = await runProcess(hermesBinary(env), ['config', 'set', 'model.default', 'onboarder-fixture'], { env: hermesEnvironment(home, env), timeoutMs: 30000 });
  assert.equal(configure.code, 0, configure.stderr);
  const events = [];
  const result = await runAgent({ mode: 'ask', root, task: 'Call the context tool and report the fixture result.', timeoutSeconds: 60, maxTurns: 4 }, { home, env, onEvent: e => { events.push(e); console.error(e.type, e.name || e.subtype || ''); } });
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.status, 'completed');
  assert.equal(result.answer.trim(), 'HERMES_ONBOARDER_TOOL_LOOP_OK');
  assert.ok(contextSeen && calls >= 2, 'Model saw a real MCP context result');
  assert.ok(events.some(e => e.type === 'tool_use'));
  const audit = await fs.readFile(result.auditFile, 'utf8');
  assert.match(audit, /onboarder_agent_context/);
  const transcript = [];
  const renderer = new ChatRenderer(text => transcript.push(text));
  const chat = new ChatController({ root: await fs.realpath(root), mode: 'ask', checks: false, github: false, timeout: 60, maxTurns: 4 }, {
    runner: { home, env }, output: event => renderer.handle(event),
    sources: new ChatSources(home, { env, execute: (command, args, options) => runProcess(command, [
      ...(args.includes('clone') || args.includes('pull') ? ['-c', `url.file://${remote}.insteadOf=https://github.com/fixture/repo.git`] : []), ...args,
    ], options) }),
  });
  await chat.accept('https://github.com/fixture/repo');
  assert.equal(chat.settings.sourceUrl, 'https://github.com/fixture/repo');
  assert.notEqual(chat.settings.root, await fs.realpath(root));
  await chat.accept('CHAT_FIRST_TURN: call context and explain this repository.');
  assert.equal(chat.lastResult.status, 'completed'); const firstRun = chat.record.lastRun;
  await chat.accept('CHAT_FOLLOWUP_TURN: expand your previous explanation.');
  assert.equal(chat.lastResult.status, 'completed'); assert.notEqual(chat.record.lastRun, firstRun);
  const resumedMessages = conversations.at(-1);
  assert.ok(resumedMessages.some(m => String(m.content).includes('CHAT_FIRST_TURN')), 'Hermes restored the previous chat turn');
  assert.ok(resumedMessages.some(m => String(m.content).includes('CHAT_FOLLOWUP_TURN')), 'Hermes received the follow-up');
  assert.equal(transcript.filter(line => line.trim() === 'HERMES_ONBOARDER_TOOL_LOOP_OK').length, 2, 'Each answer rendered exactly once');
  const id = chat.record.id;
  await chat.accept('/new'); await chat.accept('/resume ' + id);
  assert.equal(chat.record.id, id); assert.ok(chat.record.lastRun);
  console.log('Verified installed Hermes, JSONL streaming, MCP discovery/call, clone-then-ask, chat follow-up context, saved conversation resume, and answers rendered once.');
} finally {
  await new Promise(resolve => server.close(resolve));
  await fs.rm(profile, { recursive: true, force: true });
  await fs.rm(temp, { recursive: true, force: true });
}
