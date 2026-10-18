import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { handle, createDispatcher, serveMcp } from '../server/mcp/server.js';
import { PACKAGE_VERSION, PROTOCOL_VERSION } from '../server/mcp/protocol.js';
import { repositoryResourceUri } from '../server/mcp/context.js';
import { callTool, toolDefinitions } from '../server/mcp/tools.js';
import { clearAnalysisCache, analyzeRepository } from '../server/mcp/analysis.js';
import { createHttpTransport } from '../server/mcp/http.js';
import { createAgentDispatcher } from '../cli/agent/mcp.js';
import { McpRunner } from '../server/mcp/runner.js';

let temporary, root, other;
const message = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const rpc = (method, params) => handle(message(method, params));
before(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-mcp-advanced-'));
  root = path.join(temporary, 'repo with spaces'); other = path.join(temporary, 'other');
  for (const dir of [root, other]) {
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src/main.ts'), 'import { help } from "./helper.ts";\nexport const result = help();\n');
    await fs.writeFile(path.join(dir, 'src/helper.ts'), 'export function help() { return 42; }\n');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: path.basename(dir), main: 'src/main.ts' }));
  }
  await fs.writeFile(path.join(temporary, 'outside.txt'), 'outside private fixture');
  await fs.symlink(path.join(temporary, 'outside.txt'), path.join(root, 'outside.txt'));
  await fs.symlink(path.join(other, 'src'), path.join(root, 'linked'));
  await fs.symlink(path.join(root, 'src/helper.ts'), path.join(root, 'inside-link.ts'));
  await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([1, 0, 2]));
  await fs.writeFile(path.join(root, '.env'), 'PRIVATE_FIXTURE=not-real');
});
beforeEach(clearAnalysisCache);
after(async () => { clearAnalysisCache(); await fs.rm(temporary, { force: true, recursive: true }); });

test('MCP negotiates supported versions, advertises real capabilities and package version', async () => {
  for (const version of ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', 'unknown-version']) {
    const reply = await rpc('initialize', { protocolVersion: version, capabilities: {}, clientInfo: { name: 'fixture', version: '1' } });
    assert.equal(reply.result.protocolVersion, version === 'unknown-version' ? PROTOCOL_VERSION : version);
    assert.equal(reply.result.serverInfo.version, PACKAGE_VERSION);
    assert.equal(reply.result.capabilities.resources.subscribe, false);
    assert.ok(reply.result.instructions);
    assert.equal(reply.result.serverInfo.instructions, undefined);
  }
  assert.equal((await rpc('initialize', {})).error.code, -32602);
  assert.equal((await handle(message('ping', {}, null))).id, null);
  assert.equal((await handle({ ...message('ping'), id: {} })).error.code, -32600);
  for (const method of ['resources/list', 'resources/templates/list', 'prompts/list', 'tools/list', 'ping']) {
    assert.equal(await handle({ jsonrpc: '2.0', method }), null, method + ' notification stays silent');
    assert.equal((await rpc(method, { cursor: 'not-a-page' })).error?.code, method === 'ping' ? undefined : -32602);
  }
});

test('tool arguments reject wrong types, unknown keys, enums and ranges without executing engines', async () => {
  for (const [name, args] of [
    ['onboarder_list_files', { path: root, limit: '5' }],
    ['onboarder_list_files', { path: root, limit: 0 }],
    ['onboarder_list_files', { path: root, limit: 201 }],
    ['onboarder_list_files', { path: root, limit: 1.5 }],
    ['onboarder_scan', { path: root, force: 'false' }],
    ['onboarder_search', { path: root }],
    ['onboarder_search', { path: root, query: 'help', surprise: true }],
    ['onboarder_deep_analysis', { path: root, tools: ['unknown-engine'] }],
    ['onboarder_deep_analysis', { path: root, kinds: [false] }],
    ['onboarder_overview', []],
    ['onboarder_analyzer_status', null],
  ]) {
    const reply = await rpc('tools/call', { name, arguments: args });
    assert.equal(reply.result.isError, true, name + JSON.stringify(args));
    assert.ok(reply.result.content[0].text);
  }
  for (const tool of toolDefinitions()) {
    assert.ok(tool.title); assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, tool.name !== 'onboarder_deep_analysis');
  }
});

