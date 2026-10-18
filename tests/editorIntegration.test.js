import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';

const project = fileURLToPath(new URL('../', import.meta.url));
test('editor commands activate, run the real local CLI and expose safe source entries', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-editor-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.ts'), 'export function greet() { return "hello"; }\n');
  const commands = new Map(); const panels = []; const errors = []; let provider;
  const vscode = {
    EventEmitter: class { event = () => {}; fire() {} dispose() {} },
    TreeItem: class { constructor(label) { this.label = label; } },
    Uri: { file: file => ({ fsPath: file }), parse: value => value },
    ViewColumn: { Beside: 2 }, ProgressLocation: { Notification: 1 },
    workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: root } }],
      getConfiguration: () => ({ get: (key, fallback) => key === 'cliPath' ? path.join(project, 'bin/onboarder.js') : fallback }) },
    window: { activeTextEditor: null, registerTreeDataProvider: (_id, value) => { provider = value; return { dispose() {} }; },
      withProgress: (_options, run) => run({}, { onCancellationRequested: () => ({ dispose() {} }) }),
      createWebviewPanel: (_id, title, _column, options) => { const panel = { title, options, webview: {} }; panels.push(panel); return panel; },
      showInputBox: async () => 'greet', showErrorMessage: value => errors.push(value) },
    commands: { registerCommand: (name, fn) => { commands.set(name, fn); return { dispose() {} }; } },
    env: { openExternal: async () => true },
  };
  const module = { exports: {} }; const require = createRequire(import.meta.url);
  vm.runInNewContext(await readFile(path.join(project, 'integrations/vscode/extension.cjs'), 'utf8'), {
    module, exports: module.exports, require: name => name === 'vscode' ? vscode : require(name), process, AbortController, console,
  });
  module.exports.activate({ subscriptions: [] });
  assert.equal(commands.size, 6);
  await commands.get('onboarder.inspect')();
  assert.deepEqual(errors, []); assert.equal(panels[0].options.enableScripts, false);
  const files = await provider.getChildren(); assert.ok(files.some(f => f.path === 'index.ts'));
  assert.equal(provider.getTreeItem(files.find(f => f.path === 'index.ts')).command.arguments[0].fsPath, path.join(root, 'index.ts'));
  await commands.get('onboarder.explain')();
  assert.ok(panels[1].webview.html.includes('greet')); assert.ok(panels[1].webview.html.includes('Source Evidence'));
  vscode.workspace.isTrusted = false; await commands.get('onboarder.inspect')();
  assert.ok(errors[0].includes('Trust this workspace'));
  assert.equal(module.exports.escape('<script>'), '&lt;script&gt;');
});
test('editor package builds a self-contained VSIX without introducing dependencies', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-vsix-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'onboarder.vsix');
  execFileSync(process.execPath, [path.join(project, 'scripts/package-editor.mjs'), file], { cwd: project });
  const data = await readFile(file);
  assert.equal(data.readUInt32LE(0), 0x04034b50);
  assert.ok(data.includes(Buffer.from('extension/package.json'))); assert.ok(data.includes(Buffer.from('extension/extension.cjs')));
  assert.ok(data.includes(Buffer.from('Microsoft.VisualStudio.Code.Manifest')));
  const manifest = JSON.parse(await readFile(path.join(project, 'integrations/vscode/package.json'), 'utf8'));
  assert.equal(manifest.dependencies, undefined); assert.equal(manifest.capabilities.untrustedWorkspaces.supported, false);
});
