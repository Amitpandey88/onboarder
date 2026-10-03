import type { AgentEvent } from './contracts.js';

/** Only documented Hermes JSONL frames count as progress or completion. */
export function parseAgentEvent(line: string): AgentEvent {
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw new Error('Hermes returned malformed structured output. Run agent doctor to check compatibility.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Hermes event.');
  const frame = value as Record<string, unknown>;
  if (!['system', 'text', 'tool_use', 'tool_result', 'result'].includes(String(frame.type))) throw new Error('Unknown Hermes event type.');
  for (const key of ['text', 'name', 'session_id', 'error']) if (frame[key] !== undefined && typeof frame[key] !== 'string') throw new Error(`Invalid Hermes ${key}.`);
  if (frame.session_id !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(frame.session_id as string)) throw new Error('Invalid Hermes session ID.');
  if (frame.type === 'result' && (!Number.isInteger(frame.exit_code) || typeof frame.text !== 'string')) throw new Error('Hermes completion requires text and an exit code.');
  if (frame.tokens !== undefined && (!frame.tokens || typeof frame.tokens !== 'object' || Array.isArray(frame.tokens) || Object.values(frame.tokens).some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0))) throw new Error('Invalid Hermes token usage.');
  return frame as unknown as AgentEvent;
}
