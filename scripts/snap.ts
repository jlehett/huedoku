/**
 * Dev helper: open the app in an emulated phone, run a few steps, save screenshots.
 *   npx tsx scripts/snap.ts <url> <outPrefix> <device: iphone|pixel> [theme] '<steps json>'
 * Steps: [{"click":"selector"}, {"tap":[x,y]}, {"wait":ms}, {"eval":"js"}, {"shot":"name"}, {"key":"1"}]
 */
import { chromium, devices, webkit, type Page } from '@playwright/test';

const [url = 'http://localhost:5180', out = 'artifacts/tmp/snap', dev = 'iphone', theme = 'dark', stepsJson = '[]'] = process.argv.slice(2);

const DEVICES = {
  iphone: { engine: webkit, profile: devices['iPhone 14'] },
  pixel: { engine: chromium, profile: devices['Pixel 7'] },
};

async function main() {
  const d = DEVICES[dev as keyof typeof DEVICES];
  const browser = await d.engine.launch();
  const ctx = await browser.newContext({ ...d.profile, colorScheme: theme as 'dark' | 'light' });
  const page: Page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text());
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForSelector('html[data-ready="true"]', { timeout: 15000 });
  await page.waitForTimeout(400);
  const steps = JSON.parse(stepsJson) as Record<string, unknown>[];
  let n = 0;
  for (const s of steps) {
    if (s.click) await page.click(String(s.click));
    if (s.tap) {
      const [x, y] = s.tap as [number, number];
      await page.mouse.click(x, y);
    }
    if (s.tapEl) {
      let sel = String(s.tapEl);
      // ${expr} is evaluated in the page, e.g. ".cell[data-i='${window.__t.i}']"
      const m = /\$\{(.+?)\}/.exec(sel);
      if (m) sel = sel.replace(m[0], String(await page.evaluate(m[1])));
      const box = await page.locator(sel).first().boundingBox();
      if (!box) throw new Error(`no element ${sel}`);
      await page.mouse.click(box.x + box.width / 2 + Number(s.dx ?? 0), box.y + box.height / 2 + Number(s.dy ?? 0));
    }
    if (s.repeat) {
      // {"repeat": n, "every": ms, "clip": [...] | "clipEl": sel, "pad": px, "name": "x"}: a burst of timed screenshots
      if (s.clipEl) {
        let sel = String(s.clipEl);
        const m = /\$\{(.+?)\}/.exec(sel);
        if (m) sel = sel.replace(m[0], String(await page.evaluate(m[1])));
        const box = (await page.locator(sel).first().boundingBox())!;
        const pad = Number(s.pad ?? 30);
        s.clip = [Math.max(0, box.x - pad), Math.max(0, box.y - pad), box.width + pad * 2, box.height + pad * 2];
      }
      const t0 = Date.now();
      for (let k = 0; k < Number(s.repeat); k++) {
        const clip = s.clip as [number, number, number, number] | undefined;
        await page.screenshot({ path: `${out}-${dev}-${theme}-${s.name}-${String(k).padStart(2, '0')}.png`, clip: clip ? { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } : undefined });
        const next = t0 + (k + 1) * Number(s.every);
        const wait = next - Date.now();
        if (wait > 0) await page.waitForTimeout(wait);
      }
      console.log('burst', s.name, 'done in', Date.now() - t0, 'ms');
    }
    if (s.key) await page.keyboard.press(String(s.key));
    if (s.eval) console.log('eval:', JSON.stringify(await page.evaluate(String(s.eval))));
    if (s.wait) await page.waitForTimeout(Number(s.wait));
    if (s.shot !== undefined) {
      const file = `${out}-${dev}-${theme}-${s.shot || n++}.png`;
      const clip = s.clip as [number, number, number, number] | undefined;
      await page.screenshot({ path: file, clip: clip ? { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } : undefined });
      console.log('saved', file);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
