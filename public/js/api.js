// Server round-trips. Thin and honest: JSON in, JSON (or an SSE stream) out,
// server error messages surfaced untouched.

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* error path handled below with a generic message */
  }
  if (!res.ok) {
    throw new Error(data?.error || `The server said ${res.status}.`);
  }
  return data;
}

export function scanOnServer(payload) {
  return postJSON('/api/scan', payload);
}

export async function cleanupClone(cloneId) {
  try {
    await fetch('/api/scan/' + encodeURIComponent(cloneId), { method: 'DELETE' });
  } catch {
    /* best-effort: the temp dir expires on its own eventually */
  }
}

export async function fetchFileText(scanId, path) {
  const res = await fetch('/api/file?scan=' + encodeURIComponent(scanId) + '&path=' + encodeURIComponent(path));
  if (!res.ok) throw new Error('Could not read that file from the server.');
  return res.text();
}

// Streams an OpenAI-compatible chat completion through the local proxy.
// Yields text deltas as they arrive; throws with the provider's message on
// a non-200 from upstream.
export async function* streamExplain({ baseUrl, apiKey, model, messages, maxTokens = 1200, providerOptions = {} }) {
  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey, model, messages, stream: true, max_tokens: maxTokens, ...providerOptions }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data.detail || data.error || '';
    } catch {
      /* keep the generic line */
    }
    throw new Error(detail || `The provider said ${res.status}.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop();
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          /* a partial JSON frame — the next chunk completes it */
        }
      }
    }
  }
}
