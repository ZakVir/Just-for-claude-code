// Verification for the real Expo app (Skia on CanvasKit) exported for web:
// serves dist/, opens it in an iPhone-sized viewport with Playwright's fake
// clock, swipes the dome, drags the bead, and writes frames.
//   npx expo export -p web && node scripts/capture-web.mjs <outDir> [light|dark]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(execSync('npm root -g').toString().trim(), 'noop.js'));
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const outDir = process.argv[2] || join(root, 'preview/captures-web');
const scheme = process.argv[3] || 'light';
mkdirSync(outDir, { recursive: true });

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  let p = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p) || p.endsWith('/')) p = join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 1,
  colorScheme: scheme,
  hasTouch: false,
});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.clock.install();
await page.goto(`http://localhost:${port}/`);
// let CanvasKit + the lazy screen chunk load in real time, frames frozen
for (let i = 0; i < 60 && !(await page.locator('canvas').count()); i++) {
  await page.clock.runFor(100);
  await new Promise((r) => setTimeout(r, 250));
}
let n = 0;
const shot = async (label) => page.screenshot({ path: join(outDir, `${String(++n).padStart(3, '0')}-${label}.png`) });
const run = async (ms) => {
  // advance in frame-sized slices so rAF-driven worklets tick
  for (let t = 0; t < ms; t += 50) await page.clock.runFor(Math.min(50, ms - t));
};

await shot('t0');
for (const [ms, l] of [
  [400, 't0.4'],
  [300, 't0.7'],
  [400, 't1.1'],
  [400, 't1.5'],
  [900, 't2.4'],
]) {
  await run(ms);
  await shot(l);
}
// swipe up from the dome
await page.mouse.move(196, 800);
await page.mouse.down();
for (let i = 1; i <= 20; i++) {
  await page.mouse.move(196, 800 - i * 22);
  await run(16);
  if (i === 10) await shot('swipe-10');
}
await page.mouse.up();
for (const [ms, l] of [
  [300, 'c0.3'],
  [700, 'c1.0'],
  [700, 'c1.7'],
  [800, 'c2.5'],
  [700, 'c3.2'],
  [1500, 'c4.7'],
]) {
  await run(ms);
  await shot(l);
}
// drag the bead down over the headline
const lensY = Math.round(852 * 0.43);
await page.mouse.move(196, lensY);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(196 + i * 2, lensY + i * 10);
  await run(16);
}
await shot('drag');
await page.mouse.up();
await run(150);
await shot('release-0.15');
await run(900);
await shot('release-1.05');

console.log(errors.length ? `ERRORS:\n${errors.slice(0, 20).join('\n')}` : 'no console errors');
await browser.close();
server.close();
