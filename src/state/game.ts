/**
 * Pure game rules. Every action returns the next GameState plus a list of
 * events; the UI turns events into motion, sound and haptics. Nothing here
 * touches the DOM.
 */
import { classic } from '../engine/variant';
import type { Puzzle } from '../engine/generator';
import type { CellChange, GameDifficulty, GameState, Mode, Move, MoveKind, Settings } from './types';

export type GameEvent =
  | { type: 'placeDigit'; cell: number; digit: number; redo?: boolean }
  | { type: 'erase'; cell: number; digit: number }
  | { type: 'mistake'; cell: number; digit: number }
  | { type: 'conflict'; cell: number; cells: number[] }
  | { type: 'unitComplete'; units: number[]; cell: number }
  | { type: 'digitComplete'; digit: number }
  | { type: 'solve' }
  | { type: 'fullButWrong' }
  | { type: 'failed' }
  | { type: 'noteToggle'; cell: number; digit: number; on: boolean }
  | { type: 'notesBatch'; cells: number[] }
  | { type: 'noteCleared'; origin: number; cleared: { cell: number; digit: number }[] }
  | { type: 'undo'; move: Move }
  | { type: 'redo'; move: Move }
  | { type: 'blocked'; cell: number; reason: 'given' | 'solved' | 'nothing' };

export interface Result {
  state: GameState;
  events: GameEvent[];
}

const v = classic;
const bit = (d: number) => 1 << (d - 1);

export function newGameState(
  puzzle: Pick<Puzzle, 'givens' | 'solution'>,
  meta: { id: string; mode: Mode; difficulty: GameDifficulty; dateKey?: string; archive?: boolean; source?: string; now: number },
): GameState {
  const values = Array.from(puzzle.givens, (c) => c.charCodeAt(0) - 48);
  return {
    id: meta.id,
    mode: meta.mode,
    difficulty: meta.difficulty,
    dateKey: meta.dateKey,
    archive: meta.archive,
    source: meta.source,
    variant: 'classic',
    givens: puzzle.givens,
    solution: puzzle.solution,
    values,
    notes: new Array(81).fill(0),
    history: [],
    future: [],
    selected: null,
    notesMode: false,
    brush: null,
    elapsedMs: 0,
    mistakes: 0,
    hintsUsed: 0,
    limitWaived: false,
    status: 'playing',
    startedAt: meta.now,
    updatedAt: meta.now,
    placements: [],
    checked: [],
  };
}

export const isGiven = (s: GameState, i: number) => s.givens.charCodeAt(i) !== 48;
export const solutionAt = (s: GameState, i: number) => s.solution.charCodeAt(i) - 48;

/** Cells whose digit repeats in one of their units. */
export function conflictCells(values: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (const u of v.units) {
    for (let a = 0; a < 9; a++) {
      const ca = u.cells[a];
      if (!values[ca]) continue;
      for (let b = a + 1; b < 9; b++) {
        const cb = u.cells[b];
        if (values[cb] === values[ca]) {
          out.add(ca);
          out.add(cb);
        }
      }
    }
  }
  return out;
}

/** Player entries that disagree with the solution. */
export function wrongCells(s: GameState): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) if (s.values[i] && !isGiven(s, i) && s.values[i] !== solutionAt(s, i)) out.add(i);
  return out;
}

/** How many more of each digit the board needs (index 1..9). */
export function remainingCounts(s: GameState, mistakeMode: Settings['mistakeMode']): number[] {
  const left = new Array(10).fill(9);
  left[0] = 0;
  for (let i = 0; i < 81; i++) {
    const d = s.values[i];
    if (!d) continue;
    if (mistakeMode === 'immediate' && d !== solutionAt(s, i)) continue;
    left[d]--;
  }
  return left;
}

