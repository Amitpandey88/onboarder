// Forwards chat-completion requests to any OpenAI-compatible endpoint and
// streams the answer straight back. The API key passes through in memory
// only — it is never written anywhere, and never appears in logs.

import { sendError, sendJSON } from './http.js';

const UPSTREAM_TIMEOUT_MS = 60_000;
const MAX_MESSAGES_BYTES = 120_000;

// Only these extra request fields pass through to the provider — a guard
// against the client smuggling anything unexpected into the body.
const EXTRA_ALLOWED = new Set(['reasoning', 'temperature', 'top_p', 'presence_penalty', 'frequency_penalty']);

export async function proxyChat(res, body) {
  const { baseUrl, apiKey, model, messages } = body || {};
  const stream = body.stream !== false;
  const maxTokens = Math.min(Number(body.max_tokens) || 700, 4096);

  if (!baseUrl || !/^https?:\/\/\S+$/.test(baseUrl)) {
    return sendError(res, 400, 'A valid base URL is needed — something like https://api.openai.com/v1.');
  }
  if (!model || typeof model !== 'string') {
    return sendError(res, 400, 'A model name is needed.');
  }
  if (!Array.isArray(messages) || !messages.length) {
    return sendError(res, 400, 'No messages to send.');
  }
  if (JSON.stringify(messages).length > MAX_MESSAGES_BYTES) {
    return sendError(res, 413, 'That prompt is too large. Try a smaller file.');
  }

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'content-type': 'application/json' };
  const isAzure = /\.openai\.azure\.com|\.cognitiveservices\.azure\.com/i.test(baseUrl);
  if (apiKey) {
    // Azure OpenAI authenticates with `api-key`; everyone else gets Bearer.
    if (isAzure) headers['api-key'] = apiKey;
    else headers.authorization = 'Bearer ' + apiKey;
  }

  const payload = { model, messages, stream };
  // gpt-5-class models (Azure's current crop) only take the newer field.
  if (isAzure) payload.max_completion_tokens = maxTokens;
  else payload.max_tokens = maxTokens;
  for (const key of Object.keys(body)) {
    if (EXTRA_ALLOWED.has(key)) payload[key] = body[key];
  }

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const why = err.name === 'TimeoutError' ? 'The endpoint took too long to answer.' : 'Could not reach ' + baseUrl + '.';
    return sendError(res, 502, why);
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || detail;
    } catch {
      /* plain text it is */
    }
    return sendJSON(res, upstream.status, {
      error: `The provider answered ${upstream.status}.`,
      detail,
    });
  }

  if (!stream) {
    const json = await upstream.json().catch(() => null);
    return sendJSON(res, 200, json || {});
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.on('close', () => upstream.body?.cancel().catch(() => {}));

  try {
    for await (const chunk of upstream.body) {
      if (!res.write(chunk)) await new Promise((r) => res.once('drain', r));
    }
  } catch {
    /* client walked away mid-stream; nothing to do */
  }
  res.end();
}