test('line-range reads preserve source positions and refuse symlink and binary boundaries', async () => {
  const part = await callTool('onboarder_read_file', { path: root, file: 'src/main.ts', startLine: 2, endLine: 2 });
  assert.equal(part.text, 'export const result = help();');
  assert.equal(part.startLine, 2); assert.equal(part.totalLines, 2); assert.equal(part.truncated, true);
  for (const file of ['outside.txt', 'linked/helper.ts', 'inside-link.ts', 'binary.bin', '../outside.txt', '/etc/passwd']) {
    await assert.rejects(callTool('onboarder_read_file', { path: root, file }), /symbolic link|outside|binary/, file);
  }
  await assert.rejects(callTool('onboarder_read_file', { path: root, file: 'src/main.ts', startLine: 3 }), /line range/);
  await assert.rejects(callTool('onboarder_read_file', { path: root, file: 'src/main.ts', endLine: 600 }), /500 lines/);
});

test('resources return real cached projections and confined text through URI templates', async () => {
  await callTool('onboarder_scan', { path: root });
  const list = (await rpc('resources/list')).result.resources;
  assert.equal(list.length, 4);
  for (const resource of list) {
    const read = (await rpc('resources/read', { uri: resource.uri })).result.contents[0];
    assert.equal(read.uri, resource.uri); assert.equal(read.mimeType, 'application/json');
    assert.equal(typeof JSON.parse(read.text), 'object');
  }
  assert.equal((await rpc('resources/templates/list')).result.resourceTemplates.length, 5);
  const source = await rpc('resources/read', { uri: repositoryResourceUri(root, 'file', 'src/main.ts') });
  assert.match(source.result.contents[0].text, /export const result/);
  for (const uri of [repositoryResourceUri(root, 'file', '../outside.txt'), repositoryResourceUri(root, 'file', 'outside.txt'),
    'file:///etc/passwd', repositoryResourceUri(root, 'overview') + '?path=src/main.ts', 'onboarder://repository/%ZZ/overview']) {
    assert.ok((await rpc('resources/read', { uri })).error, uri);
  }
});

test('guided prompts validate user inputs, pin analysis intent and never execute scans', async () => {
  const prompts = (await rpc('prompts/list')).result.prompts;
  assert.equal(prompts.length, 3);
  for (const prompt of prompts) {
    const args = { path: root, ...(prompt.name === 'review_change' ? { file: 'src/main.ts' } : {}), focus: 'How does this work?' };
    const reply = await rpc('prompts/get', { name: prompt.name, arguments: args });
    assert.match(reply.result.messages[0].content.text, /untrusted data/);
    assert.match(reply.result.messages[0].content.text, /Do not edit or publish/);
  }
  assert.equal((await rpc('prompts/get', { name: 'review_change', arguments: { path: root } })).error.code, -32602);
  assert.equal((await rpc('prompts/get', { name: 'missing', arguments: {} })).error.code, -32602);
  assert.equal((await rpc('resources/list')).result.resources.length, 0);
});

test('separate stdio clients keep omitted paths and listed resources independent', async () => {
  const a = createDispatcher(), b = createDispatcher();
  await a(message('tools/call', { name: 'onboarder_scan', arguments: { path: root } }));
  await b(message('tools/call', { name: 'onboarder_scan', arguments: { path: other } }));
  assert.equal((await a(message('tools/call', { name: 'onboarder_overview' }))).result.structuredContent.root, root);
  assert.equal((await b(message('tools/call', { name: 'onboarder_overview' }))).result.structuredContent.root, other);
  const resources = (await a(message('resources/list'))).result.resources;
  assert.ok(resources.every(resource => decodeURIComponent(resource.uri).includes(root)));
  const unscanned = createDispatcher();
  assert.equal((await unscanned(message('tools/call', { name: 'onboarder_overview' }))).result.isError, true);
});

