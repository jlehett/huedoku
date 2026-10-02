/**
 * Pre-generated puzzle bank (made by scripts/gen-bank.ts with this engine's
 * generator, validated by scripts/validate-bank.ts at build time).
 *
 * Puzzles are stored as share codes. The `daily` slices are reserved for the
 * Daily so Classic and Daily never draw the same bank entry. Daily selection
 * is a pure function of the date, so every device picks the same entry.
 */
import { decodeShareCode } from './codec';
import { dailySeed } from './seeds';
import { gridToString, stringToGrid, type Puzzle } from './generator';
import type { Difficulty } from './logic/types';
import { rngFrom } from './prng';
import { solve } from './solver';
import { applyTransform, symmetricTransform } from './transform';

export interface BankFile {
  version: number;
  classic: Partial<Record<Difficulty, string[]>>;
  daily: Partial<Record<Difficulty, string[]>>;
}

export function puzzleFromCode(code: string, difficulty: Difficulty): Puzzle {
  const givens = decodeShareCode(code);
  if (!givens) throw new Error('Corrupt bank entry');
  const r = solve(stringToGrid(givens), undefined, 1);
  if (!r.solution) throw new Error('Bank entry has no solution');
  return { givens, solution: gridToString(r.solution), difficulty, clues: [...givens].filter((c) => c !== '0').length };
}

/** Deterministic permutation of bank indices for a slice. */
function slicePermutation(n: number, tag: string): number[] {
  return rngFrom(`huedoku/bank-perm/${tag}`).shuffle(Array.from({ length: n }, (_, i) => i));
}

/**
 * The daily entry for a date: a fixed permutation walks the slice one entry per
 * occurrence of that difficulty (see dailyOccurrence), then a date-seeded isomorphism (digit relabel,
 * symmetric row/column shuffles, transpose) dresses it up.
 */
export function dailyFromBank(bank: BankFile, key: string, difficulty: Difficulty, occurrence: number): Puzzle {
  const slice = bank.daily[difficulty];
  if (!slice?.length) throw new Error(`No daily bank for ${difficulty}`);
  const perm = slicePermutation(slice.length, `daily/${difficulty}`);
  const idx = perm[((occurrence % slice.length) + slice.length) % slice.length];
  const base = puzzleFromCode(slice[idx], difficulty);
  const t = symmetricTransform(rngFrom(dailySeed(key) + '/transform'));
  return { ...base, givens: applyTransform(base.givens, t), solution: applyTransform(base.solution, t) };
}
