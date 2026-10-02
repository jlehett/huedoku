/**
 * Palette design helper (run by hand; results are pasted into src/color/palettes.ts).
 * Starts from hand-designed target colors and nudges them in OKLCH until every
 * pair differs by CIEDE2000 >= 22 (a margin over the required 20), staying as
 * close to the targets as possible. The CVD palette must also stay apart under
 * simulated protanopia, deuteranopia and tritanopia.
 *
 *   npx tsx scripts/design-palettes.ts [names] [seed]
 */
import { deltaE, hexToOklch, numeralFor, oklchToHex, simulateCvd, type Cvd } from '../src/color/colorScience';
import { rngFrom } from '../src/engine/prng';

interface Spec {
  targets: string[];
  minNormal: number;
  minSim?: number;
}

const SPECS: Record<string, Spec> = {
  'spectrum-dark': { targets: ['#b03a48', '#c8682a', '#c9a227', '#4f9a3c', '#1f8a6e', '#2f72b8', '#4b4fb5', '#7d4bb3', '#b04587'], minNormal: 22 },
  'spectrum-light': { targets: ['#e5484d', '#f08a3c', '#f2c230', '#74c46a', '#2bb39a', '#3f8fe0', '#6563d8', '#a05ee0', '#e0559f'], minNormal: 22 },
  'pastel-dark': { targets: ['#f4a6ae', '#f7c098', '#f3e18f', '#b8e2a1', '#93dcc8', '#a3c9f2', '#b3b3f0', '#d2b1ee', '#f2b0d6'], minNormal: 22 },
  'pastel-light': { targets: ['#f09aa3', '#f5b98c', '#efd97a', '#acd994', '#84d3be', '#94bfee', '#a6a6ec', '#c8a3ea', '#eea3cd'], minNormal: 22 },
  'contrast-dark': { targets: ['#ff3b3b', '#ff9a1f', '#ffe14d', '#3fd13f', '#00d0b0', '#2a8cff', '#5b5bff', '#b056ff', '#ff4fc3'], minNormal: 24 },
  'contrast-light': { targets: ['#d0021b', '#e86a00', '#f5c400', '#1e9e2c', '#008f7a', '#0060df', '#3a2fd0', '#8a1fd6', '#d1007d'], minNormal: 24 },
  'cvd-dark': { targets: ['#d55e00', '#e69f00', '#f0e442', '#7a9a3a', '#009e73', '#56b4e9', '#0072b2', '#9b6bd6', '#cc79a7'], minNormal: 22, minSim: 12 },
  'cvd-light': { targets: ['#d55e00', '#e69f00', '#f0e442', '#7a9a3a', '#009e73', '#56b4e9', '#0072b2', '#9b6bd6', '#cc79a7'], minNormal: 22, minSim: 12 },
};

const CVDS: Cvd[] = ['protanopia', 'deuteranopia', 'tritanopia'];

function minPair(cols: string[]): number {
  let m = Infinity;
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) m = Math.min(m, deltaE(cols[i], cols[j]));
  return m;
}

function evaluate(spec: Spec, p: number[][]) {
  const cols: string[] = [];
  for (const [L, C, h] of p) {
    const hex = oklchToHex(L, C, h);
    if (!hex) return null;
    cols.push(hex);
  }
  const normal = minPair(cols);
  let sim = Infinity;
  if (spec.minSim) for (const t of CVDS) sim = Math.min(sim, minPair(cols.map((c) => simulateCvd(c, t))));
  for (const c of cols) if (numeralFor(c).ratio < 4.5) return null;
  let dev = 0;
  cols.forEach((c, i) => (dev += deltaE(c, spec.targets[i]) ** 2));
  const penalty = dev + 200 * Math.max(0, spec.minNormal - normal) ** 2 + (spec.minSim ? 200 * Math.max(0, spec.minSim - sim) ** 2 : 0);
  return { penalty, cols, normal, sim, dev };
}

function optimize(name: string, seed: string) {
  const spec = SPECS[name];
  const rng = rngFrom(seed + name);
  const rand = (lo: number, hi: number) => lo + (hi - lo) * rng.float();
  const start = spec.targets.map((t) => hexToOklch(t));
  let best: NonNullable<ReturnType<typeof evaluate>> | null = null;
  for (let restart = 0; restart < 12; restart++) {
    let p = start.map((x) => x.slice());
    let cur = evaluate(spec, p);
    if (!cur) {
      p = p.map(([L, C, h]) => [L, C * 0.8, h]);
      cur = evaluate(spec, p);
    }
    if (!cur) continue;
    let step = 0.06;
    for (let it = 0; it < 4000; it++) {
      const q = p.map((x) => x.slice());
      const i = rng.int(9);
      q[i][0] = Math.min(0.97, Math.max(0.25, q[i][0] + rand(-step, step)));
      q[i][1] = Math.max(0.01, q[i][1] + rand(-step, step) * 0.5);
      q[i][2] = q[i][2] + rand(-step, step) * 50;
      const e = evaluate(spec, q);
      if (e && e.penalty <= cur.penalty) {
        p = q;
        cur = e;
      }
      if (it % 800 === 799) step *= 0.6;
    }
    if (!best || cur.penalty < best.penalty) best = cur;
  }
  console.log(`${name}: minDE ${best!.normal.toFixed(1)} minSimDE ${best!.sim.toFixed(1)} deviation ${Math.sqrt(best!.dev / 9).toFixed(1)}`);
  console.log(`  ${JSON.stringify(best!.cols)}`);
}

const names = process.argv[2] ? process.argv[2].split(',') : Object.keys(SPECS);
for (const n of names) optimize(n, process.argv[3] ?? 'p2');
