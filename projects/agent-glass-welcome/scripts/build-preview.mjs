// Bundles preview/main.ts (+ the shared src/welcome modules) into one
// self-contained HTML file: fonts and token images are inlined as data URIs.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataUri = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`;

const out = await build({
  entryPoints: [join(root, 'preview/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: !process.env.DEBUG,
  write: false,
});

const tokenDir = join(root, 'assets/tokens');
const order = ['check', 'branch', 'report', 'phone', 'globe', 'rocket', 'doc', 'tablet'];
const files = readdirSync(tokenDir);
const tokens = order
  .filter((n) => files.includes(`${n}.png`))
  .map((n) => dataUri(join(tokenDir, `${n}.png`), 'image/png'));

const html = readFileSync(join(root, 'preview/template.html'), 'utf8')
  .replace('__FONT_400__', dataUri(join(root, 'assets/fonts/SourceSerif4_400Regular.ttf'), 'font/ttf'))
  .replace('__FONT_500__', dataUri(join(root, 'assets/fonts/SourceSerif4_500Medium.ttf'), 'font/ttf'))
  .replace('__TOKENS__', JSON.stringify(tokens))
  .replace('__BUNDLE__', () => out.outputFiles[0].text.replace(/<\/script/g, '<\\/script'));

mkdirSync(join(root, 'preview/dist'), { recursive: true });
const dest = join(root, 'preview/dist/glass-welcome.html');
writeFileSync(dest, html);
console.log(`wrote ${dest} (${(html.length / 1024).toFixed(0)} KB)`);
