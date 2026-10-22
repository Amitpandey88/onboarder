import type { FileSource } from '../shared/contracts.js';
import type { ReviewContext, ReviewLimits } from '../shared/review/aiContracts.js';
import type { ReviewReport } from '../shared/review/contracts.js';
import { matchesReviewPath } from '../shared/review/review.js';
import { scanRepo } from '../shared/analyzer/scan.js';
import { computeFacts } from '../shared/analyzer/graph.js';
import { detectManifest } from '../shared/analyzer/services.js';
import { architectureViolations, detectRoutes, emptyIntelligenceConfig, parseIntelligenceConfig } from '../shared/intelligence/analysis.js';
import { boundedSource, evidenceText, gitRead, hash, revisionFileSource } from './intelligence/workspace.js';
import { semanticAnalysis } from './intelligence/semantic.js';
import { nodeFileSource } from './fileSourceNode.js';
import { safeRelative } from '../cli/agent/files.js';

export const DEFAULT_AI_LIMITS: Readonly<ReviewLimits> = Object.freeze({ maxContextBytes: 60000, maxExcerpts: 20, maxChangedFiles: 30,
  maxOutputTokens: 3000, timeoutMs: 60000, maxRequestsPerMinute: 3 });
export function reviewLimits(input: unknown = {}): ReviewLimits {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('AI limits must be an object.');
  const ranges: Record<keyof ReviewLimits, [number, number]> = { maxContextBytes: [4000, 100000], maxExcerpts: [2, 40], maxChangedFiles: [1, 100],
    maxOutputTokens: [128, 4096], timeoutMs: [1000, 120000], maxRequestsPerMinute: [1, 10] };
  const result = { ...DEFAULT_AI_LIMITS };
  for (const [key, value] of Object.entries(input)) {
    const range = ranges[key];
    if (!range || !Number.isSafeInteger(value) || value < range[0] || value > range[1]) throw new Error('Invalid AI limit: ' + key + '.');
    result[key] = value;
  }
  return result;
}
export function changedLines(report: ReviewReport, path: string): number[] {
  const file = report.comparison?.files.find(f => f.newPath === path);
  const lines = new Set<number>();
  for (const hunk of file?.hunks || []) {
    let line = hunk.newStart;
    for (const item of hunk.lines) { if (item.type === 'del') continue; if (item.type === 'add') lines.add(line); line++; }
  }
  return [...lines];
}

