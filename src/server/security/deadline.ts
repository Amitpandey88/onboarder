/** Keep a CLI operation alive until its deadline; AbortSignal.timeout is unref'ed on Node 20. */
export function operationDeadline(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Operation timed out.', 'TimeoutError')), timeoutMs);
  return { signal: parent ? AbortSignal.any([parent, controller.signal]) : controller.signal,
    dispose: () => clearTimeout(timer) };
}