function unitDone(s: GameState, values: readonly number[], unit: readonly number[], strict: boolean): boolean {
  let mask = 0;
  for (const c of unit) {
    const d = values[c];
    if (!d) return false;
    if (strict && d !== solutionAt(s, c)) return false;
    mask |= bit(d);
  }
  return mask === 0x1ff;
}

function digitDone(s: GameState, values: readonly number[], d: number, strict: boolean): boolean {
  let n = 0;
  for (let i = 0; i < 81; i++) {
    if (values[i] !== d) continue;
    if (strict && d !== solutionAt(s, i)) return false;
    n++;
  }
  if (n !== 9) return false;
  // nine copies and none of them in conflict
  const conflicts = conflictCells(values);
  for (let i = 0; i < 81; i++) if (values[i] === d && conflicts.has(i)) return false;
  return true;
}

function applyChanges(values: number[], notes: number[], changes: CellChange[], side: 0 | 1) {
  for (const ch of changes) {
    values[ch.i] = side ? ch.v1 : ch.v0;
    notes[ch.i] = side ? ch.n1 : ch.n0;
  }
}

function commit(s: GameState, kind: MoveKind, changes: CellChange[], now: number, extra: Partial<Move> = {}): GameState {
  const values = s.values.slice();
  const notes = s.notes.slice();
  applyChanges(values, notes, changes, 1);
  return {
    ...s,
    values,
    notes,
    history: [...s.history, { kind, changes, ...extra }],
    future: [],
    updatedAt: now,
    checked: [],
  };
}

/** Celebrations and end-of-game checks after values changed. */
function afterValueChange(prev: GameState, next: GameState, cell: number, settings: Settings, events: GameEvent[], countMistakes: boolean): GameState {
  const strict = settings.mistakeMode === 'immediate';
  const d = next.values[cell];
  let s = next;
  if (d) {
    const wrong = d !== solutionAt(s, cell);
    if (settings.mistakeMode === 'immediate' && wrong) {
      events.push({ type: 'mistake', cell, digit: d });
      if (countMistakes) s = { ...s, mistakes: s.mistakes + 1 };
    } else if (settings.mistakeMode === 'conflicts') {
      const conf = conflictCells(s.values);
      if (conf.has(cell)) {
        const peers = v.peers[cell].filter((p) => s.values[p] === d);
        events.push({ type: 'conflict', cell, cells: peers });
        if (countMistakes) s = { ...s, mistakes: s.mistakes + 1 };
      }
    }
    const completed: number[] = [];
    for (const u of v.cellUnits[cell]) {
      const cells = v.units[u].cells;
      if (unitDone(s, s.values, cells, strict) && !unitDone(s, prev.values, cells, strict)) completed.push(u);
    }
    const solved = s.values.every((x, i) => x === solutionAt(s, i));
    if (completed.length && !solved) events.push({ type: 'unitComplete', units: completed, cell });
    if (digitDone(s, s.values, d, strict) && !digitDone(s, prev.values, d, strict) && !solved) events.push({ type: 'digitComplete', digit: d });
    if (solved) {
      s = { ...s, status: 'solved', solvedAt: s.updatedAt, selected: null, brush: null, placements: placementOrder(s) };
      events.push({ type: 'solve' });
      return s;
    }
    if (s.values.every((x) => x !== 0)) events.push({ type: 'fullButWrong' });
  }
  if (settings.mistakeLimit && !s.limitWaived && s.mistakes >= 3 && s.status === 'playing') {
    s = { ...s, status: 'failed' };
    events.push({ type: 'failed' });
  }
  return s;
}

/** Order in which the solution cells were (last) filled correctly. */
export function placementOrder(s: GameState): number[] {
  const order: number[] = [];
  const pos = new Map<number, number>();
  for (const m of s.history) {
    for (const ch of m.changes) {
      if (ch.v0 === ch.v1) continue;
      if (ch.v1 && ch.v1 === solutionAt(s, ch.i)) {
        pos.set(ch.i, order.length);
        order.push(ch.i);
      } else if (pos.has(ch.i)) {
        order[pos.get(ch.i)!] = -1;
        pos.delete(ch.i);
      }
    }
  }
  return order.filter((c) => c >= 0);
}

