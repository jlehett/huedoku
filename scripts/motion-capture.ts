/**
 * Records each key moment as a frame strip. The app's motion system is slowed
 * down with a time scale so in-between frames can be captured with ordinary
 * screenshots; strips land in docs/motion/.
 *   npx tsx scripts/motion-capture.ts [url] [device] [scene,...]
 */
import { chromium, devices, webkit, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5180';
const dev = (process.argv[3] ?? 'iphone') as 'iphone' | 'pixel';
const only = process.argv[4]?.split(',');
const OUT = 'docs/motion';

const DEV = { iphone: { engine: webkit, profile: devices['iPhone 14'] }, pixel: { engine: chromium, profile: devices['Pixel 7'] } };

type Clip = { x: number; y: number; width: number; height: number };

export async function rectOf(page: Page, sel: string, pad: number): Promise<Clip> {
  const r = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
    const x0 = Math.min(...els.map((r) => r.left)), y0 = Math.min(...els.map((r) => r.top));
    const x1 = Math.max(...els.map((r) => r.right)), y1 = Math.max(...els.map((r) => r.bottom));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }, sel);
  const vw = page.viewportSize()!;
  const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
  return { x, y, width: Math.min(vw.width - x, r.width + pad * 2), height: Math.min(vw.height - y, r.height + pad * 2) };
}

