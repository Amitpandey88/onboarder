import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { FixStore } from '../../server/fixStore.js';
import { runReview } from '../../server/review.js';
import { proposeFix } from '../../server/fixProposal.js';
export const git = (root, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim();
export const good = 'export function decode(input) {\n  return JSON.parse(input);\n}\n';
export const bad = 'export function decode(input) {\n  return eval("(" + input + ")");\n}\n';
export function proposalResponse(messages, transform) {
  const payload = JSON.parse(messages.at(-1).content.replace(/^UNTRUSTED_FIX_CONTEXT_JSON\n/, ''));
  const file = payload.editableFiles.find(f => f.path === 'codec.js');
  const value = { schemaVersion: 1, edits: [{ path: file.path, beforeHash: file.beforeHash, after: good }], rationale: 'Use the JSON parser; object literals and executable expressions must be rejected.',
    sideEffects: ['Non-JSON JavaScript expressions are rejected.'], affectedDependencies: ['consumer.js uses decode.'], breakingChanges: ['Callers supplying JavaScript object literals must supply valid JSON.'],
    tests: ['Run codec.test.js to check valid JSON and rejected JavaScript object literals.'], risk: 'low', investigationRequired: false };
  return { text: JSON.stringify(transform ? transform(value, payload) : value), inputTokens: 200, outputTokens: 100 };
}
export async function fixFixture(t, options = {}) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'onboarder-fix-')); t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'repo'); await mkdir(root);
  await writeFile(path.join(root, 'codec.js'), good);
  await writeFile(path.join(root, 'consumer.js'), 'import { decode } from "./codec.js";\nexport const request = text => decode(text);\n');
  await writeFile(path.join(root, 'codec.test.js'), 'import {test} from "node:test"; import assert from "node:assert/strict"; import {request} from "./consumer.js";\ntest("JSON contract", () => {assert.deepEqual(request(\'{"ok":true}\'), {ok:true}); assert.throws(() => request("{ok: true}"));});\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test codec.test.js', ...(options.scripts || {}) } }));
  git(root, 'init', '-q', '-b', 'main'); git(root, 'add', '.'); git(root, '-c', 'user.name=Fix fixture', '-c', 'user.email=fix@example.invalid', 'commit', '-qm', 'base');
  await writeFile(path.join(root, 'codec.js'), bad);
  const store = new FixStore(path.join(parent, 'agent')), owner = 'fixture-owner', identity = { root, store, owner };
  const report = await runReview(root, { mode: 'working', base: 'HEAD' }); const finding = report.findings.find(f => f.path === 'codec.js');
  if (!finding) throw new Error('The real deterministic reviewer must detect the fixture.');
  const propose = (extra = {}) => proposeFix(root, owner, report, finding.id, { store, complete: async messages => proposalResponse(messages), ...extra });
  return { parent, root, store, owner, identity, report, finding, propose };
}
