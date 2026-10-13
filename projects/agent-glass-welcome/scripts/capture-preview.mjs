// Verification loop for the WebGL preview: drives the manual clock frame by
// frame, performs the swipe and the bead drag with real pointer events, and
// writes numbered PNG frames for scrubbing.
//   node scripts/capture-preview.mjs <outDir> [light|dark] [reduce]
// Needs Playwright (globally installed is fine): resolved via `npm root -g`.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(execSync('npm root -g').toString().trim(), 'noop.js'));
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || join(root, 'preview/captures');
const theme = process.argv[3] || 'light';
const reduce = process.argv[4] === 'reduce';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({
  viewport: { width: 560, height: 1000 },
  deviceScaleFactor: Number(process.env.DSF || 1),
});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const url = `file://${join(root, 'preview/dist/glass-welcome.html')}?manual&theme=${theme}${reduce ? '&reduce=1' : ''}`;
await page.goto(url);
await page.waitForFunction(() => window.__welcome && window.__welcome.ready, null, { timeout: 30000 });

const box = await page.locator('#device').boundingBox();
const L = await page.evaluate(() => window.__welcome.layout);
const at = (x, y) => [box.x + (x / L.W) * box.width, box.y + (y / L.H) * box.height];
let n = 0;
const log = [];
const advance = (s) => page.evaluate((s) => window.__welcome.advance(s), s);
const shot = async (label) => {
  const name = `${String(++n).padStart(3, '0')}-${label}.png`;
  await page.locator('#device').screenshot({ path: join(outDir, name) });
  const lens = await page.evaluate(() => {
    const s = window.__welcome.lens;
    return {
      stage: s.stage,
      t: +s.t.toFixed(3),
      x: +s.x.toFixed(1),
      y: +s.y.toFixed(1),
      r: +s.r.toFixed(1),
      glow: +s.glow.toFixed(2),
    };
  });
  log.push(`${name} ${JSON.stringify(lens)}`);
};

// stage 0 intro
await shot('t0.00');
for (const [dt, label] of [
  [0.3, 't0.30'],
  [0.2, 't0.50'],
  [0.2, 't0.70'],
  [0.15, 't0.85'],
  [0.2, 't1.05'],
  [0.2, 't1.25'],
  [0.15, 't1.40'],
  [0.8, 't2.20'],
]) {
  await advance(dt);
  await shot(label);
}

// swipe the dome up (≈ 0.35 s, 22 moves)
let [px, py] = at(L.W / 2, L.H - 60);
await page.mouse.move(px, py);
await page.mouse.down();
const total = L.domeY - L.homeY + 40;
for (let i = 1; i <= 22; i++) {
  [px, py] = at(L.W / 2 + i * 0.6, L.H - 60 - (total * i) / 22);
  await page.mouse.move(px, py);
  await advance(1 / 60);
  if (i === 8 || i === 15 || i === 22) await shot(`swipe-${i}`);
}
await page.mouse.up();
for (const [dt, label] of [
  [0.1, 'c0.10'],
  [0.2, 'c0.30'],
  [0.3, 'c0.60'],
  [0.4, 'c1.00'],
  [0.35, 'c1.35'],
  [0.35, 'c1.70'],
  [0.45, 'c2.15'],
  [0.4, 'c2.55'],
  [0.3, 'c2.85'],
  [0.4, 'c3.25'],
  [1.2, 'c4.45'],
]) {
  await advance(dt);
  await shot(label);
}

// drag the bead down across the headline, then up into the bubble heap
[px, py] = at(L.homeX, L.homeY);
await page.mouse.move(px, py);
await page.mouse.down();
const path = [];
for (let i = 1; i <= 16; i++) path.push([L.homeX, L.homeY + ((L.titleY - L.homeY + 8) * i) / 16]);
for (let i = 1; i <= 10; i++) path.push([L.homeX + (60 * i) / 10, L.titleY + 8 + ((L.lineY - L.titleY) * i) / 10]);
for (let i = 1; i <= 24; i++)
  path.push([L.homeX + 60 - (110 * i) / 24, L.lineY + 8 - ((L.lineY - L.pileTop - 120) * i) / 24]);
for (let i = 0; i < path.length; i++) {
  [px, py] = at(path[i][0], path[i][1]);
  await page.mouse.move(px, py);
  await advance(1 / 60);
  if ([8, 16, 22, 26, 38, 50].includes(i + 1)) await shot(`drag-${i + 1}`);
}
await page.mouse.up();
for (const [dt, label] of [
  [0.12, 'r0.12'],
  [0.25, 'r0.37'],
  [0.5, 'r0.87'],
  [1.2, 'r2.07'],
]) {
  await advance(dt);
  await shot(label);
}

console.log(log.join('\n'));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
