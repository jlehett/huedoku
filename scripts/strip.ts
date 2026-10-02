/**
 * Compose a folder of frame PNGs into one strip image using a browser canvas.
 *   npx tsx scripts/strip.ts <glob-prefix> <out.png> [cols]
 */
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const [prefix, out, colsArg] = process.argv.slice(2);
const dir = dirname(prefix);
const base = basename(prefix);
const files = readdirSync(dir).filter((f) => f.startsWith(base) && f.endsWith('.png')).sort();
const cols = Number(colsArg ?? files.length);
const imgs = files.map((f) => `data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}`);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<body style="margin:0;background:#222"><div id="g" style="display:grid;grid-template-columns:repeat(${cols},auto);gap:4px;padding:4px;width:max-content">${imgs
  .map((src, k) => `<div style="position:relative"><img src="${src}" style="display:block;width:${Math.round(900 / Math.min(cols, 8))}px"><span style="position:absolute;left:3px;top:2px;color:#fff;font:12px sans-serif;background:#0008;padding:0 3px">${k}</span></div>`)
  .join('')}</div></body>`);
await page.waitForTimeout(200);
await page.locator('#g').screenshot({ path: out });
await browser.close();
console.log('strip', out, files.length, 'frames');
