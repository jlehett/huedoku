/**
 * Migrations from older save formats.
 *
 * Schema 1 (the first prototype) kept everything under one "save" key:
 *   { version: 1, settings: { sound, dark, palette, showMistakes },
 *     current: { difficulty, puzzle, solution, board, notes: number[][], seconds,
 *                mistakes, hints, history: { cell, from, to }[] } | null,
 *     stats: { [difficulty]: { played, won, bestSeconds, totalSeconds } },
 *     dailies: { [date]: { seconds, mistakes, hints, grid, givens } } }
 * Schema 2 splits it into meta / game:<slot> / daily:<date> records.
 */
import { DIFFICULTIES, type Difficulty } from '../engine/logic/types';
import { dailyDifficulty } from '../engine/daily';
import { defaultMeta, wrap, type Envelope, type Meta } from './schema';
import type { DailyRecord, GameState, Move } from '../state/types';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function isV1Save(x: unknown): boolean {
  return isObj(x) && x.version === 1;
}

/** Convert a schema-1 blob into schema-2 records (key -> envelope). */
export function migrateV1(x: Record<string, unknown>, now: number): Record<string, Envelope<unknown>> {
  const out: Record<string, Envelope<unknown>> = {};
  const meta: Meta = defaultMeta(now);
  const s = isObj(x.settings) ? x.settings : {};
  if (typeof s.sound === 'boolean') meta.settings.sound = s.sound;
  if (typeof s.dark === 'boolean') meta.settings.theme = s.dark ? 'dark' : 'light';
  if (s.showMistakes === false) meta.settings.mistakeMode = 'off';
  meta.settings.tutorialDone = true; // they have played before

  const stats = isObj(x.stats) ? x.stats : {};
  for (const d of DIFFICULTIES) {
    const o = stats[d];
    if (!isObj(o)) continue;
    const b = meta.stats.classic[d];
    b.started = Number(o.played) || 0;
    b.solved = Number(o.won) || 0;
    b.totalTimeMs = (Number(o.totalSeconds) || 0) * 1000;
    b.bestTimeMs = Number(o.bestSeconds) ? Number(o.bestSeconds) * 1000 : null;
  }

  const cur = x.current;
  if (isObj(cur) && typeof cur.puzzle === 'string' && typeof cur.solution === 'string') {
    const difficulty = (DIFFICULTIES as readonly string[]).includes(String(cur.difficulty)) ? (cur.difficulty as Difficulty) : 'easy';
    const givens = cur.puzzle.replace(/\./g, '0');
    const board = typeof cur.board === 'string' ? cur.board.replace(/\./g, '0') : givens;
    const notes = Array.isArray(cur.notes)
      ? cur.notes.map((ds) => (Array.isArray(ds) ? ds.reduce((m: number, d) => (typeof d === 'number' && d >= 1 && d <= 9 ? m | (1 << (d - 1)) : m), 0) : 0))
      : new Array(81).fill(0);
    const history: Move[] = Array.isArray(cur.history)
      ? cur.history
          .filter((h): h is Record<string, number> => isObj(h) && typeof h.cell === 'number')
          .map((h) => ({ kind: 'place' as const, cell: h.cell, changes: [{ i: h.cell, v0: h.from | 0, v1: h.to | 0, n0: 0, n1: 0 }] }))
      : [];
    const game: GameState = {
      id: `migrated-${now}`,
      mode: 'classic',
      difficulty,
      variant: 'classic',
      givens,
      solution: cur.solution,
      values: Array.from(board, (c) => c.charCodeAt(0) - 48),
      notes: Array.from({ length: 81 }, (_, i) => notes[i] ?? 0),
      history,
      future: [],
      selected: null,
      notesMode: false,
      brush: null,
      elapsedMs: (Number(cur.seconds) || 0) * 1000,
      mistakes: Number(cur.mistakes) || 0,
      hintsUsed: Number(cur.hints) || 0,
      limitWaived: false,
      status: 'playing',
      startedAt: now,
      updatedAt: now,
      placements: [],
      checked: [],
    };
    out[`game:classic:${difficulty}`] = wrap(game);
    meta.currentSlot = `classic:${difficulty}`;
    meta.lastDifficulty = difficulty;
  }

  const dailies = isObj(x.dailies) ? x.dailies : {};
  for (const [date, rec] of Object.entries(dailies)) {
    if (!isObj(rec) || typeof rec.grid !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const d: DailyRecord = {
      dateKey: date,
      difficulty: dailyDifficulty(date),
      solvedAt: now,
      timeMs: (Number(rec.seconds) || 0) * 1000,
      mistakes: Number(rec.mistakes) || 0,
      hints: Number(rec.hints) || 0,
      archive: false,
      grid: rec.grid,
      givens: typeof rec.givens === 'string' ? rec.givens : '0'.repeat(81),
      placements: [],
    };
    out[`daily:${date}`] = wrap(d);
  }
  out.meta = wrap(meta);
  return out;
}
