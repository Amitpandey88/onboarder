import { promises as fs } from 'node:fs';
import path from 'node:path';

// Runtime smoke tests must not source the host's nvm/asdf/login configuration.
// Keep the real PTY and interactive login shell, with a fixture-owned launcher.
// Production continues to use the user's chosen shell and normal profiles.
export async function testShell(directory) {
  const launcher = path.join(directory, 'test-shell');
  await fs.writeFile(launcher, '#!/bin/sh\nexec /bin/bash --noprofile --norc "$@"\n', { mode: 0o700 });
  return launcher;
}
