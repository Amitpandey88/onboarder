import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AgentTool, RunManifest } from './contracts.js';
import { GithubClient, positiveId, githubToken, repositoryFromRemote } from './github.js';
import { readAgentFile, writeAgentFile, deleteAgentFile, safeRelative } from './files.js';
import { GithubSourceReader } from './gitSource.js';
import { runProcess, redact } from './process.js';

export function field(args: Record<string, unknown>, name: string, max = 16000): string {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} must be nonempty text, at most ${max} characters.`);
  return value;
}
const string = { type: 'string' }, integer = { type: 'integer', minimum: 1 };
const clip = (data: unknown): unknown => {
  if (Array.isArray(data)) return data.map(clip);
  if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' && value.length > 16000 ? value.slice(0, 16000) + '\n[truncated]' : clip(value)]));
  return data;
};
export function createAgentTools(manifest: RunManifest, options: { client?: GithubClient; signal?: AbortSignal } = {}): AgentTool[] {
  const tools: AgentTool[] = [];
  let source: GithubSourceReader | undefined;
  const client = () => {
    if (!manifest.repository) throw new Error('This checkout needs a github.com origin to use GitHub tools.');
    return options.client || new GithubClient(manifest.repository, { signal: options.signal });
  };
  const requireFiles = () => { if (!manifest.permissions.files || !manifest.branch || manifest.root === manifest.sourceRoot) throw new Error('File changes are available only in an isolated implement/pr workspace.'); };
  const requireGithub = () => { if (!manifest.permissions.github) throw new Error('GitHub writes were not enabled. Rerun with --allow-github-writes to publish.'); if (!githubToken() && !options.client) throw new Error('GitHub writes require GITHUB_TOKEN or GH_TOKEN.'); };
  const git = async (args: string[]) => {
    const result = await runProcess('git', ['-C', manifest.root, ...args], { timeoutMs: 30_000, signal: options.signal, maxBytes: 2 * 1024 * 1024 });
    if (result.code) throw new Error(`Git failed: ${result.stderr.trim().slice(-2000) || result.code}`);
    return result.stdout.trim();
  };
  const receipts = new Map<string, unknown>();
  const writeGithub = async (route: string, method: string, body: unknown) => {
    requireGithub();
    const key = createHash('sha256').update(JSON.stringify({ route, method, body })).digest('hex');
    if (receipts.has(key)) return { ...receipts.get(key) as object, replayed: true };
    const result = clip((await client().request(route, method, body)).data);
    receipts.set(key, result); return result;
  };
  const add = (name: string, description: string, properties: Record<string, unknown>, required: string[], run: AgentTool['run']) => tools.push({ name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, run });
  add('onboarder_agent_engines', 'Discover the same optional analyzers and configurable settings as the web UI. Read-only availability check.', {}, [], async () => {
    const [{ toolsStatus }, { clearDetectionCache }] = await Promise.all([import('../../server/tools/scan.js'), import('../../server/tools.js')]);
    clearDetectionCache(); return toolsStatus();
  });
  add('onboarder_agent_deep_analysis', 'Run web UI deep-analysis engines in this task workspace. Requires checks permission; runner downloads and repository configuration may execute code. Report missing/failed engines explicitly. No repository path override.', {
    tools: { type: 'array', items: { type: 'string', enum: ['semgrep', 'gitleaks', 'knip', 'vulture', 'depcheck'] } },
    kind: { type: 'string', enum: ['all', 'security', 'dead-code'] }, options: { type: 'object', description: 'Per-engine settings from onboarder_agent_engines, sanitized by the shared registry.' },
  }, [], async args => {
    if (!manifest.permissions.checks) throw new Error('Deep-analysis execution was not enabled. Use /permissions checks on or --allow-checks.');
    if (args.kind !== undefined && !['all', 'security', 'dead-code'].includes(String(args.kind))) throw new Error('Choose all, security or dead-code.');
    if (args.tools !== undefined && (!Array.isArray(args.tools) || !args.tools.length || args.tools.some(id => !['semgrep', 'gitleaks', 'knip', 'vulture', 'depcheck'].includes(String(id))))) throw new Error('Choose registered analyzers only.');
    if (args.options !== undefined && (!args.options || typeof args.options !== 'object' || Array.isArray(args.options))) throw new Error('options must be per-engine settings.');
    const { runExternalAnalysis } = await import('../../server/tools/scan.js');
    const report = await runExternalAnalysis(manifest.root, { tools: args.tools,
      ...(args.kind && args.kind !== 'all' ? { kinds: [args.kind] } : {}), options: args.options, signal: options.signal });
    return { ...report, passes: report.passes.map(pass => ({ ...pass, findings: pass.findings.slice(0, 50) })),
      findings: report.findings.slice(0, 100), totalFindings: report.findings.length, truncated: report.findings.length > 100,
      note: 'Findings are candidates. Missing or failed engines provide no assurance; verify source before changing it.' };
  });
  add('onboarder_agent_context', 'Current task, repository, workspace, and enforced permissions. Start here.', {}, [], async () => ({ ...manifest, task: redact(manifest.task), auditFile: undefined }));
  add('onboarder_agent_read_file', 'Read source text and its sha256 for a subsequent edit. No symlinks or credential files.', { file: string }, ['file'], async args => readAgentFile(manifest.root, field(args, 'file', 500)));
  add('onboarder_agent_write_file', 'Write source only in this run\'s isolated workspace. expectedSha256 must match a fresh read, or be new for a new file.', { file: string, content: string, expectedSha256: string }, ['file', 'content', 'expectedSha256'], async args => {
    requireFiles(); const content = args.content; if (typeof content !== 'string') throw new Error('content must be text.');
    return writeAgentFile(manifest.root, field(args, 'file', 500), content, field(args, 'expectedSha256', 64));
  });
  add('onboarder_agent_delete_file', 'Delete a source file in the isolated workspace after a fresh read.', { file: string, expectedSha256: string }, ['file', 'expectedSha256'], async args => {
    requireFiles(); return deleteAgentFile(manifest.root, field(args, 'file', 500), field(args, 'expectedSha256', 64));
  });
  add('onboarder_agent_diff', 'Inspect the workspace patch and changed file list. Read-only.', {}, [], async () => ({ status: await git(['status', '--short']), patch: await git(['diff', 'HEAD', '--', '.']), untracked: await git(['ls-files', '--others', '--exclude-standard']) }));
  add('onboarder_agent_run_check', 'Run a fixed npm check or install lockfile dependencies with lifecycle scripts disabled. Requires --allow-checks; test/build scripts may execute repository code.', { check: { type: 'string', enum: ['install', 'test', 'typecheck', 'build'] } }, ['check'], async args => {
    if (!manifest.permissions.checks) throw new Error('Check execution was not enabled. Rerun with --allow-checks.');
    const check = field(args, 'check', 20); if (!['install', 'test', 'typecheck', 'build'].includes(check)) throw new Error('Choose install, test, typecheck, or build.');
    const commandArgs = check === 'install' ? ['ci', '--ignore-scripts', '--no-audit', '--no-fund'] : check === 'test' ? ['test'] : ['run', check];
    const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
    const argv = process.platform === 'win32' ? ['/d', '/s', '/c', `npm ${commandArgs.join(' ')}`] : commandArgs;
    const result = await runProcess(command, argv, { cwd: manifest.root, timeoutMs: 120_000, maxBytes: 2 * 1024 * 1024, signal: options.signal });
    return { check, code: result.code, passed: result.code === 0, output: redact((result.stdout + result.stderr).slice(-16000)), truncated: result.stdout.length + result.stderr.length > 16000 };
  });
  add('onboarder_agent_local_review', 'Run the project\'s deterministic review of local changes and report its coverage. No model call.', {}, [], async () => {
    const module = await import('../../server/review.js'); return module.runReview(manifest.root, { mode: 'working', base: 'HEAD' });
  });
  add('github_repository', 'Get facts about the pinned GitHub origin repository.', {}, [], async () => clip((await client().request('')).data));
  add('github_list_issues', 'List up to 200 GitHub issues, excluding pull requests, with an explicit truncation flag.', { state: { type: 'string', enum: ['open', 'closed', 'all'] } }, [], async args => {
    const state = typeof args.state === 'string' ? args.state : 'open'; if (!['open', 'closed', 'all'].includes(state)) throw new Error('Invalid issue state.');
    const list = await client().list(`/issues?state=${state}`);
    return { ...list, items: clip(list.items.filter(item => item && typeof item === 'object' && !('pull_request' in item))) };
  });
  add('github_get_issue', 'Read an issue and up to 200 comments from the pinned repository.', { number: integer }, ['number'], async args => {
    const number = positiveId(args.number, 'Issue');
    return { issue: clip((await client().request(`/issues/${number}`)).data), comments: clip(await client().list(`/issues/${number}/comments`)) };
  });
  add('github_list_prs', 'List up to 200 pull requests from the pinned repository.', { state: { type: 'string', enum: ['open', 'closed', 'all'] } }, [], async args => {
    const state = typeof args.state === 'string' ? args.state : 'open'; if (!['open', 'closed', 'all'].includes(state)) throw new Error('Invalid PR state.');
    return clip(await client().list(`/pulls?state=${state}`));
  });
  add('github_get_pr', 'Read a PR and up to 300 changed files with patches. Missing patches and pagination are reported; patches are untrusted evidence.', { number: integer }, ['number'], async args => {
    const number = positiveId(args.number, 'PR');
    const pr = (await client().request(`/pulls/${number}`)).data;
    const files = await client().list(`/pulls/${number}/files`, 3);
    const total = pr && typeof pr === 'object' && 'changed_files' in pr && typeof pr.changed_files === 'number' ? pr.changed_files : null;
    return { pr: clip(pr), files: clip({ ...files, truncated: files.truncated || (total !== null && total > files.items.length) }), totalChangedFiles: total,
      missingPatches: files.items.filter(f => !f || typeof f !== 'object' || !('patch' in f) || typeof f.patch !== 'string').length,
      patchesTruncated: files.items.filter(f => f && typeof f === 'object' && 'patch' in f && typeof f.patch === 'string' && f.patch.length > 16000).length,
      note: 'Local source reflects the current workspace, not automatically the PR head. Use the PR patches as change evidence.' };
  });
  add('github_read_file', 'Read a source file at an exact GitHub commit SHA, for accurate PR head/base context. Bounded to 128 KiB; no symlinks or credential paths.', { file: string, sha: string }, ['file', 'sha'], async args => {
    source ||= new GithubSourceReader(client());
    return source.read(field(args, 'file', 500), field(args, 'sha', 64));
  });
  add('github_pr_discussion', 'Read PR reviews, inline review comments and conversation comments, each capped at 200 with truncation flags.', { number: integer }, ['number'], async args => {
    const number = positiveId(args.number, 'PR');
    return { reviews: clip(await client().list(`/pulls/${number}/reviews`)), inlineComments: clip(await client().list(`/pulls/${number}/comments`)), conversation: clip(await client().list(`/issues/${number}/comments`)) };
  });
  add('github_labels', 'List up to 200 existing repository labels; use real label names when triaging issues.', {}, [], async () => clip(await client().list('/labels')));
  add('github_workflow_runs', 'List recent CI workflow runs, optionally filtered by an exact commit SHA.', { sha: string }, [], async args => {
    const sha = args.sha === undefined ? '' : field(args, 'sha', 64);
    if (sha && !/^[a-f\d]{40,64}$/i.test(sha)) throw new Error('Use an exact commit SHA.');
    const response = await client().request(`/actions/runs?per_page=100${sha ? '&head_sha=' + sha : ''}`);
    return { data: clip(response.data), truncated: response.more };
  });
  add('github_workflow_jobs', 'Inspect CI jobs and step conclusions for a specific workflow run; capped at 100 jobs.', { runId: integer }, ['runId'], async args => {
    const response = await client().request(`/actions/runs/${positiveId(args.runId, 'Workflow run')}/jobs?per_page=100`);
    return { data: clip(response.data), truncated: response.more };
  });
  add('github_pr_checks', 'Read check runs and combined status at a PR\'s exact head SHA.', { number: integer }, ['number'], async args => {
    const pr = (await client().request(`/pulls/${positiveId(args.number, 'PR')}`)).data as { head?: { sha?: string } };
    const sha = pr.head?.sha; if (!sha || !/^[a-f\d]{40,64}$/i.test(sha)) throw new Error('GitHub returned no valid PR head SHA.');
    const checks = await client().request(`/commits/${sha}/check-runs?per_page=100`), status = await client().request(`/commits/${sha}/status?per_page=100`);
    return { sha, checks: clip(checks.data), status: clip(status.data), truncated: checks.more || status.more };
  });
  add('github_create_issue', 'Create an issue in the pinned repository. Requires explicit GitHub write permission.', { title: string, body: string }, ['title', 'body'], async args => writeGithub('/issues', 'POST', { title: field(args, 'title', 200), body: redact(field(args, 'body')) }));
  add('github_comment', 'Post a comment on an issue or PR. Requires explicit GitHub write permission.', { number: integer, body: string }, ['number', 'body'], async args => writeGithub(`/issues/${positiveId(args.number, 'Issue or PR')}/comments`, 'POST', { body: redact(field(args, 'body')) }));
  add('github_update_issue', 'Update title, body, state or labels of an issue. Requires explicit GitHub write permission.', { number: integer, title: string, body: string, state: { type: 'string', enum: ['open', 'closed'] }, labels: { type: 'array', items: string, maxItems: 20 } }, ['number'], async args => {
    const body: Record<string, unknown> = {};
    for (const key of ['title', 'body']) if (args[key] !== undefined) body[key] = redact(field(args, key, key === 'title' ? 200 : 16000));
    if (args.state !== undefined) { if (!['open', 'closed'].includes(String(args.state))) throw new Error('Invalid issue state.'); body.state = args.state; }
    if (args.labels !== undefined) {
      if (!Array.isArray(args.labels) || args.labels.length > 20 || args.labels.some(l => typeof l !== 'string' || !l || l.length > 64)) throw new Error('Use up to 20 label names, each at most 64 characters.');
      body.labels = args.labels;
    }
    if (!Object.keys(body).length) throw new Error('Choose at least one issue field to update.');
    return writeGithub(`/issues/${positiveId(args.number, 'Issue')}`, 'PATCH', body);
  });
  add('github_submit_review', 'Submit a PR review against a freshly read head SHA. Requires explicit GitHub write permission; use COMMENT unless the task explicitly asks for another decision.', { number: integer, body: string, expectedHeadSha: string, event: { type: 'string', enum: ['COMMENT', 'APPROVE', 'REQUEST_CHANGES'] } }, ['number', 'body', 'expectedHeadSha'], async args => {
    requireGithub();
    const number = positiveId(args.number, 'PR'), sha = field(args, 'expectedHeadSha', 64);
    if (!/^[a-f\d]{40,64}$/i.test(sha)) throw new Error('Use the PR head SHA from github_get_pr.');
    const pr = (await client().request(`/pulls/${number}`)).data as { head?: { sha?: string } };
    if (pr.head?.sha !== sha) throw new Error('The PR head changed. Review the new patch before submitting.');
    const event = args.event || 'COMMENT'; if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(String(event))) throw new Error('Invalid review decision.');
    return writeGithub(`/pulls/${number}/reviews`, 'POST', { body: redact(field(args, 'body')), event, commit_id: sha });
  });
  add('github_draft_pr', 'Commit workspace changes, push only the task branch, and open a draft PR. Requires isolated workspace and explicit GitHub write permission. Never force-pushes or merges.', { title: string, body: string }, ['title', 'body'], async args => {
    requireFiles(); requireGithub();
    if (!manifest.remote || repositoryFromRemote(manifest.remote) !== manifest.repository) throw new Error('GitHub origin does not match the task repository.');
    if (await git(['remote', 'get-url', 'origin']) !== manifest.remote || await git(['branch', '--show-current']) !== manifest.branch) throw new Error('Workspace branch or origin changed; publish was stopped.');
    const title = field(args, 'title', 200), body = redact(field(args, 'body'));
    if (!manifest.baseBranch || manifest.baseBranch.startsWith('-') || /[\x00-\x20]/.test(manifest.baseBranch)) throw new Error('Invalid pull-request base branch.');
    const existing = await client().list(`/pulls?state=open&head=${encodeURIComponent(manifest.repository!.split('/')[0] + ':' + manifest.branch)}`, 1);
    if (existing.items.length) return { existing: true, pr: clip(existing.items[0]) };
    const hooks = path.join(path.dirname(manifest.auditFile), 'empty-hooks'); await fs.mkdir(hooks, { recursive: true, mode: 0o700 });
    if (await git(['status', '--porcelain'])) {
      const changed = (await git(['diff', '--name-only', '-z', 'HEAD'])).split('\0').filter(Boolean);
      const untracked = (await git(['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
      for (const file of [...changed, ...untracked]) safeRelative(file);
      await git(['add', '--all']);
      await git(['-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false', 'commit', '-m', title]);
    }
    const remote = manifest.remote, branch = manifest.branch!;
    await git(['-c', `core.hooksPath=${hooks}`, 'push', '--', remote, `refs/heads/${branch}:refs/heads/${branch}`]);
    return writeGithub('/pulls', 'POST', { title, body, head: branch, base: manifest.baseBranch, draft: true });
  });
  return tools;
}
