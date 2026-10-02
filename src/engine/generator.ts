/**
 * Puzzle generator: random full grid, then remove givens (in 180-degree
 * rotational pairs for Classic) while the puzzle stays unique and no harder
 * than the target. A result is accepted only when its grade equals the target.
 */
import { grade } from './logic';
import { DIFFICULTY_TIER, type Difficulty } from './logic/types';
import type { Rng } from './prng';
import { randomSolution, solve } from './solver';
import { classic, type Variant } from './variant';

export interface Puzzle {
  /** 81 chars, '0' for empty. */
  givens: string;
  /** 81 chars, the unique solution. */
  solution: string;
  difficulty: Difficulty;
  /** Number of givens. */
  clues: number;
}

export interface GenerateOptions {
  difficulty: Difficulty;
  rng: Rng;
  variant?: Variant;
  symmetric?: boolean;
  /** Give up after this many full grids (default: unlimited). */
  maxAttempts?: number;
}

/** Floors keep the easier grades friendly instead of minimal. */
export const MIN_CLUES: Record<Difficulty, number> = { easy: 36, medium: 30, hard: 25, expert: 0, master: 0 };

export const gridToString = (g: ArrayLike<number>) => Array.from(g, (d) => String(d)).join('');
export const stringToGrid = (s: string) => Uint8Array.from(s, (ch) => (ch >= '1' && ch <= '9' ? ch.charCodeAt(0) - 48 : 0));

function removalOrder(rng: Rng, symmetric: boolean): number[][] {
  const groups: number[][] = [];
  if (symmetric) {
    for (let i = 0; i < 40; i++) groups.push([i, 80 - i]);
    groups.push([40]);
  } else {
    for (let i = 0; i < 81; i++) groups.push([i]);
  }
  return rng.shuffle(groups);
}

/** Try one full grid. Returns a puzzle no harder than the target (may be easier). */
export function carve(sol: Uint8Array, opts: Required<Pick<GenerateOptions, 'difficulty' | 'rng' | 'symmetric'>> & { variant: Variant }): Uint8Array {
  const target = DIFFICULTY_TIER[opts.difficulty];
  const minClues = MIN_CLUES[opts.difficulty];
  const grid = sol.slice();
  let clues = 81;
  // Expert and Master: carve to a minimal puzzle on uniqueness alone, grade at the end.
  const capped = target <= 3;
  for (const group of removalOrder(opts.rng, opts.symmetric)) {
    if (clues - group.length < minClues) continue;
    const saved = group.map((i) => grid[i]);
    for (const i of group) grid[i] = 0;
    let ok = solve(grid, opts.variant, 2).count === 1;
    if (ok && capped && clues - group.length < 50) ok = grade(grid, opts.variant, target).solved;
    if (ok) clues -= group.length;
    else group.forEach((i, k) => (grid[i] = saved[k]));
  }
  return grid;
}

export function generate(opts: GenerateOptions): Puzzle | null {
  const variant = opts.variant ?? classic;
  const symmetric = opts.symmetric ?? true;
  const target = DIFFICULTY_TIER[opts.difficulty];
  const max = opts.maxAttempts ?? Infinity;
  for (let attempt = 0; attempt < max; attempt++) {
    const sol = randomSolution(opts.rng, variant);
    const grid = carve(sol, { difficulty: opts.difficulty, rng: opts.rng, symmetric, variant });
    const g = grade(grid, variant, 5);
    if (g.solved && g.tier === target) {
      return {
        givens: gridToString(grid),
        solution: gridToString(sol),
        difficulty: opts.difficulty,
        clues: grid.reduce((n, d) => n + (d ? 1 : 0), 0),
      };
    }
  }
  return null;
}

/** Fully verify a puzzle string: unique, solution matches, grade equals label. */
export function verifyPuzzle(p: Pick<Puzzle, 'givens' | 'difficulty'> & { solution?: string }, variant: Variant = classic) {
  const grid = stringToGrid(p.givens);
  const r = solve(grid, variant, 2);
  const g = grade(grid, variant, 5);
  const unique = r.count === 1;
  const solutionMatches = !p.solution || (r.solution !== null && gridToString(r.solution) === p.solution);
  return {
    unique,
    solutionMatches,
    solved: g.solved,
    tier: g.tier,
    gradeMatches: g.solved && g.tier === DIFFICULTY_TIER[p.difficulty],
    solution: r.solution ? gridToString(r.solution) : null,
  };
}

export function isRotationallySymmetric(givens: string): boolean {
  for (let i = 0; i < 81; i++) if ((givens[i] !== '0') !== (givens[80 - i] !== '0')) return false;
  return true;
}
