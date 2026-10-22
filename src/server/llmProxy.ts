// Forwards chat-completion requests to any OpenAI-compatible endpoint and
// streams the answer straight back. The API key passes through in memory
// only — it is never written anywhere, and never appears in logs.

import { sendError, sendJSON } from './http.js';
import { evidenceText } from './intelligence/workspace.js';
import { once } from 'node:events';

const UPSTREAM_TIMEOUT_MS = 60_000;
const MAX_MESSAGES_BYTES = 120_000;

const EXTRA_ALLOWED = new Set(['reasoning', 'temperature', 'top_p', 'presence_penalty', 'frequency_penalty']);

export function detectProvider(apiKey, baseUrl) {
  if (apiKey?.startsWith('sk-ant-')) return 'anthropic';
  if (apiKey?.startsWith('AIza')) return 'gemini';
  return 'openai';
}

// Extracts the provider's request id from an upstream response. Each
// provider spells it differently; the order in this list is "what we have
// seen", not "what is correct" — a missing id is fine and collapses to
// null. The function is pure and exported for tests; the `headers` argument
// is anything with a `.get(name)` method, which both `Response.headers` and
// a hand-rolled plain object can satisfy in the test suite.
export function extractRequestId(headers) {
  if (!headers || typeof headers.get !== 'function') return null;
  return headers.get('x-request-id')
    || headers.get('request-id')
    || headers.get('x-amzn-requestid')
    || headers.get('x-goog-request-id')
    || null;
}

export function buildChatRequest(body: Record<string, any>, stream = false) {
  const { baseUrl, apiKey, model, messages } = body;
  const maxTokens = Math.min(Number(body.max_tokens) || 700, 4096);
  const provider = detectProvider(apiKey, baseUrl);

  let url;
  let headers: Record<string, string> = { 'content-type': 'application/json' };
  let payload: Record<string, unknown> = { stream };
  let isAzure = false;
  try { isAzure = /\.(?:openai\.azure\.com|cognitiveservices\.azure\.com)$/i.test(new URL(baseUrl).hostname); } catch {}

  if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    
    let system = '';
    const anthropicMessages = [];
    for (const m of messages) {
      if (m.role === 'system') system += m.content + '\n';
      else anthropicMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
    }
    payload = {
      model,
      max_tokens: maxTokens,
      messages: anthropicMessages,
      system: system.trim() || undefined,
      stream
    };
  } else if (provider === 'gemini') {
    const streamSuffix = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${streamSuffix}${stream ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
    
    let system_instruction = null;
    const contents = [];
    for (const m of messages) {
      if (m.role === 'system') {
        system_instruction = { parts: [{ text: m.content }] };
      } else {
        contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
      }
    }
    payload = {
      contents,
      system_instruction,
      generationConfig: { maxOutputTokens: maxTokens }
    };
  } else {
    // OpenAI default
    if (!baseUrl || !/^https?:\/\/\S+$/.test(baseUrl)) {
      throw new Error('A valid AI base URL is needed.');
    }
    const endpoint = new URL(baseUrl);
    if (endpoint.username || endpoint.password || endpoint.hash) throw new Error('Use an AI endpoint without URL credentials or fragments.');
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/chat/completions';
    url = endpoint.href;
    if (apiKey) {
      if (isAzure) headers['api-key'] = apiKey;
      else headers.authorization = 'Bearer ' + apiKey;
    }
    payload = { model, messages, stream };
    if (isAzure) payload.max_completion_tokens = maxTokens;
    else payload.max_tokens = maxTokens;
    for (const key of Object.keys(body)) {
      if (EXTRA_ALLOWED.has(key)) payload[key] = body[key];
    }
  }

  return { url, headers, payload, provider };
}

