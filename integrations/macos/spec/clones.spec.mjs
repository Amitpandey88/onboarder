import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCloneProgress, cloneRepository, TemporaryProjects } from '../src/clones.mjs';

test('clone progress comes from Git phases and survives carriage-return output', () => {
  assert.deepEqual(parseCloneProgress('Receiving objects: 50% (5/10), 2.0 MiB'), { phase: 'Downloading repository', percent: 53, detail: 'Receiving objects: 50% (5/10), 2.0 MiB' });
  assert.equal(parseCloneProgress('remote: Counting objects: 100% (10/10), done.').percent, 15);
  assert.equal(parseCloneProgress('Resolving deltas: 100% (5/5), done.').percent, 94);
  assert.equal(parseCloneProgress('private unrelated diagnostic'), null);
});
test('managed temporary projects are removed while unknown directories and symlinks remain untouched', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-temporary-'));
  try {
    const manager = new TemporaryProjects(path.join(dir, 'managed'));
    const root = await manager.create(); await fs.mkdir(root); await fs.writeFile(path.join(root, 'changes.txt'), 'fixture edits');
    const outside = path.join(dir, 'permanent'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'keep.txt'), 'keep');
    assert.equal(await manager.remove(outside), false);
    const impostor = path.join(manager.directory, 'project-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); await fs.symlink(outside, impostor);
    await fs.mkdir(path.join(manager.directory, 'unrecognized'));
    const malformed = path.join(manager.directory, 'project-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); await fs.mkdir(malformed); await fs.writeFile(path.join(malformed, '.owner.json'), '{bad');
    await manager.sweep();
    await assert.rejects(fs.stat(root), /ENOENT/); assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
    assert.ok((await fs.lstat(impostor)).isSymbolicLink()); assert.ok((await fs.stat(malformed)).isDirectory());
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('real process progress, cancellation and destination protection use private staging', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onboarder-clone-progress-'));
  try {
    const bin = path.join(dir, 'bin'); await fs.mkdir(bin);
    await fs.writeFile(path.join(bin, 'git'), '#!/bin/sh\nfor argument do destination="$argument"; done\nprintf "Receiving objects: 50%% (5/10)\\rResolving deltas: 100%% (5/5)\\n" >&2\nmkdir "$destination"\nprintf fixture > "$destination/README.md"\n', { mode: 0o700 });
    const events = [], destination = path.join(dir, 'permanent');
    const env = { PATH: bin + ':/usr/bin:/bin' };
    await cloneRepository({ url: 'https://example.invalid/repo.git', destination }, { env, emit: value => events.push(value) });
    assert.ok(events.some(value => value.percent === 53)); assert.ok(events.some(value => value.percent === 100));
    assert.equal(await fs.readFile(path.join(destination, 'README.md'), 'utf8'), 'fixture');
    await assert.rejects(cloneRepository({ url: 'https://example.invalid/repo.git', destination }, { env }), /already exists/);
    await fs.writeFile(path.join(bin, 'git'), '#!/bin/sh\ntrap "exit 130" TERM\nsleep 30\n', { mode: 0o700 });
    const operations = new Map(); const cancelled = cloneRepository({ url: 'https://example.invalid/repo.git', destination: path.join(dir, 'cancelled'), operationId: 'cancel-test' }, { env, operations });
    const rejected = assert.rejects(cancelled, /cancelled/);
    const deadline = Date.now() + 5000; while (!operations.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    operations.get('cancel-test')(); await rejected;
    assert.ok(!(await fs.readdir(dir)).some(name => name.startsWith('.onboarder-clone-')));
    assert.equal(await fs.readFile(path.join(destination, 'README.md'), 'utf8'), 'fixture');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
