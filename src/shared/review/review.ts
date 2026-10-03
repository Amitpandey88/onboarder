import { analyzeSecurityFile } from '../analyzer/security.js';
import type { GitDiff, ReviewCheck, ReviewConfig, ReviewFile, ReviewFinding, ReviewProfile, ReviewReport, Severity } from './contracts.js';

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
export const DEFAULT_REVIEW_CONFIG: ReviewConfig = { profile: 'balanced', exclude: [], instructions: [] };
export function reviewProfile(value: unknown): ReviewProfile {
  if (value === 'focused' || value === 'balanced' || value === 'thorough') return value;
  throw new Error('Review profile must be focused, balanced, or thorough.');
}
export function parseReviewConfig(value: unknown): ReviewConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Review configuration must be a JSON object.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['profile', 'exclude', 'instructions'].includes(k))) throw new Error('Unknown review configuration field. Use profile, exclude, and instructions.');
  const exclude = v.exclude ?? [];
  const instructions = v.instructions ?? [];
  if (!Array.isArray(exclude) || exclude.length > 50 || exclude.some(p => typeof p !== 'string' || p.length > 200 || !p)) throw new Error('exclude must contain up to 50 path patterns.');
  if (!Array.isArray(instructions) || instructions.length > 50) throw new Error('instructions must contain up to 50 path guidelines.');
  const rules = instructions.map((rule: unknown) => {
    if (!rule || typeof rule !== 'object') throw new Error('Each guideline needs a path and instruction.');
    const r = rule as Record<string, unknown>;
    if (typeof r.path !== 'string' || !r.path || r.path.length > 200 || typeof r.instruction !== 'string' || !r.instruction.trim() || r.instruction.length > 2000) throw new Error('Each guideline needs a path pattern and an instruction of at most 2000 characters.');
    return { path: r.path, instruction: r.instruction };
  });
  return { profile: v.profile === undefined ? 'balanced' : reviewProfile(v.profile), exclude, instructions: rules };
}
/** Small path glob vocabulary: * (one segment), ** (any depth), ? (one character). */
export function matchesReviewPath(path: string, pattern: string): boolean {
  // Dynamic programming avoids exponential regex backtracking on repository input.
  const tokens: string[] = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { tokens.push('directory'); i++; } else tokens.push('all');
    } else tokens.push(pattern[i] === '*' ? 'segment' : pattern[i] === '?' ? 'character' : 'literal:' + pattern[i]);
  }
  let dp = new Uint8Array(path.length + 1); dp[0] = 1;
  for (const token of tokens) {
    const next = new Uint8Array(path.length + 1);
    if (token === 'directory') {
      let started = false;
      for (let j = 0; j <= path.length; j++) {
        if (dp[j]) { next[j] = 1; started = true; }
        if (j > 0 && started && path[j - 1] === '/') next[j] = 1;
      }
    } else if (token === 'all' || token === 'segment') {
      next[0] = dp[0];
      for (let j = 1; j <= path.length; j++) next[j] = dp[j] || (next[j - 1] && (token === 'all' || path[j - 1] !== '/') ? 1 : 0);
    } else {
      for (let j = 0; j < path.length; j++) if (dp[j] && (token === 'character' ? path[j] !== '/' : path[j] === token.slice(8))) next[j + 1] = 1;
    }
    dp = next;
  }
  return Boolean(dp[path.length]);
}
function language(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return ({ js: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python', go: 'go', java: 'java', rs: 'rust', cs: 'csharp', php: 'php', rb: 'ruby', c: 'c', cpp: 'cpp', sh: 'shell' } as Record<string, string>)[ext || ''] || 'generic';
}
export function changeKind(path: string): string {
  if (/(^|\/)(__tests__|tests?|specs?)(\/|\.)|[.-](test|spec)\.|_test\./i.test(path)) return 'Tests';
  if (/\.(md|mdx|rst|txt)$|(^|\/)(docs?)\//i.test(path)) return 'Documentation';
  if (/(^|\/)(package(-lock)?\.json|[^/]*lock[^/]*|requirements[^/]*|go\.(mod|sum)|Cargo\.toml)$/.test(path)) return 'Dependencies';
  if (/(^|\/)(\.github|\.gitlab|Dockerfile|docker-compose|tsconfig)|\.(ya?ml|toml|ini)$/.test(path)) return 'Configuration';
  return language(path) === 'generic' ? 'Other' : 'Source';
}
const suggestions: Record<string, string> = {
  'hardcoded-secret': 'Remove the literal credential, rotate it if it was real, and load it from a secret store or environment variable.',
  'aws-key': 'Remove this access key and rotate it if real. Use the platform credential provider.',
  'jwt-secret': 'Remove the token and invalidate it if real. Load credentials at runtime.',
  'private-key-block': 'Remove this private key from the change and rotate it if real.',
  eval: 'Use a fixed operation lookup or a structured parser instead of executing input as code.',
  'new-function': 'Replace dynamic code construction with a fixed function or an explicit operation lookup.',
  'child-exec': 'Use execFile with a fixed executable and an argument array; validate untrusted arguments.',
  'sql-concat': 'Bind values through the database parameter API rather than interpolating them into SQL.',
  innerhtml: 'Use textContent for text. If markup is required, sanitize it with an established HTML sanitizer.',
  'empty-catch': 'Handle the error, propagate it, or explain and log an intentionally recoverable failure.',
  'loose-eq': 'Use strict equality and make any intended type conversion explicit.',
  'var-keyword': 'Use const unless this binding is reassigned; otherwise use let.',
  'console-log': 'Use the application logger with a suitable level and avoid logging credentials.',
  debugger: 'Remove the debugger statement before shipping.',
};
export function buildReview(diff: GitDiff, config = DEFAULT_REVIEW_CONFIG): ReviewReport {
  const findings: ReviewFinding[] = [];
  const files: ReviewFile[] = [];
  const minSeverity = config.profile === 'focused' ? 2 : config.profile === 'balanced' ? 1 : 0;
  let conflicts = 0;
  for (const file of diff.files) {
    const path = file.newPath || file.oldPath;
    const kind = changeKind(path);
    const excluded = config.exclude.some(p => matchesReviewPath(path, p));
    const skipped = file.skipReason || (excluded ? 'Excluded by repository configuration' : file.binary ? 'Binary content' : file.status === 'deleted' ? 'Deleted file: no added lines to inspect' : !file.hunks.length ? 'Metadata-only change' : null);
    const fileFindings: ReviewFinding[] = [];
    if (!skipped) {
      for (const hunk of file.hunks) {
        let line = hunk.newStart;
        const numbers: number[] = [];
        const added = new Set<number>();
        const text: string[] = [];
        for (const l of hunk.lines) {
          if (l.type === 'del') continue;
          numbers.push(line);
          text.push(l.text);
          if (l.type === 'add') { added.add(line); if (/^(<{7}|={7}|>{7})(?:\s|$)/.test(l.text)) conflicts++; }
          line++;
        }
        const candidates = analyzeSecurityFile(text.join('\n'), language(path));
        const secretLines = new Set(candidates.filter(f => f.category === 'secret').map(f => numbers[f.line - 1]));
        for (const f of candidates) {
          const actual = numbers[f.line - 1];
          const severity = f.severity as Severity;
          if (!added.has(actual) || SEVERITY_RANK[severity] < minSeverity) continue;
          const id = `${encodeURIComponent(path)}:${actual}:${f.rule}`;
          if (fileFindings.some(x => x.id === id)) continue;
          fileFindings.push({ id, path, line: actual, rule: f.rule, severity, category: f.category, message: f.message,
            suggestion: suggestions[f.rule] || 'Check whether this pattern is safe in its actual calling context and use the safer API where appropriate.',
            excerpt: secretLines.has(actual) ? '[credential content redacted]' : f.excerpt });
        }
      }
    }
    findings.push(...fileFindings);
    const sensitive = /(^|\/)(auth|security|payments?|migrations?)(\/|\.)|(^|\/)\.github\//i.test(path);
    const risk = fileFindings.some(f => SEVERITY_RANK[f.severity] >= 3) || sensitive || file.additions + file.deletions > 500 ? 'high' : fileFindings.length || kind === 'Dependencies' || file.additions + file.deletions > 100 ? 'medium' : 'low';
    files.push({ path, oldPath: file.oldPath, status: file.status, additions: file.additions, deletions: file.deletions, kind, risk, findings: fileFindings.length,
      instructions: config.instructions.filter(r => matchesReviewPath(path, r.path)).map(r => r.instruction), skipped });
  }
  findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.path.localeCompare(b.path) || a.line - b.line);
  files.sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.risk] - { high: 3, medium: 2, low: 1 }[a.risk]) || b.findings - a.findings || a.path.localeCompare(b.path));
  const blocking = findings.filter(f => SEVERITY_RANK[f.severity] >= 3).length;
  const hasSource = files.some(f => f.kind === 'Source' && f.status !== 'deleted' && !f.skipped);
  const hasTests = files.some(f => f.kind === 'Tests' && f.status !== 'deleted' && (f.additions || f.deletions));
  const checks: ReviewCheck[] = [
    { id: 'security', label: 'High-severity patterns', status: blocking ? 'fail' : 'pass', detail: blocking ? `${blocking} high or critical patterns need human review.` : 'No high or critical patterns detected in reviewed added lines.' },
    { id: 'conflicts', label: 'Conflict markers', status: conflicts ? 'fail' : 'pass', detail: conflicts ? `${conflicts} added conflict markers found.` : 'No conflict markers in reviewed added lines.' },
    { id: 'tests', label: 'Test changes', status: !hasSource ? 'skip' : hasTests ? 'pass' : 'warn', detail: !hasSource ? 'No reviewed source changes.' : hasTests ? 'Test files changed. Execution and coverage have not been verified.' : 'Source changed without test-file changes. Confirm existing coverage or add tests.' },
    { id: 'size', label: 'Review size', status: diff.stats.additions + diff.stats.deletions > 1000 ? 'warn' : 'pass', detail: `${diff.stats.additions + diff.stats.deletions} changed lines. Large changes may benefit from separate reviews.` },
    { id: 'coverage', label: 'Review coverage', status: files.some(f => f.skipped && f.status !== 'deleted') ? 'warn' : 'pass', detail: `${files.filter(f => !f.skipped).length} files inspected; ${files.filter(f => f.skipped).length} skipped. See each file for its reason.` },
  ];
  const groups = [...new Set(files.map(f => f.kind))].map(k => `${files.filter(f => f.kind === k).length} ${k.toLowerCase()}`).join(', ');
  return { fingerprint: '', generatedAt: new Date().toISOString(), mode: diff.mode || 'working', base: diff.base || '', head: diff.head || '', profile: config.profile,
    summary: files.length ? `${files.length} changed files (${groups}), with ${diff.stats.additions} additions and ${diff.stats.deletions} deletions. ${findings.length} patterns flagged on added lines.` : 'No changes in this comparison.', files, findings, checks, stats: diff.stats,
    coverage: { reviewed: files.filter(f => !f.skipped).length, skipped: files.filter(f => f.skipped).length, untracked: diff.untracked || 0,
      limitations: ['Local pattern checks inspect added lines with surrounding patch context; they are not a full semantic or vulnerability audit.', 'Tests are not executed. Test-change checks do not measure test coverage.', 'Risk is a heuristic based on findings, sensitive paths, and change size. Repository guidelines are prompts for human or optional AI review.'] } };
}
export function reviewMarkdown(report: ReviewReport): string {
  const safe = (v: string) => v.replace(/[\r\n]/g, ' ').replace(/[`|<>]/g, '');
  return ['# Onboarder change review', '', report.summary, '', `Comparison: ${report.mode}; base ${safe(report.base)}; head ${safe(report.head) || 'local changes'}.`, `Profile: ${report.profile}.`, '', '## Checks', '',
    ...report.checks.map(c => `- ${c.status.toUpperCase()}: ${c.label} — ${c.detail}`), '', '## Findings', '',
    ...(report.findings.length ? report.findings.map(f => `- **${f.severity}** — ${safe(f.path)}:${f.line}: ${f.message}\n  ${f.suggestion}`) : ['No patterns detected in the reviewed added lines.']), '', '## Change walkthrough', '',
    ...report.files.map(f => `- ${safe(f.path)} — ${f.status}, +${f.additions}/-${f.deletions}, ${f.risk} risk.${f.skipped ? ' Skipped: ' + f.skipped + '.' : ''}${f.instructions.length ? ' Guidelines: ' + f.instructions.map(safe).join('; ') : ''}`), '', '## Scope', '', ...report.coverage.limitations.map(l => '- ' + l), '', 'Finding acknowledgements in the browser are local notes, not proof of a fix.', ''].join('\n');
}
