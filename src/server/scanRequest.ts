import type { ScanRequest, ScanRequestOptions } from '../shared/contracts.js';
import { normalizeScanOptions } from '../shared/analyzer/scanControl.js';

/** Validate untrusted JSON before touching the filesystem or cloning anything. */
export function parseScanRequest(value: unknown): ScanRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Send a path, a gitUrl, or { demo: true }.');
  }
  const body = value as Record<string, unknown>;
  const sources = [body.path !== undefined, body.gitUrl !== undefined, body.demo === true].filter(Boolean).length;
  if (sources === 0) throw new TypeError('Send a path, a gitUrl, or { demo: true }.');
  if (sources !== 1) throw new TypeError('Send exactly one path, gitUrl, or { demo: true }.');
  const options: ScanRequestOptions = {};
  if (body.options !== undefined) {
    if (!body.options || typeof body.options !== 'object' || Array.isArray(body.options)) {
      throw new TypeError('Scan options must be an object.');
    }
    const input = body.options as Record<string, unknown>;
    for (const key of ['maxFiles', 'maxFileSize', 'readConcurrency'] as const) {
      if (input[key] === undefined) continue;
      if (typeof input[key] !== 'number') throw new TypeError(`${key} must be a number.`);
      options[key] = input[key];
    }
    normalizeScanOptions(options);
  }
  if (body.demo === true) return { demo: true, options };
  if (typeof body.path === 'string' && body.path.trim()) return { path: body.path.trim(), options };
  if (typeof body.gitUrl === 'string' && body.gitUrl.trim()) return { gitUrl: body.gitUrl.trim(), options };
  throw new TypeError('The path or gitUrl must be a non-empty string.');
}