/** Bounded non-streaming adapter shared by contextual review and configured providers. */
export async function completeChat(body: Record<string, any>, options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}) {
  if (typeof body.model !== 'string' || !body.model.trim() || body.model.length > 200 ||
    !Array.isArray(body.messages) || body.messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') ||
    Buffer.byteLength(JSON.stringify(body.messages)) > MAX_MESSAGES_BYTES) throw new Error('AI review needs a configured model and bounded text messages.');
  if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length > 4096)) throw new Error('Invalid AI credential format.');
  const { url, headers, payload, provider } = buildChatRequest(body, false);
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use an HTTP(S) AI endpoint without URL credentials.');
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  let response: Response;
  try { response = await (options.fetchImpl || fetch)(url, { method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error', signal }); }
  catch (error) { if (signal.aborted) signal.throwIfAborted(); throw new Error('Could not reach the AI provider. Check its endpoint and connection.'); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error('AI provider returned HTTP ' + response.status + '. Check its authentication, model and usage limits.'); }
  if (Number(response.headers.get('content-length')) > 262144) { await response.body?.cancel().catch(() => {}); throw new Error('AI response exceeds 256 KB.'); }
  const reader = response.body?.getReader(); let text = '', bytes = 0; const decoder = new TextDecoder();
  if (!reader) throw new Error('AI provider returned no response body.');
  try {
    for (;;) { signal.throwIfAborted(); const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength;
      if (bytes > 262144) throw new Error('AI response exceeds 256 KB.'); text += decoder.decode(value, { stream: true }); }
    text += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  let json: any; try { json = JSON.parse(text); } catch { throw new Error('AI provider returned an unreadable response.'); }
  const content = provider === 'anthropic' ? json.content?.filter(p => p.type === 'text').map(p => p.text).join('') :
    provider === 'gemini' ? json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') : json.choices?.[0]?.message?.content;
  const answer = Array.isArray(content) ? content.map(p => p.text || '').join('') : content;
  if (typeof answer !== 'string' || !answer.trim() || Buffer.byteLength(answer) > 131072) throw new Error('AI provider returned empty or oversized review content.');
  const inputTokens = provider === 'anthropic' ? json.usage?.input_tokens : provider === 'gemini' ? json.usageMetadata?.promptTokenCount : json.usage?.prompt_tokens;
  const outputTokens = provider === 'anthropic' ? json.usage?.output_tokens : provider === 'gemini' ? json.usageMetadata?.candidatesTokenCount : json.usage?.completion_tokens;
  const truncated = json.choices?.[0]?.finish_reason === 'length' || json.stop_reason === 'max_tokens' || json.candidates?.[0]?.finishReason === 'MAX_TOKENS';
  return { text: answer, truncated, ...(Number.isSafeInteger(inputTokens) && inputTokens >= 0 ? { inputTokens } : {}),
    ...(Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? { outputTokens } : {}) };
}

/** Redact strings individually so source-oriented masking cannot corrupt JSON/SSE framing. */
function publicChatValue(value: any, credential: string, depth = 0): any {
  if (depth > 40) throw new Error('AI response nesting exceeds its limit.');
  if (typeof value === 'string') {
    let text = value;
    if (credential) text = text.split(credential).join('[credential redacted]');
    return evidenceText(text);
  }
  if (Array.isArray(value)) return value.map(v => publicChatValue(v, credential, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, publicChatValue(v, credential, depth + 1)]));
  return value;
}
export async function proxyChat(res, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(res, 400, 'Provide AI connection settings and text messages.');
  if (typeof body.model !== 'string' || !body.model.trim() || body.model.length > 200 ||
    !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 200 ||
    body.messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') ||
    body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length > 4096) ||
    body.max_tokens !== undefined && (!Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1)) return sendError(res, 400, 'Provide a model, valid text messages and bounded connection settings.');
  if (Buffer.byteLength(JSON.stringify(body.messages)) > MAX_MESSAGES_BYTES) return sendError(res, 413, 'That prompt is too large. Try a smaller file.');
  const credential = body.apiKey || '', stream = body.stream !== false;
  let request;
  try {
    const messages = publicChatValue(body.messages, credential);
    if (Buffer.byteLength(JSON.stringify(messages)) > MAX_MESSAGES_BYTES) return sendError(res, 413, 'Redacted prompt exceeds its byte limit.');
    request = buildChatRequest({ ...body, messages }, stream);
  } catch { return sendError(res, 400, 'Use a valid HTTP(S) AI endpoint without URL credentials.'); }
  const abort = new AbortController(), signal = AbortSignal.any([abort.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]);
  let disconnected = false, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const close = () => { if (!res.writableEnded) { disconnected = true; abort.abort(); } }; res.once('close', close);
  try {
    const upstream = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.payload), redirect: 'error', signal });
    signal.throwIfAborted();
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      const requestId = publicChatValue(extractRequestId(upstream.headers) || '', credential).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
      return sendJSON(res, upstream.status >= 400 ? upstream.status : 502, { error: `The provider answered ${upstream.status}.`,
        detail: 'Check the provider authentication, model and usage limits. Private upstream diagnostics were withheld.', ...(requestId ? { requestId } : {}) });
    }
    const limit = stream ? 2 * 1024 * 1024 : 262144;
    if (Number(upstream.headers.get('content-length')) > limit) { await upstream.body?.cancel().catch(() => {}); throw new Error('AI response exceeds its byte limit.'); }
    reader = upstream.body?.getReader(); if (!reader) throw new Error('AI provider returned no response body.');
    let buffer = '', bytes = 0, emittedBytes = 0; const decoder = new TextDecoder();
    if (stream) res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
    const emit = async (frame: string) => {
      signal.throwIfAborted();
      if (res.writableLength > 512 * 1024) throw new Error('AI client is receiving output too slowly.');
      const clean = frame.split('\n').map(line => {
        if (!line.startsWith('data:')) return line.startsWith('event:') ? line : '';
        const data = line.slice(5).trim();
        return data === '[DONE]' ? 'data: [DONE]' : 'data: ' + JSON.stringify(publicChatValue(JSON.parse(data), credential));
      }).join('\n') + '\n\n';
      emittedBytes += Buffer.byteLength(clean);
      if (emittedBytes > limit) throw new Error('Redacted AI response exceeds its byte limit.');
      if (!res.write(clean)) await once(res, 'drain', { signal });
    };
    for (;;) {
      const part = await reader.read(); signal.throwIfAborted();
      if (part.done) break; bytes += part.value.byteLength;
      if (bytes > limit) throw new Error('AI response exceeds its byte limit.');
      buffer += decoder.decode(part.value, { stream: true });
      if (stream) {
        buffer = buffer.replace(/\r\n/g, '\n'); const frames = buffer.split('\n\n'); buffer = frames.pop()!;
        for (const frame of frames) if (frame.trim()) await emit(frame);
        if (Buffer.byteLength(buffer) > 262144) throw new Error('AI event frame exceeds its limit.');
      }
    }
    buffer += decoder.decode();
    if (!stream) {
      const value = publicChatValue(JSON.parse(buffer), credential);
      if (Buffer.byteLength(JSON.stringify(value)) > limit) throw new Error('Redacted AI response exceeds its byte limit.');
      return sendJSON(res, 200, value);
    }
    if (buffer.trim()) await emit(buffer);
    res.end();
  } catch {
    if (!disconnected) {
      const message = signal.aborted ? 'The AI provider timed out; its answer is incomplete.' : 'AI provider request failed or exceeded its response limit. Check the connection and retry.';
      if (res.headersSent) { res.write('data: ' + JSON.stringify({ error: message }) + '\n\n'); res.end(); }
      else sendError(res, 502, message);
    }
  } finally { res.off('close', close); await reader?.cancel().catch(() => {}); abort.abort(); }
}
