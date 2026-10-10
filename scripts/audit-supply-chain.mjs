import os from 'node:os';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isolatedEnvironment } from '../server/security/environment.js';
import { assessAudit } from './audit-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const exceptions = JSON.parse(await readFile(path.join(root, 'security/vendor/advisory-exceptions.json'), 'utf8'));
let blocked = false;
const temporary = await mkdtemp(path.join(os.tmpdir(), 'onboarder-audit-'));
try {
  for (const [label, prefix] of [['Development dependencies', root], ['Vendored browser dependencies', path.join(root, 'security/vendor')]]) {
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json', '--ignore-scripts', '--registry=https://registry.npmjs.org/', '--prefix', prefix], { cwd: root, env: isolatedEnvironment(process.env, [], temporary), encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024, shell: process.platform === 'win32' });
    if (result.error || ![0, 1].includes(result.status)) throw new Error('npm audit failed: ' + (result.error?.message || result.stderr));
    const lock = JSON.parse(await readFile(path.join(prefix, 'package-lock.json'), 'utf8'));
    const versions = Object.fromEntries(Object.entries(lock.packages).filter(([name]) => name.startsWith('node_modules/')).map(([name, item]) => [name.slice('node_modules/'.length), item.version]));
    if (!result.stdout.trim()) throw new Error('Empty npm audit response: ' + result.stderr);
    const report = JSON.parse(result.stdout);
    if (!report.metadata) throw new Error(`Incomplete npm audit response for ${label}: ${report.error?.code || 'unknown'} ${report.error?.summary || ''}`);
    const assessment = assessAudit(report, prefix === root ? [] : exceptions, versions);
    console.log(`${label}: ${assessment.blocked.length} unaccepted advisories, ${assessment.allowed.length} tracked advisories.`);
    for (const item of assessment.allowed) console.warn(`KNOWN ${item.severity}: ${item.name} — ${item.url}; review by ${item.exception.expires}. ${item.exception.reason}`);
    for (const item of assessment.blocked) console.error(`BLOCKED ${item.severity || 'unknown'}: ${item.name} — ${item.url}`);
    blocked ||= assessment.blocked.length > 0;
  }
  if (blocked) process.exitCode = 1;

} finally { await rm(temporary, { recursive: true, force: true }); }