test('concurrent repository calls share one completed scan and explicit rescan refreshes it', async () => {
  const [first, second] = await Promise.all([analyzeRepository(root), analyzeRepository(root)]);
  assert.equal(first, second);
  assert.equal(await analyzeRepository(root), first);
  const fresh = await analyzeRepository(root, { force: true });
  assert.notEqual(fresh, first); assert.equal(await analyzeRepository(root), fresh);
});

test('stdio recovers after oversized split frames, invalid JSON and split Unicode', async () => {
  const input = new PassThrough(), output = new PassThrough();
  let text = ''; output.setEncoding('utf8'); output.on('data', chunk => { text += chunk; });
  const server = serveMcp({ input, output, maxMessageBytes: 160 });
  input.write('x'.repeat(161)); input.write('tail\nnot json\n');
  const frame = Buffer.from(JSON.stringify(message('ping', { unicode: '你好' }, '✓')));
  const split = frame.indexOf(Buffer.from('你')) + 1;
  input.write(frame.subarray(0, split)); input.write(frame.subarray(split)); input.end('\n');
  await new Promise(resolve => input.once('end', resolve)); await server.settled();
  const replies = text.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(replies.length, 3); assert.equal(replies[0].error.code, -32600);
  assert.equal(replies[1].error.code, -32700); assert.equal(replies[2].id, '✓');
});

