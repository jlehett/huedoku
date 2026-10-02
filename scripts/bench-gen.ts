import { generate, carve } from '../src/engine/generator';
import { grade } from '../src/engine/logic';
import { rngFrom } from '../src/engine/prng';
import { randomSolution } from '../src/engine/solver';
import { classic } from '../src/engine/variant';
import type { Difficulty } from '../src/engine/logic/types';

const which = (process.argv[2] ?? 'easy,medium,hard') as string;
for (const d of which.split(',') as Difficulty[]) {
  const rng = rngFrom('bench-' + d);
  const n = Number(process.argv[3] ?? 10);
  const t0 = performance.now();
  let clues = 0;
  for (let i = 0; i < n; i++) {
    const p = generate({ difficulty: d, rng })!;
    clues += p.clues;
  }
  console.log(d, 'avg ms', ((performance.now() - t0) / n).toFixed(1), 'avg clues', (clues / n).toFixed(1));
}
// distribution of minimal symmetric puzzles
if (process.argv[4]) {
  const rng = rngFrom('dist');
  const hist: Record<string, number> = {};
  const M = Number(process.argv[4]);
  const t0 = performance.now();
  for (let i = 0; i < M; i++) {
    const sol = randomSolution(rng);
    const g = carve(sol, { difficulty: 'master', rng, symmetric: true, variant: classic });
    const r = grade(g);
    const k = r.solved ? String(r.tier) : 'X';
    hist[k] = (hist[k] ?? 0) + 1;
  }
  console.log('minimal dist', hist, 'ms/each', ((performance.now() - t0) / M).toFixed(1));
}