export async function collectReviewContext(root: string, report: ReviewReport, limits: ReviewLimits, signal?: AbortSignal) {
  const texts = new Map<string, string>(); let bytes = 0;
  const excluded = report.files.filter(f => f.skipped).map(f => f.path);
  // The configuration for this exact comparison was already validated by Phase 1.
  const configText = report.mode === 'working' ? await boundedSource(root, '.onboarder-review.json', 65536).catch(e => {
    if (e.code === 'ENOENT') return ''; throw e;
  }) : undefined;
  const { gitReviewConfig } = await import('./gitDiff.js');
  const reviewConfigText = configText ?? (await gitReviewConfig(root, report.head || '', signal)).text ?? '{}';
  const { parseReviewConfigText } = await import('../shared/review/review.js');
  const config = parseReviewConfigText(reviewConfigText || '{}');
  const allowed = (file: string) => { try { safeRelative(file); return !excluded.includes(file) && !config.exclude.some(p => matchesReviewPath(file, p)); } catch { return false; } };
  const raw = report.mode === 'working' ? nodeFileSource(root) : (await revisionFileSource(root, report.head || '', signal)).source;
  const marker = report.mode === 'staged' ? await gitRead(root, ['ls-files', '--stage', '-z'], signal) : '';
  const read = async (file: string) => {
    signal?.throwIfAborted();
    if (!allowed(file) && !['.onboarder.json', '.gitignore'].includes(file)) throw new Error('Source is excluded from review context.');
    const value = report.mode === 'working' ? await boundedSource(root, file) : await raw.read(file);
    if (Buffer.byteLength(value) > 204800 || value.includes('\0')) throw new Error('Source exceeds the review text limit.');
    return value;
  };
  const source: FileSource = { ...raw,
    list: async dir => (await raw.list(dir)).filter(e => e.type === 'dir' || allowed(e.path)),
    read: async file => {
      if (texts.has(file)) return texts.get(file)!;
      if (bytes >= 32 * 1024 * 1024) throw new Error('Review indexing source budget exceeded.');
      const value = await read(file); bytes += Buffer.byteLength(value);
      if (bytes > 32 * 1024 * 1024) throw new Error('Review indexing source budget exceeded.');
      texts.set(file, value); return value;
    } };
  const scan = await scanRepo(source, { maxFiles: 2000, signal });
  const facts = computeFacts(scan, await detectManifest(source));
  let architectureConfig = emptyIntelligenceConfig();
  if (allowed('.onboarder.json')) {
    let text: string | undefined;
    try { text = await source.read('.onboarder.json'); } catch (e) {
      if (!(report.mode === 'working' && e.code === 'ENOENT') && e.message !== 'File unavailable at this revision.') throw e;
    }
    if (text !== undefined) { try { architectureConfig = parseIntelligenceConfig(JSON.parse(text)); } catch { throw new Error('Invalid .onboarder.json in reviewed source.'); } }
  }
  const semantic = await semanticAnalysis(root, texts, signal); signal?.throwIfAborted();
  const revision = report.head || report.mode + ':' + report.fingerprint;
  const limitations = ['Context is selected from captured source; relationships are static and do not prove runtime behavior.',
    'Only quoted locations are validated. Model confidence is self-reported, not calibrated, and behavior is not execution-verified.'];
  if (!semantic.available) limitations.push(semantic.reason || 'Optional semantic analysis unavailable; lexical symbols and import edges are used.');
  if (semantic.truncated) limitations.push('Optional semantic index reached its bound.');
  if (scan.stats.truncated || scan.stats.skips.readFailed || scan.stats.skips.listFailed || scan.stats.skips.tooLarge) limitations.push('Repository scan is partial; some files could not be indexed within its limits.');
  const context: ReviewContext = { schemaVersion: 1, mode: report.mode, revision, sourceFingerprint: '', changes: [], evidence: [], relationships: [], routes: [],
    policies: [], architecture: [], architectureRules: architectureConfig.rules.slice(0, 20).map(rule => ({ ...rule, message: evidenceText(rule.message) })), existingFindings: [], semantic: { available: semantic.available, reason: semantic.reason },
    coverage: { analyzedFiles: scan.files.length, changedFiles: 0, totalChangedFiles: report.files.filter(f => !f.skipped).length, truncated: false, limitations } };
  const ranked: { path: string; line: number; score: number; reason: string }[] = [];
  const add = (path: string, line: number, score: number, reason: string) => {
    if (allowed(path) && texts.has(path)) ranked.push({ path, line: Math.max(1, line), score, reason });
  };
  for (const file of report.files.filter(f => !f.skipped).slice(0, limits.maxChangedFiles)) {
    signal?.throwIfAborted();
    const lines = changedLines(report, file.path), analyzed = scan.files.find(f => f.path === file.path);
    if (!texts.has(file.path)) { try { await source.read(file.path); } catch { limitations.push('Changed source unavailable: ' + file.path); continue; } }
    const captured = evidenceText(texts.get(file.path)!).split('\n');
    const patch = report.comparison?.files.find(f => f.newPath === file.path);
    for (const hunk of patch?.hunks || []) {
      let line = hunk.newStart;
      for (const item of hunk.lines) {
        if (item.type === 'del') continue;
        if (captured[line - 1] !== item.text) throw new Error('Review source changed during context capture. Run the review again.');
        line++;
      }
    }
    const symbols = [...(analyzed?.functions || []), ...(analyzed?.exports || []), ...(analyzed?.classes || [])]
      .filter(s => s.line && lines.some(line => line >= s.line! && line < (Math.min(...[...(analyzed?.functions || []), ...(analyzed?.classes || [])].filter(n => n.line! > s.line!).map(n => n.line!)) || Infinity)))
      .map(s => ({ name: s.name, line: s.line!, kind: s.kind || 'lexical-symbol' })).slice(0, 30);
    const related = scan.edges.filter(e => e.from === file.path || e.to === file.path);
    context.changes.push({ path: file.path, lines: lines.slice(0, 500), symbols, exports: (analyzed?.exports || []).filter(e => symbols.some(s => s.name === e.name) || e.line && lines.includes(e.line)).map(e => e.name).slice(0, 30),
      relatedFiles: [...new Set(related.map(e => e.from === file.path ? e.to : e.from))].slice(0, 20) });
    for (const line of lines.slice(0, 8)) add(file.path, line, 1000, 'Changed added line.');
    for (const edge of related.slice(0, 40)) {
      context.relationships.push({ from: edge.from, to: edge.to, kind: 'dependency' });
      const target = edge.from === file.path ? edge.to : edge.from;
      const match = texts.get(target)?.split('\n').findIndex(line => symbols.some(s => line.includes(s.name))) ?? -1;
      add(target, match + 1, 800, edge.to === file.path ? 'Imports the changed module; possible caller.' : 'Dependency of the changed module.');
    }
    for (const ref of semantic.references.filter(r => r.targetPath === file.path || r.path === file.path).slice(0, 30)) {
      context.relationships.push({ from: ref.path, to: ref.targetPath, kind: ref.kind, line: ref.line, name: ref.name });
      add(ref.path, ref.line, 900, 'Compiler-resolved ' + ref.kind + ' of ' + ref.name);
      add(ref.targetPath, ref.targetLine, 850, 'Compiler-resolved definition of ' + ref.name);
    }
    const affected = new Set([file.path]);
    for (let depth = 0; depth < 3; depth++) for (const edge of scan.edges) if (affected.has(edge.to)) affected.add(edge.from);
    for (const test of scan.files.filter(f => affected.has(f.path) && /(?:^|\/)(?:__tests__|tests?)\/|[.-](?:test|spec)\.|_test\./.test(f.path)).slice(0, 10)) add(test.path, 1, 750, 'Test statically depends on the changed module.');
    if (analyzed && !/^(?:javascript|typescript)$/.test(analyzed.lang)) limitations.push('Conservative lexical/import fallback for ' + file.path + '; no JS/TS semantic guarantees.');
    context.policies.push(...file.instructions.map(instruction => ({ path: file.path, instruction })));
  }
  const relevant = new Set(ranked.map(r => r.path));
  context.routes = detectRoutes(texts).filter(r => relevant.has(r.path)).slice(0, 20).map(({ path, line, method, route, handler }) => ({ path, line, method, route: evidenceText(route), handler: evidenceText(handler) }));
  context.architecture = architectureViolations(scan.edges, architectureConfig).filter(v => relevant.has(v.from) || relevant.has(v.to)).slice(0, 20)
    .map(({ rule, from, to, message }) => ({ rule, from, to, message: evidenceText(message) }));
  context.existingFindings = scan.files.filter(f => relevant.has(f.path)).flatMap(f => (f.findings || []).map(item => ({ path: f.path, line: item.line, rule: item.rule, message: item.message }))).slice(0, 30);
  context.relationships = context.relationships.slice(0, 80);
  context.policies = context.policies.slice(0, 20);
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);
  for (const item of ranked) {
    if (context.evidence.length >= limits.maxExcerpts) break;
    if (context.evidence.some(e => e.path === item.path && item.line >= e.startLine && item.line <= e.endLine)) continue;
    const full = texts.get(item.path)!, all = evidenceText(full).split('\n');
    const start = Math.max(0, item.line - 5); let end = start, text = '';
    while (end < Math.min(all.length, item.line + 15) && Buffer.byteLength(text + all[end] + '\n') <= 4000) { text += (end > start ? '\n' : '') + all[end]; end++; }
    if (end < item.line) { context.coverage.truncated = true; continue; }
    const citation = { id: 'R' + (context.evidence.length + 1), path: item.path, startLine: start + 1, endLine: end, text,
      revision, sourceHash: hash(full), reason: item.reason };
    context.evidence.push(citation);
    if (Buffer.byteLength(JSON.stringify(context)) > limits.maxContextBytes) { context.evidence.pop(); context.coverage.truncated = true; }
  }
  context.coverage.changedFiles = context.changes.filter(c => context.evidence.some(e => e.path === c.path && c.lines.some(l => l >= e.startLine && l <= e.endLine))).length;
  context.coverage.truncated ||= context.coverage.changedFiles < context.coverage.totalChangedFiles || ranked.some(r => !context.evidence.some(e => e.path === r.path && r.line >= e.startLine && r.line <= e.endLine));
  if (context.coverage.truncated) limitations.push('Context selection reached a change/excerpt/byte limit; omitted source was not reviewed by the model.');
  context.sourceFingerprint = hash(report.fingerprint + JSON.stringify([...texts].sort(([a], [b]) => a.localeCompare(b)).map(([p, text]) => [p, hash(text)])));
  if (Buffer.byteLength(JSON.stringify(context)) > limits.maxContextBytes) throw new Error('Review metadata exceeds the context limit. Narrow the comparison or increase its bounded limit.');
  return { context, assertCurrent: async () => {
    signal?.throwIfAborted();
    if (report.mode === 'staged' && marker !== await gitRead(root, ['ls-files', '--stage', '-z'], signal)) throw new Error('The staged index changed during AI review. Run the review again.');
    if (report.mode === 'working') for (const evidence of context.evidence) {
      if (hash(await read(evidence.path)) !== evidence.sourceHash) throw new Error('Review source changed during AI review. Run the review again.');
    }
  } };
}
