import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

/** Exercise production fuses intact: connect only to an explicitly requested CDP port. */
export async function launchPackaged(executablePath, args, env) {
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  // An unattended runner cannot answer macOS's first-use cookie Keychain prompt.
  // Electron uses this test-only switch too; production fuses and app startup
  // remain untouched. Real Keychain behavior needs an interactive signed build.
  const keychain = process.env.CI ? ['--use-mock-keychain'] : [];
  const child = spawn(executablePath, [...keychain, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', ...args], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let diagnostics = '';
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-16384); });
  let browser;
  try {
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('The packaged application exited before opening.');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(500) });
        const targets = response.ok ? await response.json() : [];
        // Electron exposes its browser debugging socket before a repository's
        // persistent session has a page target. Attaching in that interval can
        // leave Playwright with an empty context even after the page is running.
        if (targets.some(target => target.type === 'page' && target.url.startsWith('onboarder://workspace/'))) {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!browser) throw new Error('The packaged app did not open its test debugging port.');
    // Repository sessions can appear in different CDP contexts. Do not capture
    // the initial empty default context or depend on a page event arriving after
    // the CDP attachment has finished.
    const pages = () => browser.contexts().flatMap(context => context.pages());
    const windowAfter = async (existing = new Set()) => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const page = pages().find(candidate => !existing.has(candidate));
        if (page) return page;
        if (child.exitCode !== null || child.signalCode !== null) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) }).then(response => response.json()).catch(() => []);
      throw new Error('No packaged application window was available.\n' + JSON.stringify({ exitCode: child.exitCode, signalCode: child.signalCode, contexts: browser.contexts().length, pages: pages().map(page => page.url()), targets }) + '\nPackaged startup diagnostics:\n' + diagnostics);
    };
    return {
      packaged: true, process: () => child,
      firstWindow: () => windowAfter(),
      windows: pages,
      waitForEvent: () => windowAfter(new Set(pages())),
      async close() { child.kill('SIGTERM'); if (child.exitCode === null && child.signalCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await browser.close().catch(() => {}); /* Backend disconnect cleanup can finish after its parent exits. */ await new Promise(resolve => setTimeout(resolve, 1500)); },
    };
  } catch (error) { child.kill('SIGKILL'); throw new Error(error.message + '\nPackaged startup diagnostics:\n' + diagnostics, { cause: error }); }
}
