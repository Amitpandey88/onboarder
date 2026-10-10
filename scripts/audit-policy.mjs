// Evaluate leaf advisories, including reports that propagate through parent packages.
export function assessAudit(report, exceptions = [], versions = {}, now = Date.now()) {
  if (!report.metadata?.vulnerabilities || !report.vulnerabilities || report.error) throw new Error('Incomplete or failed npm audit report.');
  const allowed = [], blocked = [], seen = new Set();
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    for (const advisory of vulnerability.via || []) {
      if (typeof advisory === 'string') {
        if (!report.vulnerabilities[advisory]) blocked.push({ name, url: advisory, reason: 'Missing transitive advisory.' });
        continue;
      }
      const key = name + ':' + advisory.url;
      if (seen.has(key)) continue;
      seen.add(key);
      const exception = exceptions.find(item => item.package === name && item.url === advisory.url &&
        item.severity === advisory.severity && advisory.severity === 'low' && item.version === versions[name] &&
        Date.parse(item.expires + 'T23:59:59Z') >= now && item.reason?.trim());
      (exception ? allowed : blocked).push({ name, url: advisory.url, severity: advisory.severity, exception });
    }
  }
  if (report.metadata.vulnerabilities.total && !seen.size && !blocked.length) throw new Error('Audit reported vulnerabilities without usable advisory details.');
  return { allowed, blocked };
}
