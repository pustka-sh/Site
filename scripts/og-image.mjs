#!/usr/bin/env node
/*
 * Renders public/og.png, the 1200×630 image link previews use.
 * Needs Playwright with Chromium (not a project dependency):
 *   npx -y playwright@1 install chromium && node scripts/og-image.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright is not installed. See the comment at the top of this script.');
  process.exit(1);
}

const font = readFileSync(join(root, 'public/fonts/jetbrains-mono-latin-variable.woff2')).toString('base64');
const ring = readFileSync(join(root, 'public/pustka-ring-clean.svg'), 'utf8');

// A small isometric block field, echoing the site's voxel study.
const project = (x, y, z) => [880 + (x - y) * 34, 300 + (x + y) * 17 - z * 36];
const pts = (a) => a.map((p) => p.join(',')).join(' ');
let blocks = '';
const cells = [];
for (let x = -4; x <= 3; x++) for (let y = -4; y <= 3; y++) {
  if (x >= -1 && x <= 1 && y >= -1 && y <= 1) continue;
  const h = 1 + (Math.abs(x * 71 + y * 47 + x * y * 13) % 17 > 10 ? 1 : 0);
  for (let z = 0; z < h; z++) cells.push({ x, y, z, top: z === h - 1, hot: (x === -2 || y === -2) && Math.abs(x) <= 2 && Math.abs(y) <= 2 });
}
cells.sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z);
for (const { x, y, z, top, hot } of cells) {
  const c = top ? (hot ? ['#ff3a32', '#a91a1b', '#6b1114'] : ['#8b2827', '#501516', '#2c0d0e']) : ['#432424', '#281313', '#1b0c0d'];
  blocks += `<polygon points="${pts([project(x, y + 1, z + 1), project(x + 1, y + 1, z + 1), project(x + 1, y + 1, z), project(x, y + 1, z)])}" fill="${c[1]}" stroke="#6a2525" stroke-width="1"/>`;
  blocks += `<polygon points="${pts([project(x + 1, y, z + 1), project(x + 1, y + 1, z + 1), project(x + 1, y + 1, z), project(x + 1, y, z)])}" fill="${c[2]}" stroke="#6a2525" stroke-width="1"/>`;
  blocks += `<polygon points="${pts([project(x, y, z + 1), project(x + 1, y, z + 1), project(x + 1, y + 1, z + 1), project(x, y + 1, z + 1)])}" fill="${c[0]}" stroke="#6a2525" stroke-width="1"/>`;
}
const [hx, hy] = project(0.5, 0.5, 0);

const html = `<!doctype html><html><head><style>
@font-face{font-family:JB;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 800}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#080404;color:#f4e9e4;font-family:JB;overflow:hidden;position:relative}
.grid{position:absolute;inset:0;background-image:radial-gradient(#3a1a1a 1px,transparent 1px);background-size:24px 24px;opacity:.55}
.glow{position:absolute;width:760px;height:520px;right:-140px;top:40px;background:radial-gradient(ellipse,#ff2a2a2e,transparent 62%)}
.copy{position:absolute;left:72px;top:64px;width:600px}
.mark{display:flex;align-items:center;gap:14px;font-size:34px;font-weight:800;letter-spacing:-2px}
.mark svg{width:58px;height:58px}.mark span{color:#b1a3a0;font-weight:400}
h1{font-size:96px;line-height:1.04;letter-spacing:-6px;font-weight:800;margin-top:58px}
h1 em{font-style:normal;color:#ff2a2a;text-shadow:0 0 50px #ff2a2a55}
p{position:absolute;left:72px;bottom:62px;font-size:19px;color:#b1a3a0;letter-spacing:.5px}
p b{color:#ffb000;font-weight:500}
.bar{position:absolute;left:0;right:0;bottom:0;height:6px;background:linear-gradient(90deg,#a8161a,#ff2a2a 60%,#ffb000)}
svg.field{position:absolute;inset:0}
</style></head><body>
<div class="grid"></div><div class="glow"></div>
<svg class="field" viewBox="0 0 1200 630"><defs><radialGradient id="h"><stop offset="0" stop-color="#ff2a2a" stop-opacity=".95"/><stop offset=".6" stop-color="#a8161a" stop-opacity=".3"/><stop offset="1" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="${hx}" cy="${hy}" rx="96" ry="48" fill="url(#h)"/>${blocks}</svg>
<div class="copy"><div class="mark">${ring.replace(/<\?xml[^>]*>/, '')}pustka<span>.sh</span></div>
<h1>Minecraft.<br>From the <em>void.</em></h1></div>
<p><b>Relay</b> · a Java Minecraft proxy · docs, API &amp; config builder</p>
<div class="bar"></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'public/og.png') });
await browser.close();
console.log('Wrote public/og.png');