export function placeDigit(s: GameState, cell: number, digit: number, settings: Settings, now: number, kind: MoveKind = 'place'): Result {
  const events: GameEvent[] = [];
  if (s.status !== 'playing') return { state: s, events: [{ type: 'blocked', cell, reason: 'solved' }] };
  if (isGiven(s, cell)) return { state: s, events: [{ type: 'blocked', cell, reason: 'given' }] };
  if (s.values[cell] === digit) return erase(s, cell, now);
  const changes: CellChange[] = [{ i: cell, v0: s.values[cell], v1: digit, n0: s.notes[cell], n1: 0 }];
  const cleared: { cell: number; digit: number }[] = [];
  if (settings.autoRemoveNotes) {
    for (const p of v.peers[cell]) {
      if (s.notes[p] & bit(digit)) {
        changes.push({ i: p, v0: s.values[p], v1: s.values[p], n0: s.notes[p], n1: s.notes[p] & ~bit(digit) });
        cleared.push({ cell: p, digit });
      }
    }
  }
  const next = commit(s, kind, changes, now, { cell, digit });
  events.push({ type: 'placeDigit', cell, digit });
  if (cleared.length) events.push({ type: 'noteCleared', origin: cell, cleared });
  const state = afterValueChange(s, next, cell, settings, events, true);
  return { state, events };
}

export function erase(s: GameState, cell: number, now: number): Result {
  if (s.status !== 'playing') return { state: s, events: [{ type: 'blocked', cell, reason: 'solved' }] };
  if (isGiven(s, cell)) return { state: s, events: [{ type: 'blocked', cell, reason: 'given' }] };
  if (!s.values[cell] && !s.notes[cell]) return { state: s, events: [{ type: 'blocked', cell, reason: 'nothing' }] };
  const changes: CellChange[] = [{ i: cell, v0: s.values[cell], v1: 0, n0: s.notes[cell], n1: 0 }];
  const events: GameEvent[] = [];
  if (s.values[cell]) events.push({ type: 'erase', cell, digit: s.values[cell] });
  else events.push({ type: 'notesBatch', cells: [cell] });
  return { state: commit(s, 'erase', changes, now, { cell }), events };
}

export function toggleNote(s: GameState, cell: number, digit: number, now: number): Result {
  if (s.status !== 'playing') return { state: s, events: [] };
  if (s.values[cell]) return { state: s, events: [{ type: 'blocked', cell, reason: isGiven(s, cell) ? 'given' : 'nothing' }] };
  const on = !(s.notes[cell] & bit(digit));
  const n1 = s.notes[cell] ^ bit(digit);
  const changes: CellChange[] = [{ i: cell, v0: 0, v1: 0, n0: s.notes[cell], n1 }];
  return { state: commit(s, 'note', changes, now, { cell, digit }), events: [{ type: 'noteToggle', cell, digit, on }] };
}

/** One drag stroke of note painting; a single undo step. */
export function paintNotes(s: GameState, cells: number[], digit: number, add: boolean, now: number): Result {
  if (s.status !== 'playing') return { state: s, events: [] };
  const changes: CellChange[] = [];
  for (const c of cells) {
    if (s.values[c]) continue;
    const n1 = add ? s.notes[c] | bit(digit) : s.notes[c] & ~bit(digit);
    if (n1 !== s.notes[c]) changes.push({ i: c, v0: 0, v1: 0, n0: s.notes[c], n1 });
  }
  if (!changes.length) return { state: s, events: [] };
  return {
    state: commit(s, 'notes', changes, now, { digit }),
    events: changes.map((ch) => ({ type: 'noteToggle' as const, cell: ch.i, digit, on: add })),
  };
}

