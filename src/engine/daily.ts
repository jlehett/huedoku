/**
 * Daily Huedoku: one puzzle per calendar date, derived only from the date
 * string so every device produces the same grid offline.
 *
 * seed = "huedoku/daily/v1/YYYY-MM-DD" -> cyrb128 -> sfc32.
 * Difficulty follows the weekday: Mon Easy, Tue/Wed Medium, Thu/Fri Hard,
 * Sat Expert, Sun Master.
 *
 * Easy, Medium, Expert and Master are generated from the seed on the device.
 * Hard needs triples/X-Wing but nothing harder, which only ~0.4% of carved
 * grids satisfy, so on-device generation can take seconds on a phone. Hard
 * dailies therefore come from the bundled daily bank slice: the date picks the
 * entry and seeds a symmetry-preserving isomorphism (see bank.ts).
 */
import { dailyFromBank, type BankFile } from './bank';
import { dailySeed } from './seeds';
import { dayNumber, weekdayOf } from './dates';
import { generate, type Puzzle } from './generator';
import type { Difficulty } from './logic/types';
import { rngFrom } from './prng';

export { dailySeed };

/** 0 = Sunday ... 6 = Saturday */
export const WEEKDAY_DIFFICULTY: readonly Difficulty[] = ['master', 'easy', 'medium', 'medium', 'hard', 'hard', 'expert'];
export const DAILY_FROM_BANK: ReadonlySet<Difficulty> = new Set<Difficulty>(['hard']);

export function dailyDifficulty(key: string): Difficulty {
  return WEEKDAY_DIFFICULTY[weekdayOf(key)];
}

/** How many earlier dates (since 1970) share this date's difficulty: unique per date and difficulty. */
export function dailyOccurrence(key: string): number {
  const wd = weekdayOf(key);
  const slots = WEEKDAY_DIFFICULTY.flatMap((d, i) => (d === WEEKDAY_DIFFICULTY[wd] ? [i] : []));
  return Math.floor(dayNumber(key) / 7) * slots.length + slots.indexOf(wd);
}

export function generateDaily(key: string, bank: BankFile): Puzzle {
  const difficulty = dailyDifficulty(key);
  if (DAILY_FROM_BANK.has(difficulty)) return dailyFromBank(bank, key, difficulty, dailyOccurrence(key));
  const p = generate({ difficulty, rng: rngFrom(dailySeed(key)), symmetric: true });
  if (!p) throw new Error('unreachable: unlimited attempts');
  return p;
}
