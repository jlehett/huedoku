/**
 * Sudoku isomorphisms: relabel digits, permute bands/rows/stacks/columns, and
 * transpose. These keep uniqueness and the logical grade. `symmetricTransform`
 * only picks permutations that commute with 180-degree rotation, so a
 * rotationally symmetric puzzle stays symmetric.
 */
import type { Rng } from './prng';

export interface Transform {
  rows: number[];
  cols: number[];
  transpose: boolean;
  /** digits[d] = new digit for old digit d (index 0 unused). */
  digits: number[];
}

function symmetricLinePerm(rng: Rng): number[] {
  const perm = new Array<number>(9);
  const outerBand = rng.int(2) === 0 ? 0 : 2;
  const sigma = rng.shuffle([0, 1, 2]);
  for (let r = 0; r < 3; r++) {
    perm[r] = outerBand * 3 + sigma[r];
    perm[8 - r] = 8 - perm[r];
  }
  const midSwap = rng.int(2) === 1;
  perm[3] = midSwap ? 5 : 3;
  perm[4] = 4;
  perm[5] = midSwap ? 3 : 5;
  return perm;
}

export function symmetricTransform(rng: Rng): Transform {
  const digits = [0, ...rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])];
  return { rows: symmetricLinePerm(rng), cols: symmetricLinePerm(rng), transpose: rng.int(2) === 1, digits };
}

export function applyTransform(grid: string, t: Transform): string {
  const out = new Array<string>(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const src = t.rows[r] * 9 + t.cols[c];
      const dst = t.transpose ? c * 9 + r : r * 9 + c;
      const ch = grid[src];
      out[dst] = ch === '0' ? '0' : String(t.digits[ch.charCodeAt(0) - 48]);
    }
  }
  return out.join('');
}
