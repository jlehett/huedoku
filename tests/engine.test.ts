import { describe, expect, it } from 'vitest';
import { generate, gridToString, stringToGrid, verifyPuzzle, isRotationallySymmetric, carve } from '../src/engine/generator';
import { createState, applyStep, findStep, grade, isSolved, TECHNIQUES, type TechniqueId } from '../src/engine/logic';
import { rngFrom } from '../src/engine/prng';
import { randomSolution, solve, findConflicts } from '../src/engine/solver';
import { classic } from '../src/engine/variant';
import { nakedSubset, hiddenSubset } from '../src/engine/logic/techniques';
import { applyTransform, symmetricTransform } from '../src/engine/transform';
import { decodeShareCode, encodeShareCode, parseCustomPuzzle } from '../src/engine/codec';

describe('prng', () => {
  it('is deterministic per seed', () => {
    const a = rngFrom('x'), b = rngFrom('x'), c = rngFrom('y');
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(sa).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(sa).not.toEqual(Array.from({ length: 5 }, () => c.next()));
  });
  it('int is in range', () => {
    const r = rngFrom(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});

describe('exact solver', () => {
  it('solves a known puzzle uniquely', () => {
    const p = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
    const r = solve(stringToGrid(p));
    expect(r.count).toBe(1);
    expect(gridToString(r.solution!)).toBe('534678912672195348198342567859761423426853791713924856961537284287419635345286179');
  });
  it('detects multiple solutions and no solution', () => {
    expect(solve(new Uint8Array(81)).count).toBe(2);
    const bad = stringToGrid('550070000600195000098000060800060003400803001700020006060000280000419005000080079');
    expect(solve(bad).invalid).toBe(true);
  });
  it('random solutions are valid', () => {
    const rng = rngFrom('sol');
    for (let i = 0; i < 20; i++) {
      const s = randomSolution(rng);
      expect(findConflicts(s).size).toBe(0);
      expect(s.every((d) => d >= 1 && d <= 9)).toBe(true);
    }
  });
});

describe('logical solver soundness', () => {
  it('every step agrees with the unique solution', () => {
    const rng = rngFrom('sound');
    const used = new Set<TechniqueId>();
    for (let n = 0; n < 250; n++) {
      const sol = randomSolution(rng);
      const grid = carve(sol, { difficulty: 'master', rng, symmetric: true, variant: classic });
      const s = createState(grid, classic)!;
      for (let guard = 0; guard < 500 && !isSolved(s); guard++) {
        const step = findStep(s, classic, 5);
        if (!step) break;
        used.add(step.technique);
        if (step.placement) expect(sol[step.placement.cell]).toBe(step.placement.digit);
        for (const e of step.eliminations) expect(sol[e.cell]).not.toBe(e.digit);
        expect(step.placement || step.eliminations.length).toBeTruthy();
        applyStep(s, classic, step);
      }
    }
    // Every technique except the (rare) triples shows up across these puzzles; triples are tested directly below.
    const expected = TECHNIQUES.map((t) => t.id).filter((id) => id !== 'nakedTriple' && id !== 'hiddenTriple');
    for (const id of expected) expect(used.has(id), id).toBe(true);
  });
  it('finds naked and hidden triples', () => {
    const s = createState(new Uint8Array(81), classic)!;
    s.cand[0] = 0b011; s.cand[1] = 0b110; s.cand[2] = 0b101;
    const naked = nakedSubset(s, classic, 3)!;
    expect(naked.technique).toBe('nakedTriple');
    expect(naked.cells).toEqual([0, 1, 2]);
    expect(naked.eliminations.every((e) => e.digit <= 3 && ![0, 1, 2].includes(e.cell))).toBe(true);
    const s2 = createState(new Uint8Array(81), classic)!;
    for (const c of [3, 4, 5, 6, 7, 8]) s2.cand[c] &= ~0b111;
    const hidden = hiddenSubset(s2, classic, 3)!;
    expect(hidden.technique).toBe('hiddenTriple');
    expect(hidden.cells).toEqual([0, 1, 2]);
  });
});

describe('generator', () => {
  for (const d of ['easy', 'medium', 'hard', 'expert', 'master'] as const) {
    it(`makes unique, correctly graded ${d} puzzles`, () => {
      const rng = rngFrom('gen-' + d);
      for (let i = 0; i < 8; i++) {
        const p = generate({ difficulty: d, rng })!;
        const v = verifyPuzzle(p);
        expect(v.unique).toBe(true);
        expect(v.solutionMatches).toBe(true);
        expect(v.gradeMatches).toBe(true);
        expect(isRotationallySymmetric(p.givens)).toBe(true);
      }
    });
  }
  it('is deterministic for a seed', () => {
    const a = generate({ difficulty: 'hard', rng: rngFrom('same') })!;
    const b = generate({ difficulty: 'hard', rng: rngFrom('same') })!;
    expect(a.givens).toBe(b.givens);
  });
});

describe('transforms', () => {
  it('keep uniqueness, grade and symmetry', () => {
    const rng = rngFrom('tf');
    const p = generate({ difficulty: 'expert', rng })!;
    for (let i = 0; i < 10; i++) {
      const t = symmetricTransform(rng);
      const g = applyTransform(p.givens, t);
      const s = applyTransform(p.solution, t);
      expect(isRotationallySymmetric(g)).toBe(true);
      const v = verifyPuzzle({ givens: g, solution: s, difficulty: 'expert' });
      expect(v.unique && v.solutionMatches && v.gradeMatches).toBe(true);
    }
  });
});

describe('codec', () => {
  it('round-trips share codes', () => {
    const p = generate({ difficulty: 'medium', rng: rngFrom('code') })!;
    const code = encodeShareCode(p.givens);
    expect(code.length).toBeLessThan(45);
    expect(decodeShareCode(code)).toBe(p.givens);
  });
  it('rejects invalid custom puzzles', () => {
    expect(parseCustomPuzzle('123').ok).toBe(false);
    const multi = parseCustomPuzzle('0'.repeat(81));
    expect(multi.ok === false && multi.reason).toBe('multipleSolutions');
    const conflict = parseCustomPuzzle('55' + '0'.repeat(79));
    expect(conflict.ok === false && conflict.reason).toBe('conflict');
    const none = parseCustomPuzzle('123456780' + '000000009' + '0'.repeat(63));
    expect(none.ok === false && none.reason).toBe('noSolution');
    const good = parseCustomPuzzle('53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79');
    expect(good.ok).toBe(true);
  });
  it('grades a classic puzzle', () => {
    const g = grade(stringToGrid('530070000600195000098000060800060003400803001700020006060000280000419005000080079'));
    expect(g.solved).toBe(true);
    expect(g.tier).toBe(1);
  });
});
