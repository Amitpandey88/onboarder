import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { root, run } from './setup.mjs';
const svg = await fs.readFile(path.resolve(root, '../../public/assets/onboarder-mark.svg'), 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent;width:100%;height:100%}svg{display:block;width:1024px;height:1024px}</style>${svg}`);
  const iconset = path.join(root, 'dist/Onboarder.iconset'); await fs.mkdir(iconset, { recursive: true });
  const master = path.join(iconset, 'icon_512x512@2x.png'); await page.screenshot({ path: master, omitBackground: true });
  for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
    const target = path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`);
    if (target !== master) run('/usr/bin/sips', ['-z', String(size * scale), String(size * scale), master, '--out', target], { stdio: 'ignore' });
  }
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build/icon.icns')]);
} finally { await browser.close(); }
