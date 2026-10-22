const vscode = require('vscode');
const { execFile } = require('node:child_process');
const path = require('node:path');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function activate(context) {
  let files = [];
  const changed = new vscode.EventEmitter();
  const provider = {
    onDidChangeTreeData: changed.event,
    getChildren: element => element ? [] : files,
    getTreeItem: file => {
      const item = new vscode.TreeItem(file.path);
      item.description = file.lang;
      item.command = { command: 'vscode.open', title: 'Open source', arguments: [vscode.Uri.file(file.absolute)] };
      return item;
    },
  };
  context.subscriptions.push(changed, vscode.window.registerTreeDataProvider('onboarder.repository', provider));
  const root = () => {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before invoking its local analysis tools.');
    const editor = vscode.window.activeTextEditor;
    const folder = editor ? vscode.workspace.getWorkspaceFolder(editor.document.uri) : vscode.workspace.workspaceFolders?.[0];
    if (!folder) throw new Error('Open a repository folder first.');
    return folder.uri.fsPath;
  };
  const run = (args, cwd) => vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Onboarder is reading the repository', cancellable: true }, (_progress, cancellation) => new Promise((resolve, reject) => {
    const configured = vscode.workspace.getConfiguration('onboarder').get('cliPath', '');
    if (configured && (!path.isAbsolute(configured) || !/\.[cm]?js$/.test(configured))) return reject(new Error('Set onboarder.cliPath to an absolute JavaScript CLI entry point.'));
    if (!configured && process.platform === 'win32') return reject(new Error('On Windows, set onboarder.cliPath to the installed bin/onboarder.js.'));
    const abort = new AbortController();
    const listener = cancellation.onCancellationRequested(() => abort.abort());
    execFile(configured ? process.execPath : 'onboarder', configured ? [configured, ...args] : args, {
      cwd, shell: false, timeout: 60000, maxBuffer: 8 * 1024 * 1024, signal: abort.signal,
      env: { ...process.env, ...(configured ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
    }, (error, stdout, stderr) => {
      listener.dispose();
      try {
        if (error && !stdout.trim()) throw new Error(stderr.trim().slice(0, 1000) || 'Install the current source build or configure onboarder.cliPath.');
        const value = JSON.parse(stdout);
        if (value.error) throw new Error(String(value.error).slice(0, 1000));
        resolve(value);
      } catch (parseError) { reject(parseError); }
    });
  }));
  const show = (title, value) => {
    const panel = vscode.window.createWebviewPanel('onboarder', title, vscode.ViewColumn.Beside, { enableScripts: false, localResourceRoots: [] });
    panel.webview.html = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>body{font-family:var(--vscode-font-family);padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>' + escape(title) + '</h1><p>Local analysis. Read the reported revision and limitations before relying on it.</p><pre>' + escape(JSON.stringify(value, null, 2)) + '</pre></body></html>';
  };
  const command = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, async () => { try { await fn(); } catch (error) { vscode.window.showErrorMessage('Onboarder: ' + error.message); } }));
  command('onboarder.inspect', async () => {
    const cwd = root(); const report = await run(['intelligence', 'scan', cwd, '--json'], cwd);
    files = report.scanFiles.map(file => ({ ...file, absolute: path.resolve(cwd, file.path) })).filter(file => file.absolute.startsWith(cwd + path.sep));
    changed.fire(); show('Repository Intelligence', report);
  });
  command('onboarder.explain', async () => {
    const cwd = root(); const editor = vscode.window.activeTextEditor;
    const selected = editor?.document.getText(editor.selection).trim().slice(0, 1500);
    const question = await vscode.window.showInputBox({ prompt: 'Find source evidence locally', value: selected || '' });
    if (question?.trim()) show('Source Evidence', await run(['intelligence', 'ask', cwd, question, '--json'], cwd));
  });
  command('onboarder.impact', async () => {
    const cwd = root(); const editor = vscode.window.activeTextEditor;
    if (!editor) throw new Error('Open the source file whose impact you want to inspect.');
    const file = path.relative(cwd, editor.document.uri.fsPath).split(path.sep).join('/');
    if (!file || file.startsWith('../') || path.isAbsolute(file)) throw new Error('Choose a file in this repository.');
    show('Change Impact', await run(['intelligence', 'impact', cwd, file, '--json'], cwd));
  });
  command('onboarder.review', async () => { const cwd = root(); show('Change Review', await run(['review', cwd, '--json'], cwd)); });
  command('onboarder.triage', async () => {
    const cwd = root(); const page = await run(['triage', 'list', cwd, '--json'], cwd);
    if (!Array.isArray(page.items)) throw new Error('Update the local Onboarder CLI to a build containing triage.');
    if (!page.items.length) { show('PR Triage — no open PRs', page); return; }
    const selected = await vscode.window.showQuickPick([{ label: 'View this queue page', page: true }, ...page.items.map(item => ({ label: '#' + item.pull.number + ' ' + item.pull.title,
      description: item.priority + ' (provisional) · @' + item.pull.author, number: item.pull.number }))], { title: 'Onboarder PR triage', placeHolder: 'Select a PR to inspect its exact revisions; this command never runs AI or writes to GitHub' });
    if (!selected) return;
    show(selected.page ? 'PR Triage Queue' : 'PR Triage #' + selected.number, selected.page ? page : await run(['triage', 'inspect', cwd, '--pr', String(selected.number), '--json'], cwd));
  });
  command('onboarder.journeys', async () => { const cwd = root(); show('Onboarding Journeys', await run(['intelligence', 'journeys', cwd, '--json'], cwd)); });
  command('onboarder.open', async () => {
    const url = vscode.workspace.getConfiguration('onboarder').get('serverUrl', 'http://localhost:4310');
    if (!/^https?:\/\//.test(url)) throw new Error('Use an HTTP or HTTPS server address.');
    await vscode.env.openExternal(vscode.Uri.parse(url));
  });
}
module.exports = { activate, deactivate() {}, escape };