async function burst(page: Page, clip: Clip, frames: number, everyMs: number) {
  const shots: string[] = [];
  const t0 = Date.now();
  for (let k = 0; k < frames; k++) {
    const buf = await page.screenshot({ clip });
    shots.push(buf.toString('base64'));
    const wait = t0 + (k + 1) * everyMs - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
  return { shots, real: Date.now() - t0 };
}

async function compose(page: Page, title: string, shots: string[], cols: number, scale: number, out: string, frameMs: number) {
  const w = Math.round(980 / cols);
  const cells = shots
    .map((s, k) => `<div style="position:relative"><img src="data:image/png;base64,${s}" style="display:block;width:100%"><span style="position:absolute;left:3px;top:2px;background:#000a;padding:0 4px;border-radius:3px">${Math.round(k * frameMs)} ms</span></div>`)
    .join('');
  await page.setContent(
    `<body style="margin:0;background:#1a1d22;font:13px system-ui;color:#ddd"><div id="g" style="padding:8px;width:max-content"><div style="margin:0 0 6px 2px">${title}: ${shots.length} frames, ${frameMs.toFixed(0)} ms apart in real time (captured at 1/${scale} speed)</div><div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px">${cells}</div></div></body>`,
  );
  await page.waitForTimeout(150);
  await page.locator('#g').screenshot({ path: out });
}

async function setup(page: Page, difficulty = 'easy') {
  await page.goto(url);
  await page.waitForSelector('html[data-ready="true"]');
  await page.evaluate(async (d) => {
    const h = window.__huedoku!;
    await h.store.updateSettings({ tutorialDone: true });
    await h.store.newClassic(d as never);
  }, difficulty);
  await page.waitForTimeout(900);
}

const SCALE = 6;

interface SceneSpec {
  title: string;
  clip: Clip;
  frames: number;
  every: number;
  cols: number;
}

const firstEmpty = (from = 30) =>
  `(() => { const g = window.__huedoku.store.state.game; for (let i = ${from}; i < 81; i++) if (!g.values[i]) return { i, d: +g.solution[i] }; for (let i = 0; i < 81; i++) if (!g.values[i]) return { i, d: +g.solution[i] }; })()`;

export const scenes: Record<string, (page: Page) => Promise<SceneSpec>> = {
  async place(page) {
    await setup(page);
    const t = (await page.evaluate(firstEmpty())) as { i: number; d: number };
    const b = (await page.locator(`.cell[data-i="${t.i}"]`).boundingBox())!;
    await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.72);
    await page.waitForTimeout(300);
    const clip = await rectOf(page, `.cell[data-i="${t.i}"]`, 36);
    await page.evaluate((s) => window.__huedoku!.motion.setTimeScale(s), SCALE);
    await page.locator(`.pad-btn[data-d="${t.d}"]`).click();
    return { title: 'Placing a digit (tapped left-low in the cell, then the pad)', clip, frames: 14, every: 45 * SCALE, cols: 7 };
  },
  async unit(page) {
    await setup(page);
    const t = await page.evaluate(() => {
      const s = window.__huedoku!.store;
      const g = s.state.game!;
      let target = -1;
      for (let i = 0; i < 81; i++) if (!g.values[i]) { target = i; break; }
      const r = Math.floor(target / 9), c = target % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const cells: number[] = [];
      for (let i = 0; i < 81; i++) {
        const ri = Math.floor(i / 9), ci = i % 9, bi = Math.floor(ri / 3) * 3 + Math.floor(ci / 3);
        if (i !== target && (ri === r || ci === c || bi === b)) cells.push(i);
      }
      s.debugFill(cells);
      s.select(target);
      return { i: target, d: +g.solution[target] };
    });
    await page.waitForTimeout(400);
    const clip = await rectOf(page, '.board', 6);
    await page.evaluate((s) => window.__huedoku!.motion.setTimeScale(s), SCALE);
    await page.locator(`.pad-btn[data-d="${t.d}"]`).click();
    return { title: 'Row + column + box completed by one placement (waves merge per cell)', clip, frames: 16, every: 50 * SCALE, cols: 4 };
  },
  async digit(page) {
    await setup(page);
    const t = await page.evaluate(() => {
      const s = window.__huedoku!.store;
      const g = s.state.game!;
      const d = 5;
      const cells: number[] = [];
      for (let i = 0; i < 81; i++) if (+g.solution[i] === d && !g.values[i]) cells.push(i);
      const last = cells.pop()!;
      s.debugFill(cells);
      s.select(last);
      return { i: last, d };
    });
    await page.waitForTimeout(400);
    const clip = await rectOf(page, '.board, .pad', 4);
    await page.evaluate((s) => window.__huedoku!.motion.setTimeScale(s), SCALE);
    await page.locator(`.pad-btn[data-d="${t.d}"]`).click();
    return { title: 'Ninth copy of a digit: the color pulses and its pad key retires', clip, frames: 12, every: 70 * SCALE, cols: 4 };
  },
  async mistake(page) {
    await setup(page);
    const t = await page.evaluate(() => {
      const s = window.__huedoku!.store;
      const g = s.state.game!;
      for (let i = 30; i < 81; i++)
        if (!g.values[i]) {
          s.select(i);
          return { i, d: (+g.solution[i] % 9) + 1 };
        }
      return { i: 0, d: 1 };
    });
    await page.waitForTimeout(300);
    const clip = await rectOf(page, `.cell[data-i="${t.i}"]`, 40);
    await page.evaluate((s) => window.__huedoku!.motion.setTimeScale(s), SCALE);
    await page.locator(`.pad-btn[data-d="${t.d}"]`).click();
    return { title: 'A wrong entry: short shake, dashed ring with a corner mark', clip, frames: 12, every: 40 * SCALE, cols: 6 };
  },
  async notes(page) {
    await setup(page);
    const t = await page.evaluate(() => {
      const s = window.__huedoku!.store;
      const g = s.state.game!;
      let target = -1;
      for (let i = 30; i < 81; i++) if (!g.values[i]) { target = i; break; }
      const d = +g.solution[target];
      const r = Math.floor(target / 9), c = target % 9;
      const entries: [number, number][] = [];
      for (let i = 0; i < 81; i++) {
        if (g.values[i] || i === target) continue;
        const ri = Math.floor(i / 9), ci = i % 9;
        const sameBox = Math.floor(ri / 3) === Math.floor(r / 3) && Math.floor(ci / 3) === Math.floor(c / 3);
        if (ri === r || ci === c || sameBox) entries.push([i, (1 << (d - 1)) | (1 << (d % 9))]);
      }
      s.debugNotes(entries);
      s.select(target);
      return { i: target, d };
    });
    await page.waitForTimeout(400);
    const clip = await rectOf(page, '.board', 4);
    await page.evaluate((s) => window.__huedoku!.motion.setTimeScale(s), SCALE);
    await page.locator(`.pad-btn[data-d="${t.d}"]`).click();
    return { title: 'Notes cleanup: matching pencil marks lift off, nearest first', clip, frames: 10, every: 45 * SCALE, cols: 5 };
  },
  async undo(page) {
    await setup(page);
    const t = (await page.evaluate(firstEmpty())) as { i: number; d: number };
    const b = (await page.locator(`.cell[data-i="${t.i}"]`).boundingBox())!;
    await page.mouse.click(b.x + b.width * 0.75, b.y + b.height * 0.25);
    await page.locator(`.pad-btn[data-d="${t.d}"]`).click();
    await page.waitForTimeout(900);
    const clip = await rectOf(page, `.cell[data-i="${t.i}"]`, 36);
    await page.evaluate((s) => window.__huedoku!.motion.setTimeScale(s), SCALE);
    await page.locator('.tool[data-fx="undo"]').click();
    return { title: 'Undo: the color drains back to the tap point (top-right)', clip, frames: 10, every: 30 * SCALE, cols: 5 };
  },
  async solve(page) {
    await setup(page);
    const t = await page.evaluate(() => {
      const s = window.__huedoku!.store;
      const g = s.state.game!;
      const empty: number[] = [];
      for (let i = 0; i < 81; i++) if (!g.values[i]) empty.push(i);
      const last = empty.pop()!;
      s.debugFill(empty);
      s.select(last);
      return { i: last, d: +g.solution[last] };
    });
    await page.waitForTimeout(400);
    const clip = await rectOf(page, '.board', 8);
    await page.evaluate((s) => window.__huedoku!.motion.setTimeScale(s), 3);
    await page.locator(`.pad-btn[data-d="${t.d}"]`).click();
    return { title: 'Solve finale: colors light in spectrum order, a light pass, then pigment drifts up', clip, frames: 16, every: 240 * 3, cols: 4 };
  },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const d = DEV[dev];
  const browser = await d.engine.launch();
  for (const [name, scene] of Object.entries(scenes)) {
    if (only && !only.includes(name)) continue;
    const ctx = await browser.newContext({ ...d.profile, colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    const spec = await scene(page);
    const scale = Number(await page.evaluate(() => window.__huedoku!.motion.timeScale));
    const shot = await burst(page, spec.clip, spec.frames, spec.every);
    await compose(page, spec.title, shot.shots, spec.cols, scale, `${OUT}/${name}-${dev}.png`, spec.every / scale);
    console.log(`${name}: ${spec.frames} frames, burst ${shot.real} ms`);
    await ctx.close();
  }
  await browser.close();
}

if (process.argv[1]?.endsWith('motion-capture.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
