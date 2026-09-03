const levels = { debug: 0, info: 1, warn: 2, error: 3 };

export function createLogger(level = process.env.LOG_LEVEL || 'info') {
  const minLevel = levels[level] ?? levels.info;
  
  function log(lvl, msg, extra = {}) {
    if (levels[lvl] < minLevel) return;
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      ...extra
    };
    const out = JSON.stringify(entry) + '\\n';
    if (lvl === 'warn' || lvl === 'error') {
      process.stderr.write(out);
    } else {
      process.stdout.write(out);
    }
  }

  return {
    debug: (msg, extra) => log('debug', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    http: (req) => log('info', 'HTTP Request', req)
  };
}
