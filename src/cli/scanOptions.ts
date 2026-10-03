import type { ScanRequestOptions } from '../shared/contracts.js';
import { normalizeScanOptions } from '../shared/analyzer/scanControl.js';

export function scanOptionsFromFlags(flags: Record<string, unknown>): ScanRequestOptions {
  const options: ScanRequestOptions = {};
  for (const key of ['maxFiles', 'maxFileSize', 'readConcurrency'] as const) {
    if (flags[key] !== undefined) options[key] = Number(flags[key]);
  }
  normalizeScanOptions(options);
  return options;
}
