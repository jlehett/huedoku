import { ALL } from '../bits';
import type { Variant } from '../variant';
import type { Step } from './types';

/** Working grid for the logical solver: placed values plus candidate masks. */
export interface LogicState {
  vals: Uint8Array;
  cand: Uint16Array;
}

/** Build a state with candidates derived from the placed digits. Returns null on a conflict. */
export function createState(grid: ArrayLike<number>, v: Variant): LogicState | null {
  const vals = new Uint8Array(81);
  const cand = new Uint16Array(81).fill(ALL);
  for (let i = 0; i < 81; i++) {
    const d = grid[i];
    if (!d) continue;
    if (!(cand[i] & (1 << (d - 1)))) return null;
    vals[i] = d;
    cand[i] = 0;
    const b = ~(1 << (d - 1));
    for (const p of v.peers[i]) {
      if (vals[p] === d) return null;
      cand[p] &= b;
    }
  }
  return { vals, cand };
}

export function cloneState(s: LogicState): LogicState {
  return { vals: s.vals.slice(), cand: s.cand.slice() };
}

export function place(s: LogicState, v: Variant, i: number, d: number): void {
  s.vals[i] = d;
  s.cand[i] = 0;
  const b = ~(1 << (d - 1));
  for (const p of v.peers[i]) s.cand[p] &= b;
}

export function applyStep(s: LogicState, v: Variant, step: Step): void {
  if (step.placement) place(s, v, step.placement.cell, step.placement.digit);
  for (const e of step.eliminations) s.cand[e.cell] &= ~(1 << (e.digit - 1));
}

export function isSolved(s: LogicState): boolean {
  for (let i = 0; i < 81; i++) if (!s.vals[i]) return false;
  return true;
}

/** Positions of digit d (as candidate) within a list of cells. */
export function positions(s: LogicState, cells: readonly number[], d: number): number[] {
  const b = 1 << (d - 1);
  const out: number[] = [];
  for (const c of cells) if (!s.vals[c] && s.cand[c] & b) out.push(c);
  return out;
}

export function placedMask(s: LogicState, cells: readonly number[]): number {
  let m = 0;
  for (const c of cells) if (s.vals[c]) m |= 1 << (s.vals[c] - 1);
  return m;
}
