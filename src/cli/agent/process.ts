import { spawn } from 'node:child_process';

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxBytes?: number;
  onLine?: (line: string) => void;
  detached?: boolean;
}
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let safe = text;
  for (const [name, value] of Object.entries(env)) {
    if (value && value.length >= 4 && /(?:TOKEN|KEY|PASSWORD|SECRET)/i.test(name)) safe = safe.split(value).join('[redacted]');
  }
  // Preserve ordinary source expressions such as `token = response.token`.
  // Mask credential literals and environment-style assignments instead.
  return safe
    .replace(/(\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[=:]\s*)(["'])([^\r\n]*?)\2/gi, '$1$2[redacted]$2')
    .replace(/^(\s*[\w-]*(?:api[_-]?key|token|password|secret)[\w-]*\s*=\s*)[^\s]+/gim, '$1[redacted]')
    .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/g, '[redacted]');
}
export function terminalText(text: string): string {
  return text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}
/** Argument arrays, bounded pipes, and process-group cleanup for Hermes and its MCP children. */
export function runProcess(command: string, args: string[], options: ProcessOptions = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const detached = options.detached !== false && process.platform !== 'win32';
    const child = spawn(command, args, { cwd: options.cwd, env: options.env || process.env, shell: false, detached, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', line = '', bytes = 0;
    let failure: Error | null = null;
    let escalation: NodeJS.Timeout | null = null;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      const kill = (signal: NodeJS.Signals) => {
        try {
          if (detached && child.pid) process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch { /* Already exited. */ }
      };
      kill('SIGTERM');
      if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: false });
      escalation = setTimeout(() => kill('SIGKILL'), 1500); escalation.unref();
    };
    const timer = setTimeout(() => stop(new Error('The agent process exceeded its time limit.')), options.timeoutMs || 300_000);
    const abort = () => stop(new Error('Agent run cancelled.'));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    const collect = (chunk: string, isError: boolean) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > (options.maxBytes || 8 * 1024 * 1024)) { stop(new Error('The agent process exceeded its output limit.')); return; }
      const text = chunk;
      if (isError) { stderr += text; return; }
      stdout += text;
      if (options.onLine) {
        line += text;
        let end: number;
        while ((end = line.indexOf('\n')) >= 0) {
          const value = line.slice(0, end); line = line.slice(end + 1);
          try { if (value.trim()) options.onLine(value); } catch (e) { stop(e instanceof Error ? e : new Error(String(e))); return; }
        }
      }
    };
    child.stdout.on('data', chunk => collect(chunk, false));
    child.stderr.on('data', chunk => collect(chunk, true));
    child.stdin.on('error', () => { /* A failed startup can close stdin before the query arrives. */ });
    child.stdin.end(options.input || '');
    const cleanup = () => {
      clearTimeout(timer); if (escalation) clearTimeout(escalation);
      options.signal?.removeEventListener('abort', abort);
    };
    child.on('error', error => { cleanup(); reject(new Error(`Could not start ${command}: ${redact(error.message, options.env)}. Run onboarder agent doctor.`)); });
    child.on('close', code => {
      // A parent can exit before a child that ignored SIGTERM and closed its
      // inherited pipes. Clean the group before clearing the escalation timer.
      if (detached && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Group already gone. */ } }
      cleanup();
      if (!failure && line.trim() && options.onLine) {
        try { options.onLine(line); } catch (e) { failure = e instanceof Error ? e : new Error(String(e)); }
      }
      if (failure) reject(new Error(failure.message + (stderr.trim() ? '\n' + redact(stderr.slice(-2000), options.env) : ''))); else resolve({ code: code ?? 1, stdout, stderr: redact(stderr, options.env) });
    });
  });
}
