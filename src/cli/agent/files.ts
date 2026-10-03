import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const FILE_LIMIT = 128 * 1024;
export const hashText = (text: string) => createHash('sha256').update(text).digest('hex');
export function safeRelative(file: string): string {
  if (!file || file.length > 500 || path.isAbsolute(file) || file.includes('\\') || /[\x00-\x1f]/.test(file)) throw new Error('Use a relative repository file path.');
  const parts = file.split('/');
  if (parts.some(p => !p || p === '..' || p === '.' || ['.git', 'node_modules', '.ssh', '.aws', '.npmrc', '.pypirc', '.netrc', '.git-credentials'].includes(p) || /^\.env(?:\.|$)/.test(p) || /^(?:id_rsa|id_ed25519)$|\.(?:pem|key)$/i.test(p))) throw new Error('This path is outside the agent source-file scope.');
  return file;
}
export async function scopedFile(root: string, file: string, createParents = false): Promise<string> {
  safeRelative(file);
  const canonical = await fs.realpath(root);
  const parts = file.split('/');
  let current = canonical;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      if (createParents && i < parts.length - 1) await fs.mkdir(current);
      else if (i < parts.length - 1) throw new Error('The parent directory does not exist.');
      continue;
    }
    if (stat.isSymbolicLink()) throw new Error('Agent file tools do not follow symbolic links.');
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error('The parent path is not a directory.');
    if (i === parts.length - 1 && !stat.isFile()) throw new Error('The path is not a regular file.');
  }
  return current;
}
async function readBounded(file: string): Promise<string> {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > FILE_LIMIT) throw new Error(`File must be text and at most ${FILE_LIMIT} bytes.`);
    const buffer = Buffer.alloc(FILE_LIMIT + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const read = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (!read.bytesRead) break;
      bytesRead += read.bytesRead;
    }
    if (bytesRead > FILE_LIMIT || buffer.subarray(0, bytesRead).includes(0)) throw new Error('File exceeds the text-file limit or contains binary data.');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}
export async function readAgentFile(root: string, file: string) {
  const content = await readBounded(await scopedFile(root, file));
  return { file, content, sha256: hashText(content), lines: content.split('\n').length };
}
export async function writeAgentFile(root: string, file: string, content: string, expected: string) {
  if (Buffer.byteLength(content) > FILE_LIMIT || content.includes('\0')) throw new Error('New content exceeds the text-file limit.');
  const target = await scopedFile(root, file, true);
  const check = async () => {
    try {
      const current = await readBounded(target);
      if (expected === 'new' || hashText(current) !== expected) throw new Error('The file changed. Read it again before writing.');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' && expected === 'new') return;
      throw e;
    }
  };
  await check();
  const mode = await fs.stat(target).then(s => s.mode & 0o777).catch(() => 0o644);
  const temporary = path.join(path.dirname(target), `.onboarder-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, { mode, flag: 'wx' });
    await check();
    if (expected === 'new') await fs.link(temporary, target);
    else await fs.rename(temporary, target);
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return { file, sha256: hashText(content), bytes: Buffer.byteLength(content) };
}
export async function deleteAgentFile(root: string, file: string, expected: string) {
  const target = await scopedFile(root, file);
  const current = await readBounded(target);
  if (hashText(current) !== expected) throw new Error('The file changed. Read it again before deleting.');
  await fs.unlink(target);
  return { file, deleted: true };
}
