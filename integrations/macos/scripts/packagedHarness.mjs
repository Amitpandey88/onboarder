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
      if (child.exitCode !== null) throw new Error('The packaged application exited before opening.');
      try { const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) }); if (response.ok) { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!browser) throw new Error('The packaged app did not open its test debugging port.');
    const context = browser.contexts()[0];
    return {
      packaged: true, process: () => child,
      firstWindow: async () => {
        try { return context.pages()[0] || await context.waitForEvent('page', { timeout: 60000 }); }
        catch (error) { throw new Error(error.message + '\nPackaged startup diagnostics:\n' + diagnostics, { cause: error }); }
      },
      windows: () => context.pages(),
      waitForEvent: () => context.waitForEvent('page'),
      async close() { child.kill('SIGTERM'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]); if (child.exitCode === null) child.kill('SIGKILL'); await browser.close().catch(() => {}); /* Backend disconnect cleanup can finish after its parent exits. */ await new Promise(resolve => setTimeout(resolve, 1500)); },
    };
  } catch (error) { child.kill('SIGKILL'); throw new Error(error.message + '\nPackaged startup diagnostics:\n' + diagnostics, { cause: error }); }
}
