// Git Churn Analysis

export function analyzeChurn(commits, scan) {
  const fileChurn = new Map();
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

  for (const commit of commits) {
    for (const change of commit.changes || []) {
      const path = change.path;
      if (!fileChurn.has(path)) {
        fileChurn.set(path, {
          totalCommits: 0,
          authors: new Set(),
          lastModified: 0,
          commitsIn90Days: 0
        });
      }
      
      const stats = fileChurn.get(path);
      stats.totalCommits++;
      if (commit.author) stats.authors.add(commit.author);
      if (commit.date > stats.lastModified) stats.lastModified = commit.date;
      if (commit.date > cutoff) stats.commitsIn90Days++;
    }
  }

  // convert authors Set to uniqueAuthors count
  const fileStats = new Map();
  for (const [path, stats] of fileChurn.entries()) {
    fileStats.set(path, {
      totalCommits: stats.totalCommits,
      uniqueAuthors: stats.authors.size,
      lastModified: stats.lastModified,
      churnRate: stats.commitsIn90Days / (90 * 24 * 60 * 60 * 1000) * 1000 * 60 * 60 * 24 * 90 // this is just commits in 90 days.
    });
  }

  // Find hotspots
  const hotspots = [];
  const complexities = new Map();
  for (const f of (scan?.files || [])) {
    complexities.set(f.path, f.complexity || 0);
  }

  for (const [path, stats] of fileStats.entries()) {
    const complexity = complexities.get(path) || 0;
    if (stats.churnRate > 5 && complexity > 20) { // basic threshold
      hotspots.push({
        path,
        churn: stats.churnRate,
        complexity,
        risk: 'high'
      });
    }
  }
  
  hotspots.sort((a, b) => (b.churn * b.complexity) - (a.churn * a.complexity));

  return { fileChurn: fileStats, hotspots };
}
