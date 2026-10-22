import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
export const beforeAuth = 'export function authorize(user: { admin?: boolean } | undefined) {\n  return user?.admin === true;\n}\n';
export const afterAuth = beforeAuth.replace('export function', 'export async function');
export const routeSource = 'import { authorize } from "./auth.ts";\nexport function adminRoute(user: { admin?: boolean } | undefined) {\n  if (!authorize(user)) return { status: 403 };\n  return { status: 200 };\n}\n';
export async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'onboarder-ai-review-')); t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'AI fixture'); git(root, 'config', 'user.email', 'ai@example.test');
  const ext = options.language === 'javascript' ? 'js' : 'ts';
  const adapt = value => ext === 'js' ? value.replaceAll(': { admin?: boolean } | undefined', '').replaceAll('.ts"', '.js"') : value;
  const caller = options.awaitCaller ? routeSource.replace('export function adminRoute', 'export async function adminRoute').replace('!authorize(user)', '!(await authorize(user))') : routeSource;
  await writeFile(path.join(root, 'auth.' + ext), adapt(beforeAuth)); await writeFile(path.join(root, 'route.' + ext), adapt(caller));
  await mkdir(path.join(root, 'tests'));
  await writeFile(path.join(root, 'tests', 'auth.test.' + ext), adapt('import { authorize } from "../auth.ts";\nexport const rejectsAnonymous = async () => (await authorize(undefined)) === false;\n'));
  await writeFile(path.join(root, '.onboarder.json'), JSON.stringify({ version: 1, rules: [{ id: 'ui-storage', from: 'ui/**', forbid: 'storage/**', message: 'Use the service layer.' }] }));
  if (options.config) await writeFile(path.join(root, '.onboarder-review.json'), JSON.stringify(options.config));
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base'); const base = git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(root, 'auth.' + ext), adapt(options.after || afterAuth));
  return { root, base };
}
export function contextFrom(messages) { return JSON.parse(messages.at(-1).content.replace(/^UNTRUSTED_REVIEW_CONTEXT_JSON\n/, '')); }
export function cite(context, file, line) {
  const e = context.evidence.find(e => e.path === file && line >= e.startLine && line <= e.endLine);
  if (!e) throw new Error('Fixture requires captured evidence for ' + file + ':' + line);
  return { id: e.id, startLine: line, endLine: line, quote: e.text.split('\n')[line - e.startLine] };
}
export function authFinding(context) {
  const ext = context.changes.some(c => c.path === 'auth.js') ? 'js' : 'ts';
  return { path: 'auth.' + ext, line: 1, rule: 'async-auth-caller', category: 'integration', severity: 'high', confidence: 'high',
    confidenceReason: 'The changed function is async while the captured caller tests its return value without awaiting it. Dynamic callers were not examined.',
    title: 'Synchronous caller treats the authorization Promise as truthy', explanation: 'adminRoute negates authorize(user) directly. After this change the return value is a Promise, so that condition no longer rejects an unauthorized user.',
    impact: 'The admin route may return 200 for unauthorized requests.', remediation: 'Await authorization in an async route and add a regression test for anonymous and non-admin users.',
    evidence: [cite(context, 'auth.' + ext, 1), cite(context, 'route.' + ext, 3)] };
}
export const response = (findings = [], limitations = []) => ({ text: JSON.stringify({ schemaVersion: 1, analysisComplete: true, findings, limitations }) });
