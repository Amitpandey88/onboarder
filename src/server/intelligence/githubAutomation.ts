import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHmac, createSign, timingSafeEqual, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReviewReport } from '../../shared/review/contracts.js';
import { buildReview, DEFAULT_REVIEW_CONFIG } from '../../shared/review/review.js';
import { parseUnifiedDiff } from '../gitDiff.js';
import { GithubClient } from '../../cli/agent/github.js';
import { sendError, sendJSON } from '../http.js';
import { evidenceText, hash } from './workspace.js';

interface AutomationConfig { version: 1; publish: boolean; repositories: Record<string, { installationId?: number }> }
interface Job { id: string; repository: string; number: number; head: string; base: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'stale'; updatedAt: string; report?: ReviewReport; error?: string; checkId?: number }
export function verifyWebhook(secret: string, raw: Buffer, signature: string): boolean {
  if (secret.length < 24 || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  const value = Buffer.from(signature);
  return expected.length === value.length && timingSafeEqual(expected, value);
}
export function appJwt(appId: string, privateKey: string, now = Math.floor(Date.now() / 1000)) {
  if (!/^\d+$/.test(appId)) throw new Error('Use a numeric GitHub App ID.');
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iat: now - 60, exp: now + 540, iss: appId });
  const sign = createSign('RSA-SHA256'); sign.update(unsigned); sign.end();
  return unsigned + '.' + sign.sign(privateKey).toString('base64url');
}
async function installationToken(repository: string, installationId: number) {
  const keyFile = process.env.ONBOARDER_GITHUB_APP_KEY_FILE;
  const appId = process.env.ONBOARDER_GITHUB_APP_ID;
  if (!keyFile || !appId) return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!Number.isSafeInteger(installationId) || installationId < 1) throw new Error('Configure this repository’s GitHub App installation ID.');
  const stat = await fs.lstat(keyFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) throw new Error('GitHub App key must be a regular private file under 32 KB.');
  const jwt = appJwt(appId, await fs.readFile(keyFile, 'utf8'));
  const response = await fetch('https://api.github.com/app/installations/' + installationId + '/access_tokens', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: 'Bearer ' + jwt, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
    body: JSON.stringify({ repositories: [repository.split('/')[1]], permissions: { contents: 'read', pull_requests: 'read', checks: 'write' } }),
  });
  if (!response.ok) throw new Error('GitHub App installation authentication failed.');
  const text = await response.text();
  if (text.length > 16384) throw new Error('Invalid installation response.');
  const data = JSON.parse(text);
  if (typeof data.token !== 'string' || !data.token) throw new Error('GitHub returned no installation token.');
  return data.token;
}
export class GithubAutomation {
  private pending: Job[] = [];
  private running = false;
  private initialized = false;
  constructor(readonly file: string, readonly secret: string, private createClient?: (repository: string) => GithubClient) {}
  private async config(): Promise<AutomationConfig> {
    const stat = await fs.lstat(this.file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error('Invalid GitHub automation configuration.');
    const cfg = JSON.parse(await fs.readFile(this.file, 'utf8')) as AutomationConfig;
    if (cfg.version !== 1 || typeof cfg.publish !== 'boolean' || !cfg.repositories || typeof cfg.repositories !== 'object' || Array.isArray(cfg.repositories) || Object.keys(cfg.repositories).length > 50 ||
      Object.entries(cfg.repositories).some(([repository, options]) => !/^[\w.-]+\/[\w.-]+$/.test(repository) || !options || typeof options !== 'object' || options.installationId !== undefined && (!Number.isSafeInteger(options.installationId) || options.installationId < 1))) throw new Error('Invalid GitHub automation schema.');
    return cfg;
  }
  private folder() { return path.join(path.dirname(this.file), 'github-jobs'); }
  private async save(job: Job) {
    await fs.mkdir(this.folder(), { recursive: true, mode: 0o700 });
    if ((await fs.lstat(this.folder())).isSymbolicLink()) throw new Error('Jobs directory cannot be a symbolic link.');
    job.updatedAt = new Date().toISOString();
    const file = path.join(this.folder(), job.id + '.json'); const temporary = file + '.' + randomUUID();
    try { await fs.writeFile(temporary, JSON.stringify(job), { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, file); }
    finally { await fs.unlink(temporary).catch(() => {}); }
  }
  async jobs(): Promise<Job[]> {
    const names = await fs.readdir(this.folder()).catch(() => [] as string[]);
    if (names.length > 500) throw new Error('Automation job retention limit reached. Archive completed job files before accepting more work.');
    const jobs: Job[] = [];
    for (const name of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
      const file = path.join(this.folder(), name); const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('Invalid automation receipt.');
      const value = JSON.parse(await fs.readFile(file, 'utf8')) as Job;
      if (value.id !== name.slice(0, -5) || !/^[a-f0-9]{40}$/.test(value.head) || !/^[a-f0-9]{40}$/.test(value.base) || !Number.isSafeInteger(value.number)) throw new Error('Invalid automation receipt.');
      jobs.push(value);
    }
    return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async start() {
    if (this.initialized) return;
    await this.config();
    this.pending.push(...(await this.jobs()).filter(j => j.status === 'queued' || j.status === 'running'));
    this.initialized = true; void this.drain();
  }
  async accept(event: string, payload: any) {
    await this.start();
    if (event === 'ping') return { accepted: true, ping: true };
    if (event !== 'pull_request' || !['opened', 'reopened', 'synchronize', 'ready_for_review'].includes(payload?.action)) return { accepted: false, ignored: true };
    const cfg = await this.config();
    const repository = payload.repository?.full_name;
    if (typeof repository !== 'string' || !Object.hasOwn(cfg.repositories, repository)) throw new Error('Repository is not enabled for this webhook.');
    const pr = payload.pull_request;
    if (!pr || pr.base?.repo?.full_name !== repository || !Number.isSafeInteger(payload.number) || payload.number < 1 ||
      !/^[a-f0-9]{40}$/.test(pr.head?.sha) || !/^[a-f0-9]{40}$/.test(pr.base?.sha)) throw new Error('Invalid pull-request event.');
    const id = hash(repository + ':' + payload.number + ':' + pr.base.sha + ':' + pr.head.sha);
    if ((await this.jobs()).some(j => j.id === id)) return { accepted: true, id, duplicate: true };
    if (this.pending.length >= 20) throw new Error('Webhook queue is full. Redeliver later.');
    const job: Job = { id, repository, number: payload.number, head: pr.head.sha, base: pr.base.sha, status: 'queued', updatedAt: new Date().toISOString() };
    await this.save(job); this.pending.push(job); void this.drain();
    return { accepted: true, id };
  }
  async idle() { while (this.running || this.pending.length) await new Promise(resolve => setTimeout(resolve, 10)); }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.pending.shift(); job; job = this.pending.shift()) {
        try { job.status = 'running'; await this.save(job); await this.run(job); }
        catch (error) { job.status = 'failed'; job.error = evidenceText(error instanceof Error ? error.message : 'Automation failed.').slice(0, 2000); }
        await this.save(job);
      }
    } catch { /* Durable queued/running jobs are retried after restart. */ }
    finally { this.running = false; }
  }
  private async run(job: Job) {
    const cfg = await this.config();
    if (!Object.hasOwn(cfg.repositories, job.repository)) throw new Error('Repository grant was removed.');
    const token = this.createClient ? '' : await installationToken(job.repository, cfg.repositories[job.repository].installationId || 0);
    const client = this.createClient?.(job.repository) || new GithubClient(job.repository, { token });
    const current = async () => {
      const value = (await client.request('/pulls/' + job.number)).data as any;
      return value?.state === 'open' && value?.head?.sha === job.head && value?.base?.sha === job.base;
    };
    if (!await current()) { job.status = 'stale'; return; }
    const files = await client.list('/pulls/' + job.number + '/files', 3);
    let raw = '';
    for (const value of files.items) {
      const f = value as any;
      if (typeof f.filename !== 'string') throw new Error('Invalid pull-request file.');
      const old = f.previous_filename || f.filename;
      raw += 'diff --git ' + JSON.stringify('a/' + old) + ' ' + JSON.stringify('b/' + f.filename) + '\n' +
        '--- ' + (f.status === 'added' ? '/dev/null' : JSON.stringify('a/' + old)) + '\n+++ ' +
        (f.status === 'removed' ? '/dev/null' : JSON.stringify('b/' + f.filename)) + '\n' + (typeof f.patch === 'string' ? f.patch + '\n' : '');
      if (Buffer.byteLength(raw) > 5 * 1024 * 1024) throw new Error('Pull-request patch exceeds 5 MB.');
    }
    const diff = { ...parseUnifiedDiff(raw), base: job.base, head: job.head, mode: 'range' as const };
    const report = buildReview(diff, DEFAULT_REVIEW_CONFIG); report.fingerprint = hash(raw + job.head);
    report.coverage.limitations.push('GitHub webhook review uses changed-file patches and does not execute repository code or checks.');
    const incomplete = files.truncated || files.items.some((f: any) => typeof f.patch !== 'string');
    if (incomplete) report.coverage.limitations.push('GitHub omitted patches or file pagination reached its bound. Review coverage is incomplete.');
    job.report = report;
    if (!await current()) { job.status = 'stale'; return; }
    if (cfg.publish) {
      const existing = (await client.request('/commits/' + job.head + '/check-runs?check_name=Onboarder')).data as any;
      const prior = existing?.check_runs?.find((r: any) => r.external_id === job.id);
      const annotations = report.findings.slice(0, 50).map(f => ({ path: f.path, start_line: f.line, end_line: f.line,
        annotation_level: ['critical', 'high'].includes(f.severity) ? 'failure' : f.severity === 'medium' ? 'warning' : 'notice',
        message: f.message + '\n' + f.suggestion }));
      const payload = { name: 'Onboarder', head_sha: job.head, external_id: job.id, status: 'completed',
        conclusion: incomplete ? 'neutral' : report.findings.some(f => ['critical', 'high'].includes(f.severity)) ? 'failure' : 'success',
        output: { title: report.summary, summary: report.coverage.limitations.join('\n') + '\nShowing up to 50 annotations; complete findings are retained in the local receipt.', annotations } };
      // Updating an existing receipt never appends duplicate annotations.
      if (prior) { delete (payload.output as any).annotations; }
      const published = (await client.request(prior ? '/check-runs/' + prior.id : '/check-runs', prior ? 'PATCH' : 'POST', payload)).data as any;
      job.checkId = published?.id;
    }
    job.status = 'completed';
  }
}
export async function handleGithubWebhook(req: IncomingMessage, res: ServerResponse, automation?: GithubAutomation) {
  if (!automation) return sendError(res, 503, 'GitHub automation is not configured.');
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return sendError(res, 415, 'Use application/json.');
  const chunks: Buffer[] = []; let size = 0;
  try {
    for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) return sendError(res, 413, 'Webhook exceeds 1 MB.'); chunks.push(chunk); }
    const raw = Buffer.concat(chunks);
    if (!verifyWebhook(automation.secret, raw, String(req.headers['x-hub-signature-256'] || ''))) return sendError(res, 401, 'Webhook signature is invalid.');
    const result = await automation.accept(String(req.headers['x-github-event'] || ''), JSON.parse(raw.toString('utf8')));
    return sendJSON(res, 202, result);
  } catch (error) { sendError(res, 400, error instanceof Error ? error.message : 'Webhook failed.'); }
}