/** Candidates implied by the placed digits. */
export function candidateMask(values: readonly number[], cell: number): number {
  if (values[cell]) return 0;
  let m = 0x1ff;
  for (const p of v.peers[cell]) if (values[p]) m &= ~bit(values[p]);
  return m;
}

export function autoNotes(s: GameState, now: number): Result {
  if (s.status !== 'playing') return { state: s, events: [] };
  const changes: CellChange[] = [];
  for (let i = 0; i < 81; i++) {
    if (s.values[i]) continue;
    const n1 = candidateMask(s.values, i);
    if (n1 !== s.notes[i]) changes.push({ i, v0: 0, v1: 0, n0: s.notes[i], n1 });
  }
  if (!changes.length) return { state: s, events: [] };
  return { state: commit(s, 'autoNotes', changes, now), events: [{ type: 'notesBatch', cells: changes.map((c) => c.i) }] };
}

export function clearNotes(s: GameState, now: number): Result {
  const changes: CellChange[] = [];
  for (let i = 0; i < 81; i++) if (s.notes[i]) changes.push({ i, v0: s.values[i], v1: s.values[i], n0: s.notes[i], n1: 0 });
  if (!changes.length) return { state: s, events: [] };
  return { state: commit(s, 'clearNotes', changes, now), events: [{ type: 'notesBatch', cells: changes.map((c) => c.i) }] };
}

/** Remove specific candidates from the player's notes (hint "apply"). */
export function removeNotes(s: GameState, elims: { cell: number; digit: number }[], now: number): Result {
  const byCell = new Map<number, number>();
  for (const e of elims) if (s.notes[e.cell] & bit(e.digit)) byCell.set(e.cell, (byCell.get(e.cell) ?? 0) | bit(e.digit));
  if (!byCell.size) return { state: s, events: [] };
  const changes: CellChange[] = [...byCell].map(([i, m]) => ({ i, v0: s.values[i], v1: s.values[i], n0: s.notes[i], n1: s.notes[i] & ~m }));
  const cleared = elims.filter((e) => s.notes[e.cell] & bit(e.digit));
  return { state: commit(s, 'applyHintNotes', changes, now), events: [{ type: 'noteCleared', origin: cleared[0].cell, cleared }] };
}

export function undo(s: GameState, now: number): Result {
  if (s.status !== 'playing' || !s.history.length) return { state: s, events: [] };
  const move = s.history[s.history.length - 1];
  const values = s.values.slice();
  const notes = s.notes.slice();
  applyChanges(values, notes, move.changes, 0);
  return {
    state: { ...s, values, notes, history: s.history.slice(0, -1), future: [...s.future, move], updatedAt: now, checked: [] },
    events: [{ type: 'undo', move }],
  };
}

export function redo(s: GameState, settings: Settings, now: number): Result {
  if (s.status !== 'playing' || !s.future.length) return { state: s, events: [] };
  const move = s.future[s.future.length - 1];
  const values = s.values.slice();
  const notes = s.notes.slice();
  applyChanges(values, notes, move.changes, 1);
  const next: GameState = { ...s, values, notes, history: [...s.history, move], future: s.future.slice(0, -1), updatedAt: now, checked: [] };
  const events: GameEvent[] = [{ type: 'redo', move }];
  const main = move.changes[0];
  if (move.cell !== undefined && main && main.v1 && main.v0 !== main.v1) {
    const state = afterValueChange(s, next, move.cell, settings, events, false);
    return { state, events };
  }
  return { state: next, events };
}

/** Restart: back to the givens, keeping time and counters honest. */
export function restart(s: GameState, now: number): GameState {
  return {
    ...s,
    values: Array.from(s.givens, (c) => c.charCodeAt(0) - 48),
    notes: new Array(81).fill(0),
    history: [],
    future: [],
    selected: null,
    brush: null,
    status: 'playing',
    updatedAt: now,
    checked: [],
  };
}
