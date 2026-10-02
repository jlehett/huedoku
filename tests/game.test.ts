import { describe, expect, it } from 'vitest';
import { autoNotes, erase, newGameState, paintNotes, placeDigit, redo, toggleNote, undo, remainingCounts } from '../src/state/game';
import { DEFAULT_SETTINGS, type GameState } from '../src/state/types';

const P = {
  givens: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
  solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
};
const S = DEFAULT_SETTINGS;
const fresh = () => newGameState(P, { id: 'x', mode: 'classic', difficulty: 'easy', now: 0 });
const sol = (i: number) => P.solution.charCodeAt(i) - 48;

function solveAllBut(g: GameState, keep: number[]): GameState {
  for (let i = 0; i < 81; i++) {
    if (keep.includes(i) || g.values[i]) continue;
    g = placeDigit(g, i, sol(i), S, 1).state;
  }
  return g;
}

describe('game rules', () => {
  it('places, undoes and redoes with notes restored', () => {
    let g = fresh();
    g = toggleNote(g, 2, 4, 1).state;
    const r = placeDigit(g, 2, 4, S, 2);
    expect(r.events.map((e) => e.type)).toContain('placeDigit');
    g = r.state;
    expect(g.values[2]).toBe(4);
    expect(g.notes[2]).toBe(0);
    g = undo(g, 3).state;
    expect(g.values[2]).toBe(0);
    expect(g.notes[2]).toBe(1 << 3);
    g = redo(g, S, 4).state;
    expect(g.values[2]).toBe(4);
  });

  it('removes peer notes on placement and reports them', () => {
    let g = fresh();
    g = toggleNote(g, 3, 4, 1).state;
    const r = placeDigit(g, 2, 4, S, 2);
    expect(r.state.notes[3]).toBe(0);
    const ev = r.events.find((e) => e.type === 'noteCleared');
    expect(ev && ev.type === 'noteCleared' && ev.cleared).toEqual([{ cell: 3, digit: 4 }]);
  });

  it('counts mistakes and enforces the optional limit', () => {
    let g = fresh();
    const lim = { ...S, mistakeLimit: true };
    for (let k = 0; k < 3; k++) g = placeDigit(g, 2, k === 1 ? 2 : 1, lim, 1).state;
    expect(g.mistakes).toBe(3);
    expect(g.status).toBe('failed');
  });

  it('emits the solve event on the last cell', () => {
    let g = fresh();
    g = solveAllBut(g, [2]);
    const r = placeDigit(g, 2, 4, S, 9);
    expect(r.state.status).toBe('solved');
    expect(r.events.map((e) => e.type)).toEqual(['placeDigit', 'solve']);
    expect(r.state.placements.length).toBe(81 - P.givens.replace(/0/g, '').length);
  });

  it('detects a completed row without finishing the puzzle', () => {
    let g = fresh();
    for (const i of [3, 5, 6, 7, 8]) g = placeDigit(g, i, sol(i), S, 1).state;
    const r = placeDigit(g, 2, 4, S, 2);
    const u = r.events.find((e) => e.type === 'unitComplete');
    expect(u && u.type === 'unitComplete' && u.units).toContain(0);
  });

  it('paints notes as one undo step and auto-fills candidates', () => {
    let g = fresh();
    g = paintNotes(g, [2, 3, 5], 2, true, 1).state;
    expect(g.history.length).toBe(1);
    g = undo(g, 2).state;
    expect(g.notes[2] | g.notes[3]).toBe(0);
    g = autoNotes(g, 3).state;
    expect(g.notes[2]).toBe((1 << 0) | (1 << 1) | (1 << 3));
  });

  it('refuses to edit givens and counts remaining digits', () => {
    const g = fresh();
    expect(placeDigit(g, 0, 1, S, 1).events[0]).toMatchObject({ type: 'blocked', reason: 'given' });
    expect(erase(g, 0, 1).events[0]).toMatchObject({ type: 'blocked' });
    expect(remainingCounts(g, 'immediate')[5]).toBe(9 - [...P.givens].filter((c) => c === '5').length);
  });
});