test('HTTP enforces loopback, origin, MIME, message/version rules and explicit repository paths', async () => {
  await assert.rejects(createHttpTransport({ port: 0, host: '0.0.0.0' }), /127.0.0.1/);
  const transport = await createHttpTransport({ port: 0 });
  const headers = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
  const post = (body, extra = {}, url = transport.url) => fetch(url, { method: 'POST', headers: { ...headers, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    const request = message('ping');
    assert.equal((await post(request, { Origin: 'https://evil.example' })).status, 403);
    const rebound = await new Promise((resolve, reject) => {
      const req = http.request(transport.url, { method: 'POST', headers: { ...headers, host: 'evil.example' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      }); req.on('error', reject); req.end(JSON.stringify(request));
    });
    assert.equal(rebound, 421);
    assert.equal((await post(request, { Accept: 'application/json, text/event-stream;q=0' })).status, 406);
    assert.equal((await post(request, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(request, { 'MCP-Protocol-Version': 'unknown' })).status, 400);
    assert.equal((await post([request])).status, 400);
    assert.equal((await post('bad-json')).status, 400);
    assert.equal((await post('x'.repeat(4 * 1024 * 1024 + 1))).status, 413);
    assert.equal((await post(request, {}, transport.url.replace('/mcp', '/other'))).status, 404);
    assert.equal((await fetch(transport.url)).status, 405);
    const notification = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(notification.status, 202); assert.equal(await notification.text(), '');
    const scan = await post(message('tools/call', { name: 'onboarder_scan', arguments: { path: root } }));
    assert.equal((await scan.json()).result.isError, false);
    const implicit = await post(message('tools/call', { name: 'onboarder_overview' }));
    assert.equal((await implicit.json()).result.isError, true);
    assert.deepEqual((await (await post(request, { 'MCP-Protocol-Version': '2025-11-25' })).json()).result, {});
  } finally { await transport.close(); }
});

test('agent resources and prompts remain scoped and deny credential/source escape', async () => {
  const manifest = { root, sourceRoot: root, repository: null, remote: null, permissions: { files: false, checks: false, github: false }, auditFile: path.join(temporary, 'audit.jsonl') };
  const dispatch = createAgentDispatcher(manifest);
  const request = (method, params) => dispatch(message(method, params));
  assert.equal((await request('resources/list')).result.resources.length, 4);
  assert.ok((await request('resources/templates/list')).result.resourceTemplates.every(t => !t.uriTemplate.includes('{root}')));
  const good = await request('resources/read', { uri: repositoryResourceUri(root, 'file', 'src/main.ts') });
  assert.match(good.result.contents[0].text, /export const result/);
  for (const uri of [repositoryResourceUri(other, 'overview'), repositoryResourceUri(root, 'file', '.env'), repositoryResourceUri(root, 'file', 'outside.txt')]) {
    assert.ok((await request('resources/read', { uri })).error);
  }
  assert.ok((await request('prompts/get', { name: 'onboard_repository', arguments: { path: other } })).error);
  const prompt = await request('prompts/get', { name: 'onboard_repository' });
  assert.ok(prompt.result.messages[0].content.text.includes(root));
  const wrongType = await request('tools/call', { name: 'onboarder_list_files', arguments: { tests: 'false' } });
  assert.equal(wrongType.result.isError, true);
  const audit = await fs.readFile(manifest.auditFile, 'utf8');
  assert.match(audit, /resources\/read/); assert.ok(!audit.includes('PRIVATE_FIXTURE'));
  assert.ok(!audit.includes('src/main.ts'));
  const brokenAudit = createAgentDispatcher({ ...manifest, auditFile: path.join(temporary, 'missing', 'audit.jsonl') });
  const audited = await brokenAudit(message('tools/call', { name: 'onboarder_list_files' }));
  assert.equal(audited.result.isError, true); assert.match(audited.result.content[0].text, /Audit recording failed/);
});

test('local check refuses a server that initializes but does not expose the tool catalog', async () => {
  const source = `process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{for(const line of data.trim().split('\\n')){const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:m.method==='initialize'?{serverInfo:{name:'onboarder'}}:{tools:[]}})+'\\n')}});`;
  const runner = new McpRunner({ command: process.execPath, args: ['-e', source] });
  try { const status = await runner.start(); assert.equal(status.running, false); assert.match(status.lastError, /catalog/); }
  finally { await runner.stop(); }
});

test('failed MCP executables retain the actionable startup error', async () => {
  const runner = new McpRunner({ command: '/definitely/missing/onboarder-node' });
  const started = Date.now(), status = await runner.start();
  assert.equal(status.running, false); assert.match(status.lastError, /Could not start/);
  assert.ok(Date.now() - started < 2000, 'failure is immediate rather than a handshake timeout');
});

test('CLI prints usable config and catalogs, checks a real process, and serves clean stdio', async () => {
  const run = (args, input = '') => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin/onboarder.js', 'mcp', ...args]);
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('exit', code => resolve({ code, stdout, stderr })); child.stdin.end(input);
  });
  const config = await run(['config']); assert.equal(config.code, 0);
  const parsed = JSON.parse(config.stdout).mcpServers.onboarder;
  assert.equal(parsed.command, process.execPath); assert.ok(path.isAbsolute(parsed.args[0]));
  assert.match((await run(['config', 'toml'])).stdout, /\[mcp_servers\.onboarder\]/);
  const catalog = JSON.parse((await run(['catalog', '--json'])).stdout);
  assert.equal(catalog.tools.length, 17); assert.equal(catalog.resources.length, 5); assert.equal(catalog.prompts.length, 3);
  const check = await run(['check', '--json']); assert.equal(check.code, 0, check.stderr); assert.equal(JSON.parse(check.stdout).ok, true);
  const wire = await run([], JSON.stringify(message('ping', {}, 'wire')) + '\n');
  assert.equal(wire.code, 0, wire.stderr); assert.deepEqual(JSON.parse(wire.stdout), { jsonrpc: '2.0', id: 'wire', result: {} });
  assert.match((await run(['--help'])).stdout, /config \[json\|toml\]/);
});
