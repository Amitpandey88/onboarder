// The orchestrator: detect what is on the machine, run each available analyzer
// against the scanned root, and hand back one normalized report.
//
// Two promises drive the shape. First, detection is *honest*: the report always
// lists every tool and whether it ran, so "no security issues" and "no security
// tool installed" are never the same sentence. Second, failure is *local*: a
// tool that hangs, crashes or prints garbage fails its own pass and nothing
// else — the scan the person asked for already succeeded, and this is a bonus
// layer over it, exactly the way `collectHistory` treats git.

import fs from 'node:fs';
import { isolatedEnvironment } from '../security/environment.js';
import os from 'node:os';
import path from 'node:path';

import { emptyPass, runTool, toolArgv, TOOL_TIMEOUT_MS } from '../tools.js';
import { defaultOptions, sanitizeOptions, TOOL_DEFS } from './registry.js';
import { mergeFindings } from './parse.js';

// What is installed, for the UI's "engines" panel. Detection is cached by
// `which`, so asking is cheap. The payload also carries each tool's option
// schema and defaults, so the GUI can render a form for what the engine
// actually offers without hard-coding a flag anywhere in the front end.
export function toolsStatus() {
  const out: Record<string, any> = {};
  for (const def of TOOL_DEFS) {
    const resolved = toolArgv(def, '.');
    out[def.id] = {
      id: def.id,
      label: def.label,
      kind: def.kind,
      purpose: def.purpose,
      available: !!resolved,
      how: resolved ? resolved.how : null,
      command: resolved ? resolved.display : null,
      reason: resolved ? null : unavailableReason(def),
      options: def.options || [],
      defaults: defaultOptions(def),
      installable: true,
      platform: process.platform,
    };
  }
  return out;
}

function unavailableReason(def) {
  return (def.install && def.install.length) ? def.install.join(' ') : 'Not found on PATH.';
}

async function runOneTool(def, root, toolOptions: Record<string, any> = {}, signal?: AbortSignal) {
  // A tool that reports through a file (gitleaks) gets a per-run temp path —
  // never /dev/stdout, which does not exist on Windows, and never a fixed
  // name, so two concurrent runs cannot read each other's report.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarder-analysis-'));
  try {
    const ctx: Record<string, any> = {};
    if (def.usesReportFile) {
      ctx.reportDir = temporary;
      ctx.reportPath = path.join(ctx.reportDir, 'report.json');
    }

    const resolved = toolArgv(def, root, toolOptions, ctx);
    if (!resolved) {
      return emptyPass(def.id, def.label, unavailableReason(def));
    }

    const started = Date.now();
    const result = await runTool(resolved.argv, {
      cwd: temporary,
      timeout: TOOL_TIMEOUT_MS,
      signal,
      env: isolatedEnvironment(process.env, [], temporary),
    });

    // Read and remove the report file whatever happened above.
    let reportText = null;
    if (ctx.reportPath) {
      try {
        const stat = fs.lstatSync(ctx.reportPath);
        if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('Invalid analyzer report.');
        reportText = fs.readFileSync(ctx.reportPath, 'utf8');
      } catch {
        reportText = null; // a crashed tool may never have written it
      }
    }

    if (result.timedOut) return { ...emptyPass(def.id, def.label, result.error), available: true };
    if (!result.ok) {
      return { ...emptyPass(def.id, def.label, result.error || 'The tool could not be run.'), available: true };
    }
    if (def.usesReportFile && reportText === null) return { ...emptyPass(def.id, def.label, result.stderr || 'The analyzer did not create its report.'), available: true };

    const stdout = (def.usesReportFile ? (reportText || '') : (result.stdout || '')).trim();
    if (!stdout) {
      if (result.status !== 0) return { ...emptyPass(def.id, def.label, `Exited ${result.status}: ${result.stderr || 'No readable report.'}`), available: true };
      // A clean pass: the tool ran and found nothing. That is a real answer, and
      // worth saying — "Gitleaks: no secrets" is the outcome a self-hosting user
      // runs the tool to hear.
      return passResult(def, resolved, [], started);
    }

    try {
      const findings = def.parse(stdout, root);
      return passResult(def, resolved, findings, started);
    } catch (err) {
      return { ...emptyPass(def.id, def.label, 'Its output could not be read: ' + err.message), available: true };
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

function passResult(def, resolved, findings, started) {
  return {
    id: def.id, label: def.label, kind: def.kind, ok: true, available: true,
    findings, source: 'external', tool: def.id, how: resolved.how, ms: Date.now() - started,
  };
}

// Tools run concurrently — a scan is I/O-bound and the analyzers are
// independent — but a repo with zero analyzers still gets a well-formed report,
// so the frontend renders the built-in floor and the "what to install" list.
// `kinds` narrows by purpose, `tools` narrows to named engines; both exist so
// the UI can offer "run just the secrets scan" as readily as "run everything".
// `options` is per-engine GUI settings, sanitized against the registry schema
// before any of it touches a command line.
export async function runExternalAnalysis(root, options: Record<string, any> = {}) {
  options.signal?.throwIfAborted();
  const kinds = options.kinds ? new Set(options.kinds) : null;
  const tools = options.tools ? new Set(options.tools) : null;
  const rawOptions = options.options && typeof options.options === 'object' ? options.options : {};
  const defs = TOOL_DEFS.filter((d) => (!kinds || kinds.has(d.kind)) && (!tools || tools.has(d.id)));

  const started = Date.now();
  const passes = await Promise.all(defs.map(async def => {
    options.signal?.throwIfAborted();
    options.onProgress?.({ phase: 'start', id: def.id, label: def.label });
    const pass = await runOneTool(def, root, sanitizeOptions(def, rawOptions[def.id]), options.signal);
    if (!options.signal?.aborted) options.onProgress?.({ phase: 'complete', id: def.id, label: def.label, pass });
    return pass;
  }));
  options.signal?.throwIfAborted();

  const ran = passes.filter((p) => p.ok);
  const findings = mergeFindings(...passes.map((p) => p.findings));

  return {
    ms: Date.now() - started,
    passes,
    findings,
    ranCount: ran.length,
    totalTools: defs.length,
    unavailable: passes.filter((p) => !p.available).map((p) => ({ id: p.id, label: p.label, reason: ('reason' in p ? p.reason : undefined) })),
    source: ran.length ? 'external' : 'none',
  };
}
