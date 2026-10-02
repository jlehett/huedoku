/**
 * Exact solver: bitmask constraint propagation (naked + hidden singles) with
 * minimum-remaining-values backtracking. Used to prove uniqueness, to build
 * random solution grids, and to validate custom puzzles.
 */
import { ALL, LOW, POP } from './bits';
import type { Rng } from './prng';
import { classic, type Variant } from './variant';

export interface SolveResult {
  /** Number of solutions found, capped at `limit`. */
  count: number;
  /** First solution found, or null. */
  solution: Uint8Array | null;
  /** True when the givens themselves conflict. */
  invalid: boolean;
}

interface Tables {
  peers: Int16Array[];
  units: Int16Array[];
}

const tableCache = new WeakMap<Variant, Tables>();
function tables(v: Variant): Tables {
  let t = tableCache.get(v);
  if (!t) {
    t = {
      peers: v.peers.map((p) => Int16Array.from(p)),
      units: v.units.map((u) => Int16Array.from(u.cells)),
    };
    tableCache.set(v, t);
  }
  return t;
}

class Search {
  count = 0;
  solution: Uint8Array | null = null;
  nodes = 0;
  constructor(
    private t: Tables,
    private limit: number,
    private rng: Rng | undefined,
    private nodeLimit: number,
  ) {}

  assign(vals: Uint8Array, cand: Uint16Array, i: number, d: number): boolean {
    vals[i] = d;
    cand[i] = 0;
    const b = 1 << (d - 1);
    const ps = this.t.peers[i];
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (cand[p] & b) {
        cand[p] &= ~b;
        if (cand[p] === 0 && vals[p] === 0) return false;
      } else if (vals[p] === d) {
        return false;
      }
    }
    return true;
  }

  propagate(vals: Uint8Array, cand: Uint16Array): boolean {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < 81; i++) {
        if (vals[i] === 0) {
          const c = cand[i];
          if (c === 0) return false;
          if (POP[c] === 1) {
            if (!this.assign(vals, cand, i, LOW[c])) return false;
            changed = true;
          }
        }
      }
      const units = this.t.units;
      for (let u = 0; u < units.length; u++) {
        const cells = units[u];
        let once = 0, twice = 0, placed = 0;
        for (let k = 0; k < 9; k++) {
          const i = cells[k];
          if (vals[i]) {
            placed |= 1 << (vals[i] - 1);
          } else {
            const c = cand[i];
            twice |= once & c;
            once |= c;
          }
        }
        if ((once | placed) !== ALL) return false;
        let singles = once & ~twice & ~placed;
        while (singles) {
          const b = singles & -singles;
          singles &= ~b;
          const d = LOW[b];
          for (let k = 0; k < 9; k++) {
            const i = cells[k];
            if (vals[i] === 0 && cand[i] & b) {
              if (!this.assign(vals, cand, i, d)) return false;
              changed = true;
              break;
            }
          }
        }
      }
    }
    return true;
  }

  run(vals: Uint8Array, cand: Uint16Array): void {
    if (this.count >= this.limit || this.nodes > this.nodeLimit) return;
    this.nodes++;
    if (!this.propagate(vals, cand)) return;
    let best = -1, bestPop = 10;
    for (let i = 0; i < 81; i++) {
      if (vals[i] === 0) {
        const p = POP[cand[i]];
        if (p < bestPop) {
          bestPop = p;
          best = i;
          if (p === 2) break;
        }
      }
    }
    if (best < 0) {
      this.count++;
      if (!this.solution) this.solution = vals.slice();
      return;
    }
    let mask = cand[best];
    const digits: number[] = [];
    while (mask) {
      const b = mask & -mask;
      mask &= ~b;
      digits.push(LOW[b]);
    }
    if (this.rng) this.rng.shuffle(digits);
    for (const d of digits) {
      const v2 = vals.slice();
      const c2 = cand.slice();
      if (this.assign(v2, c2, best, d)) this.run(v2, c2);
      if (this.count >= this.limit) return;
    }
  }
}

/**
 * Count solutions of `grid` (81 values, 0 = empty) up to `limit`.
 * Pass an Rng to randomize branching (used to build random full grids).
 */
export function solve(
  grid: ArrayLike<number>,
  variant: Variant = classic,
  limit = 2,
  rng?: Rng,
  nodeLimit = 1e7,
): SolveResult {
  const t = tables(variant);
  const vals = new Uint8Array(81);
  const cand = new Uint16Array(81).fill(ALL);
  const s = new Search(t, limit, rng, nodeLimit);
  for (let i = 0; i < 81; i++) {
    const d = grid[i];
    if (d) {
      if (d < 1 || d > 9 || !(cand[i] & (1 << (d - 1))) || vals[i]) {
        return { count: 0, solution: null, invalid: true };
      }
      if (!s.assign(vals, cand, i, d)) return { count: 0, solution: null, invalid: true };
    }
  }
  s.run(vals, cand);
  return { count: s.count, solution: s.solution, invalid: false };
}

export function hasUniqueSolution(grid: ArrayLike<number>, variant: Variant = classic): boolean {
  return solve(grid, variant, 2).count === 1;
}

/** A uniformly shuffled complete grid. */
export function randomSolution(rng: Rng, variant: Variant = classic): Uint8Array {
  const r = solve(new Uint8Array(81), variant, 1, rng);
  if (!r.solution) throw new Error('Variant has no solution grid');
  return r.solution;
}

/** True when the placed digits break no unit (duplicates). */
export function findConflicts(grid: ArrayLike<number>, variant: Variant = classic): Set<number> {
  const out = new Set<number>();
  for (const u of variant.units) {
    for (let a = 0; a < 9; a++) {
      const ca = u.cells[a];
      if (!grid[ca]) continue;
      for (let b = a + 1; b < 9; b++) {
        const cb = u.cells[b];
        if (grid[cb] === grid[ca]) {
          out.add(ca);
          out.add(cb);
        }
      }
    }
  }
  return out;
}
