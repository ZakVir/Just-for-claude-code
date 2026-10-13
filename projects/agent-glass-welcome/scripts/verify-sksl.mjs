// Cross-checks the SkSL shader (what runs on iPhone through Skia) against the
// GLSL preview, pixel for pixel. For a few states of the preview it grabs the
// exact scene texture + uniforms + WebGL output, then renders the same frame
// with CanvasKit (Skia's own SkSL compiler, CPU raster) in Node and diffs.
//   node scripts/verify-sksl.mjs <outDir>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || join(root, 'preview/sksl-check');
mkdirSync(outDir, { recursive: true });
const requireGlobal = createRequire(join(execSync('npm root -g').toString().trim(), 'noop.js'));
const { chromium } = requireGlobal('playwright');
const requireLocal = createRequire(import.meta.url);
const CanvasKitInit = requireLocal('canvaskit-wasm/bin/full/canvaskit.js');

// the SkSL string, straight from src/welcome/shader.ts
const bundled = await build({
  entryPoints: [join(root, 'src/welcome/shader.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const { SKSL } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const CK = await CanvasKitInit({ locateFile: (f) => join(root, 'node_modules/canvaskit-wasm/bin/full', f) });
let compileError = '';
const effect = CK.RuntimeEffect.Make(SKSL, (e) => (compileError = e));
if (!effect) throw new Error(`SkSL failed to compile in CanvasKit:\n${compileError}`);
console.log(`SkSL compiled in CanvasKit: ${effect.getUniformCount()} uniforms, ${effect.getChildCount?.() ?? 1} child`);

// --- collect states from the preview
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(`file://${join(root, 'preview/dist/glass-welcome.html')}?manual&theme=${process.argv[3] || 'light'}`);
await page.waitForFunction(() => window.__welcome && window.__welcome.ready);
const box = await page.locator('#device').boundingBox();
const L = await page.evaluate(() => window.__welcome.layout);
const at = (x, y) => [box.x + (x / L.W) * box.width, box.y + (y / L.H) * box.height];
const advance = (s) => page.evaluate((s) => window.__welcome.advance(s), s);
const snap = () => page.evaluate(() => window.__welcome.snapshot());
const states = [];

await advance(0.62);
states.push(['melt', await snap()]);
await advance(1.8);
states.push(['dome', await snap()]);
let [px, py] = at(L.W / 2, L.H - 60);
await page.mouse.move(px, py);
await page.mouse.down();
for (let i = 1; i <= 14; i++) {
  [px, py] = at(L.W / 2, L.H - 60 - i * 26);
  await page.mouse.move(px, py);
  await advance(1 / 60);
}
states.push(['swipe', await snap()]);
await page.mouse.up();
await advance(4.5);
states.push(['heap', await snap()]);
[px, py] = at(L.homeX, L.homeY);
await page.mouse.move(px, py);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  [px, py] = at(L.homeX + i * 2, L.homeY + i * 13);
  await page.mouse.move(px, py);
  await advance(1 / 60);
}
states.push(['drag', await snap()]);
await page.mouse.up();
await browser.close();

// --- render each state with Skia and diff against WebGL
const decode = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
function flatten(values) {
  const out = [];
  const push = (v) => (Array.isArray(v) ? v.forEach(push) : out.push(v));
  for (let i = 0; i < effect.getUniformCount(); i++) {
    const name = effect.getUniformName(i);
    if (!(name in values)) throw new Error(`missing uniform ${name}`);
    const before = out.length;
    push(values[name]);
    const u = effect.getUniform(i);
    const expected = u.columns * u.rows * (u.slot !== undefined ? 1 : 1);
    if ((out.length - before) % expected !== 0) throw new Error(`uniform ${name}: ${out.length - before} floats`);
  }
  return Float32Array.from(out);
}

let worst = 0;
for (const [label, s] of states) {
  const scene = CK.MakeImageFromEncoded(decode(s.scene));
  const child = scene.makeShaderOptions(CK.TileMode.Clamp, CK.TileMode.Clamp, CK.FilterMode.Linear, CK.MipmapMode.None);
  const shader = effect.makeShaderWithChildren(flatten(s.uniforms), [child]);
  const surface = CK.MakeSurface(s.width, s.height);
  const paint = new CK.Paint();
  paint.setShader(shader);
  surface.getCanvas().drawPaint(paint);
  const skiaImg = surface.makeImageSnapshot();
  const skiaPng = skiaImg.encodeToBytes();
  writeFileSync(join(outDir, `${label}-skia.png`), skiaPng);
  writeFileSync(join(outDir, `${label}-webgl.png`), decode(s.gl));
  // pixel diff (both are RGBA at the same size)
  const a = skiaImg.readPixels(0, 0, {
    width: s.width,
    height: s.height,
    colorType: CK.ColorType.RGBA_8888,
    alphaType: CK.AlphaType.Unpremul,
    colorSpace: CK.ColorSpace.SRGB,
  });
  const glImg = CK.MakeImageFromEncoded(decode(s.gl));
  const b = glImg.readPixels(0, 0, {
    width: s.width,
    height: s.height,
    colorType: CK.ColorType.RGBA_8888,
    alphaType: CK.AlphaType.Unpremul,
    colorSpace: CK.ColorSpace.SRGB,
  });
  let sum = 0;
  let big = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    sum += d;
    if (d > 24) big++;
  }
  const mean = sum / (a.length / 4);
  const pctBig = (100 * big) / (a.length / 4);
  worst = Math.max(worst, pctBig);
  console.log(`${label.padEnd(6)} mean |Δ| ${mean.toFixed(2)}/255   pixels off by >24: ${pctBig.toFixed(3)}%`);
  [scene, shader, surface, skiaImg, glImg].forEach((o) => o.delete?.());
}
console.log(worst < 0.5 ? 'PASS: SkSL and GLSL agree' : 'CHECK: notable differences — inspect the PNGs');
