import { parentPort } from 'node:worker_threads';
import { languages, languageFor } from '../shared/analyzer/languages/index.js';
import { codeStats, complexityOf, halsteadMetrics, cognitiveComplexity, maintainabilityIndex } from '../shared/analyzer/metrics.js';

parentPort.on('message', (data) => {
  try {
    const { source, path, langId } = data;
    const lang = languages.find(l => l.id === langId) || languageFor(path);
    
    let result = {};
    if (lang && lang.analyze) {
      result = lang.analyze(source, path);
    }
    
    const stats = codeStats(source, langId);
    const complexity = complexityOf(source, langId);
    
    const halstead = halsteadMetrics(source, langId);
    const cognitive = cognitiveComplexity(source, langId);
    const mi = maintainabilityIndex(halstead, cognitive, stats.code);

    parentPort.postMessage({
      result: {
        ...result,
        ...stats,
        complexity,
        halstead,
        cognitiveComplexity: cognitive,
        maintainabilityIndex: mi,
        effort: halstead.effort
      }
    });
  } catch (error) {
    parentPort.postMessage({ error: error.message || String(error) });
  }
});
