/**
 * Subsets the self-hosted fonts to the glyphs the app uses (printable ASCII
 * plus a few typographic marks). Run once; output is committed.
 *   npx tsx scripts/subset-fonts.ts
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import subsetFont from 'subset-font';

const TEXT = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '•·–—‘’“”…×✓←→↑↓°';
const FONTS: [string, string][] = [
  ['node_modules/@fontsource/fredoka/files/fredoka-latin-500-normal.woff2', 'fredoka-500.woff2'],
  ['node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff2', 'fredoka-600.woff2'],
  ['node_modules/@fontsource/nunito/files/nunito-latin-600-normal.woff2', 'nunito-600.woff2'],
  ['node_modules/@fontsource/nunito/files/nunito-latin-800-normal.woff2', 'nunito-800.woff2'],
  ['node_modules/@fontsource/caveat-brush/files/caveat-brush-latin-400-normal.woff2', 'caveat-brush-400.woff2'],
];
mkdirSync('src/assets/fonts', { recursive: true });
for (const [src, out] of FONTS) {
  const buf = readFileSync(src);
  const sub = await subsetFont(buf, TEXT, { targetFormat: 'woff2' });
  writeFileSync(`src/assets/fonts/${out}`, sub);
  console.log(out, statSync(src).size, '->', sub.length);
}
