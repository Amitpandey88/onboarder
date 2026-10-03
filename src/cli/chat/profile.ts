import { promises as fs } from 'node:fs';
import path from 'node:path';
import { agentHome, runtimePaths } from '../agent/config.js';
import { terminalText } from '../agent/process.js';

function scalarValue(raw: string | undefined): string | undefined {
  raw = raw?.trim();
  if (!raw || /^[!&*{\[]/.test(raw) || /^(?:null|~)$/i.test(raw)) return undefined;
  if (raw.startsWith('"')) { try { const value = JSON.parse(raw); return typeof value === 'string' ? value : undefined; } catch { return undefined; } }
  if (raw.startsWith("'")) return /^'([^']*(?:''[^']*)*)'\s*(?:#.*)?$/.exec(raw)?.[1]?.replace(/''/g, "'");
  return raw.replace(/\s+#.*$/, '');
}
/** Hermes round-trip writes can retain a JSON-origin YAML flow mapping. */
function flowModel(source: string): Record<string, string | undefined> {
  const start = /(?:^|[{,\n])\s*(?:model|"model"|'model')\s*:\s*\{/m.exec(source);
  if (!start) return {};
  let depth = 1, quote = '', piece = '', result: Record<string, string | undefined> = {};
  const field = () => {
    const match = /^\s*(?:"(default|provider)"|'(default|provider)'|(default|provider))\s*:\s*([\s\S]+)$/.exec(piece);
    if (match) result[match[1] || match[2] || match[3]!] = scalarValue(match[4]);
    piece = '';
  };
  for (let i = start.index + start[0].length; i < source.length; i++) {
    const c = source[i]!;
    if (quote) {
      piece += c;
      if (quote === '"' && c === '\\') { piece += source[++i] || ''; continue; }
      if (c === quote) {
        if (quote === "'" && source[i + 1] === "'") { piece += source[++i]; continue; }
        quote = '';
      }
    } else if (c === '"' || c === "'") { quote = c; piece += c; }
    else if (c === '{' || c === '[') { depth++; piece += c; }
    else if (c === '}' || c === ']') { if (--depth === 0) { field(); break; } piece += c; }
    else if (c === ',' && depth === 1) field();
    else piece += c;
  }
  return result;
}

/** Read only display fields; Hermes continues to own YAML parsing and credentials. */
export async function profileDisplay(home = agentHome(), env: NodeJS.ProcessEnv = process.env): Promise<{ model?: string; provider?: string }> {
  const file = path.join(runtimePaths(home, env).profile, 'config.yaml');
  try {
    if ((await fs.stat(file)).size > 1024 * 1024) return {};
    const source = await fs.readFile(file, 'utf8');
    let model: string | undefined, provider: string | undefined;
    try { const config = JSON.parse(source); model = config.model?.default; provider = config.model?.provider; }
    catch {
      const block = /^model:\s*\n((?:[ \t]+[^\n]*\n?|\s*\n)*)/m.exec(source)?.[1] || '';
      const scalar = (key: string) => scalarValue(new RegExp('^  ' + key + ':\\s*([^\\n]+)', 'm').exec(block)?.[1]);
      const flow = flowModel(source);
      model = scalar('default') || flow.default; provider = scalar('provider') || flow.provider;
    }
    return { ...(typeof model === 'string' ? { model: terminalText(model).slice(0, 512) } : {}), ...(typeof provider === 'string' ? { provider: terminalText(provider).slice(0, 512) } : {}) };
  } catch { return {}; }
}
