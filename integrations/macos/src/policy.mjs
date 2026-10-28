import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export const APP_ORIGIN = 'onboarder://workspace';
export function trustedSender(event) {
  return Boolean(event.senderFrame && event.senderFrame === event.sender.mainFrame && event.senderFrame.url.startsWith(APP_ORIGIN + '/'));
}
export function text(value, max = 4096) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error('Invalid text argument.');
  return value;
}
export function projectPath(value, home, cwd = home) {
  const input = text(value);
  if (!input.trim()) throw new Error('Choose a repository folder.');
  return input === '~' ? home : input.startsWith('~/') ? path.join(home, input.slice(2)) : path.resolve(cwd, input);
}
export function endpointId(endpoint) {
  const url = new URL(text(endpoint));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS provider URL without embedded credentials.');
  return url.href.replace(/\/+$/, '');
}
export function externalURL(value) {
  const url = new URL(text(value));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('This link cannot be opened.');
  return url.href;
}
export function assetPath(base, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const resolved = path.resolve(base, '.' + decoded);
  return resolved.startsWith(path.resolve(base) + path.sep) ? resolved : null;
}
export function validToken(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && a.length >= 32 && timingSafeEqual(a, b);
}
export function terminalInput(action, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid terminal request.');
  if (!['create', 'write', 'resize', 'close'].includes(action)) throw new Error('Unknown terminal action.');
  if (action === 'create') {
    if (!['chat', 'shell'].includes(input.kind)) throw new Error('Unknown terminal kind.');
  } else if (!/^[a-f0-9-]{36}$/.test(input.id || '')) throw new Error('Invalid terminal id.');
  if (action === 'write') text(input.data, 65536);
  if (action === 'resize' || action === 'create') for (const [key, max] of [['cols', 500], ['rows', 200]]) {
    if (!Number.isInteger(input[key]) || input[key] < 2 || input[key] > max) throw new Error('Invalid terminal size.');
  }
  return input;
}
