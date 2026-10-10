import { createHash, timingSafeEqual } from 'node:crypto';

export interface DownloadArtifact {
  url: string;
  sha256: string;
  maxBytes: number;
  redirectOrigins?: readonly string[];
}

/** Download data only: every redirect and byte is checked before a caller can execute it. */
export async function verifiedDownload(artifact: DownloadArtifact, signal?: AbortSignal, download: typeof fetch = fetch): Promise<Buffer> {
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.maxBytes) || artifact.maxBytes < 1) {
    throw new Error('Invalid download integrity policy.');
  }
  const original = new URL(artifact.url);
  const origins = new Set([original.origin, ...(artifact.redirectOrigins || [])]);
  const validate = (url: URL) => {
    if (url.protocol !== 'https:' || url.username || url.password || !origins.has(url.origin)) {
      throw new Error('Download URL or redirect is not trusted.');
    }
  };
  const boundedSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60_000)]);
  let url = original, response: Response;
  for (let hop = 0; ; hop++) {
    boundedSignal.throwIfAborted();
    validate(url);
    response = await download(url.href, { redirect: 'manual', signal: boundedSignal });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    if (hop >= 3 || !response.headers.get('location')) throw new Error('Too many or invalid download redirects.');
    url = new URL(response.headers.get('location')!, url);
  }
  if (response.url) validate(new URL(response.url));
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Could not download verified artifact (HTTP ${response.status}).`); }
  const length = Number(response.headers.get('content-length'));
  if (length > artifact.maxBytes) { await response.body?.cancel(); throw new Error('Download exceeds the size limit.'); }
  if (!response.body) throw new Error('Download is empty.');
  const reader = response.body.getReader(), chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      boundedSignal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > artifact.maxBytes) throw new Error('Download exceeds the size limit.');
      chunks.push(Buffer.from(chunk.value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  boundedSignal.throwIfAborted();
  if (!bytes) throw new Error('Download is empty.');
  const data = Buffer.concat(chunks);
  if (!timingSafeEqual(createHash('sha256').update(data).digest(), Buffer.from(artifact.sha256, 'hex'))) {
    throw new Error('Download integrity check failed (SHA-256 mismatch). Nothing was executed.');
  }
  return data;
}
