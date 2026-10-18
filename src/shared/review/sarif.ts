import type { ReviewReport } from './contracts.js';

/** Interoperable output. Findings remain visible even when acknowledged locally. */
export function reviewSarif(report: ReviewReport) {
  const rules = [...new Set(report.findings.map(f => f.rule))];
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: 'Onboarder', informationUri: 'https://github.com/Amitpandey88/onboarder',
        rules: rules.map(id => ({ id, shortDescription: { text: id } })) } },
      versionControlProvenance: report.head ? [{ revisionId: report.head }] : [],
      results: report.findings.map(f => ({
        ruleId: f.rule, ruleIndex: rules.indexOf(f.rule),
        level: ['critical', 'high'].includes(f.severity) ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
        message: { text: f.message + '\n' + f.suggestion },
        partialFingerprints: { 'onboarderFinding/v1': f.id },
        locations: [{ physicalLocation: { artifactLocation: { uri: f.path.split('/').map(encodeURIComponent).join('/'), uriBaseId: '%SRCROOT%' },
          region: { startLine: Math.max(1, f.line) } } }],
      })),
      properties: { comparisonFingerprint: report.fingerprint, mode: report.mode, limitations: report.coverage.limitations },
    }],
  };
}
