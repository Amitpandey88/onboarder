import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const file = path.join(root, 'public/vendor/mermaid.min.js');
const result = await build({ absWorkingDir: here, entryPoints: ['entry.mjs'], bundle: true, platform: 'browser', format: 'iife', target: 'es2024', minify: true, legalComments: 'eof', outfile: file, metafile: true });
const bytes = await fs.readFile(file);
const manifestPath = path.join(root, 'public/vendor/manifest.json'); const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const component = manifest.components.find(c => c.name === 'mermaid');
component.assetVersion = '12.2.0-onboarder.1';
component.distribution = 'Reproducible Onboarder bundle of the official Mermaid ESM distribution';
component.build = { entry: 'security/vendor-build/entry.mjs', lock: 'security/vendor-build/package-lock.json', lockSha256: createHash('sha256').update(await fs.readFile(path.join(here, 'package-lock.json'))).digest('hex'), esbuild: '0.28.2', command: 'npm ci --ignore-scripts && npm run build' };
component.bundledDependencies = { katex: '0.18.11', dompurify: '3.4.17' };
manifest.reviewed = '2026-10-27'; manifest.files['mermaid.min.js'] = createHash('sha256').update(bytes).digest('hex');
const packages = [...new Set(Object.keys(result.metafile.inputs).map(input => input.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))].sort();
let licenses = 'Third-party notices for the reproducible Onboarder Mermaid bundle\n';
for (const name of packages) {
  const directory = path.join(here, 'node_modules', name);
  for (const entry of (await fs.readdir(directory)).filter(entry => /^(?:licen[cs]e|copying)(?:[-.]|$)/i.test(entry)).sort()) {
    const location = path.join(directory, entry); if ((await fs.stat(location)).isFile()) licenses += `\n\n===== ${name} / ${entry} =====\n${await fs.readFile(location, 'utf8')}\n`;
  }
}
const notices = 'MERMAID-THIRD-PARTY-LICENSES.txt'; await fs.writeFile(path.join(root, 'public/vendor', notices), licenses);
manifest.files[notices] = createHash('sha256').update(licenses).digest('hex');
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const html = path.join(root, 'public/index.html');
await fs.writeFile(html, (await fs.readFile(html, 'utf8')).replace(/src="\/vendor\/mermaid\.min\.js\?v=[^"]+" integrity="[^"]+"/, `src="/vendor/mermaid.min.js?v=${component.assetVersion}" integrity="sha384-${createHash('sha384').update(bytes).digest('base64')}"`));
console.log(`Built Mermaid ${component.version} with actual DOMPurify 3.4.17 and KaTeX 0.18.11 (${bytes.length} bytes).`);
