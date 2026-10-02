/**
 * Human-style solving techniques. Each finder looks at a LogicState and returns
 * the first instance of its pattern that makes progress, or null. Finders only
 * use the variant's unit tables, so they work for any constraint module.
 */
import { DIGITS, LOW, POP } from '../bits';
import type { Unit, UnitKind, Variant } from '../variant';
import { placedMask, positions, type LogicState } from './state';
import type { Elimination, Step, TechniqueId } from './types';

const KIND_ORDER: Record<UnitKind, number> = { box: 0, region: 0, row: 1, col: 2, diagonal: 3 };

const orderedCache = new WeakMap<Variant, Unit[]>();
function orderedUnits(v: Variant): Unit[] {
  let u = orderedCache.get(v);
  if (!u) {
    u = [...v.units].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.index - b.index);
    orderedCache.set(v, u);
  }
  return u;
}

function combinations<T>(arr: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const cur: T[] = [];
  const rec = (start: number) => {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - cur.length); i++) {
      cur.push(arr[i]);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

function sees(v: Variant, a: number, b: number): boolean {
  return v.isPeer[a * 81 + b] === 1;
}

function sharedUnits(v: Variant, cells: readonly number[]): number[] {
  if (!cells.length) return [];
  return v.cellUnits[cells[0]].filter((u) => cells.every((c) => v.cellUnits[c].includes(u)));
}

// ---------------------------------------------------------------- singles

export function hiddenSingle(s: LogicState, v: Variant): Step | null {
  for (const u of orderedUnits(v)) {
    const placed = placedMask(s, u.cells);
    for (let d = 1; d <= 9; d++) {
      if (placed & (1 << (d - 1))) continue;
      const pos = positions(s, u.cells, d);
      if (pos.length === 1) {
        return {
          technique: 'hiddenSingle',
          placement: { cell: pos[0], digit: d },
          eliminations: [],
          cells: [pos[0]],
          units: [u.id],
          digits: [d],
        };
      }
    }
  }
  return null;
}

export function nakedSingle(s: LogicState, v: Variant): Step | null {
  for (let i = 0; i < 81; i++) {
    if (!s.vals[i] && POP[s.cand[i]] === 1) {
      return {
        technique: 'nakedSingle',
        placement: { cell: i, digit: LOW[s.cand[i]] },
        eliminations: [],
        cells: [i],
        units: [...v.cellUnits[i]],
        digits: [LOW[s.cand[i]]],
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------- intersections

export function intersections(s: LogicState, v: Variant, which: 'pointing' | 'boxLine'): Step | null {
  for (const x of v.intersections) {
    const a = v.units[x.a];
    const b = v.units[x.b];
    const aIsBox = a.kind === 'box' || a.kind === 'region';
    const bIsBox = b.kind === 'box' || b.kind === 'region';
    if (which === 'pointing' && !(aIsBox && !bIsBox)) continue;
    if (which === 'boxLine' && !(!aIsBox && bIsBox)) continue;
    const placed = placedMask(s, a.cells);
    const inter = new Set(x.cells);
    for (let d = 1; d <= 9; d++) {
      if (placed & (1 << (d - 1))) continue;
      const pos = positions(s, a.cells, d);
      if (pos.length < 2 || !pos.every((c) => inter.has(c))) continue;
      const elims: Elimination[] = [];
      for (const c of b.cells) {
        if (inter.has(c)) continue;
        if (!s.vals[c] && s.cand[c] & (1 << (d - 1))) elims.push({ cell: c, digit: d });
      }
      if (elims.length) {
        return { technique: which, eliminations: elims, cells: pos, units: [a.id, b.id], digits: [d] };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- subsets

export function nakedSubset(s: LogicState, v: Variant, k: number): Step | null {
  const technique: TechniqueId = k === 2 ? 'nakedPair' : 'nakedTriple';
  for (const u of orderedUnits(v)) {
    const empties = u.cells.filter((c) => !s.vals[c]);
    const pool = empties.filter((c) => POP[s.cand[c]] >= 2 && POP[s.cand[c]] <= k);
    if (pool.length < k || empties.length <= k) continue;
    for (const combo of combinations(pool, k)) {
      let union = 0;
      for (const c of combo) union |= s.cand[c];
      if (POP[union] !== k) continue;
      const elims: Elimination[] = [];
      for (const c of empties) {
        if (combo.includes(c)) continue;
        const hit = s.cand[c] & union;
        for (const d of DIGITS[hit]) elims.push({ cell: c, digit: d });
      }
      if (elims.length) {
        return { technique, eliminations: elims, cells: combo, units: [u.id], digits: DIGITS[union].slice() };
      }
    }
  }
  return null;
}

export function hiddenSubset(s: LogicState, v: Variant, k: number): Step | null {
  const technique: TechniqueId = k === 2 ? 'hiddenPair' : 'hiddenTriple';
  for (const u of orderedUnits(v)) {
    const placed = placedMask(s, u.cells);
    const empties = u.cells.filter((c) => !s.vals[c]);
    if (empties.length <= k) continue;
    const digitPos = new Map<number, number[]>();
    for (let d = 1; d <= 9; d++) {
      if (placed & (1 << (d - 1))) continue;
      const pos = positions(s, u.cells, d);
      if (pos.length >= 2 && pos.length <= k) digitPos.set(d, pos);
    }
    if (digitPos.size < k) continue;
    for (const ds of combinations([...digitPos.keys()], k)) {
      const cells = new Set<number>();
      for (const d of ds) for (const c of digitPos.get(d)!) cells.add(c);
      if (cells.size !== k) continue;
      let keep = 0;
      for (const d of ds) keep |= 1 << (d - 1);
      const elims: Elimination[] = [];
      for (const c of cells) for (const d of DIGITS[s.cand[c] & ~keep]) elims.push({ cell: c, digit: d });
      if (elims.length) {
        return { technique, eliminations: elims, cells: [...cells].sort((a, b) => a - b), units: [u.id], digits: ds };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- fish

const coverCache = new WeakMap<Variant, Map<UnitKind, Int16Array>>();
/** For each cell, the id of the unit of `kind` containing it (-1 if none). */
function unitOfKind(v: Variant, kind: UnitKind): Int16Array {
  let m = coverCache.get(v);
  if (!m) {
    m = new Map();
    coverCache.set(v, m);
  }
  let arr = m.get(kind);
  if (!arr) {
    arr = new Int16Array(81).fill(-1);
    for (const u of v.byKind[kind] ?? []) for (const c of u.cells) arr[c] = u.id;
    m.set(kind, arr);
  }
  return arr;
}

export function fish(s: LogicState, v: Variant, k: number): Step | null {
  const technique: TechniqueId = k === 2 ? 'xWing' : 'swordfish';
  const pairs: [UnitKind, UnitKind][] = [['row', 'col'], ['col', 'row']];
  for (let d = 1; d <= 9; d++) {
    const b = 1 << (d - 1);
    for (const [baseKind, coverKind] of pairs) {
      const bases = v.byKind[baseKind];
      if (!bases || !v.byKind[coverKind]) continue;
      const coverOf = unitOfKind(v, coverKind);
      const lines: { unit: Unit; pos: number[]; covers: number[] }[] = [];
      for (const u of bases) {
        if (placedMask(s, u.cells) & b) continue;
        const pos = positions(s, u.cells, d);
        if (pos.length < 2 || pos.length > k) continue;
        const covers = [...new Set(pos.map((c) => coverOf[c]))];
        if (covers.some((c) => c < 0)) continue;
        lines.push({ unit: u, pos, covers });
      }
      if (lines.length < k) continue;
      for (const combo of combinations(lines, k)) {
        const coverSet = new Set<number>();
        for (const l of combo) for (const c of l.covers) coverSet.add(c);
        if (coverSet.size !== k) continue;
        const baseCells = new Set<number>();
        for (const l of combo) for (const c of l.unit.cells) baseCells.add(c);
        const elims: Elimination[] = [];
        for (const cu of coverSet) {
          for (const c of v.units[cu].cells) {
            if (baseCells.has(c)) continue;
            if (!s.vals[c] && s.cand[c] & b) elims.push({ cell: c, digit: d });
          }
        }
        if (elims.length) {
          const cells = combo.flatMap((l) => l.pos).sort((a, b2) => a - b2);
          return {
            technique,
            eliminations: elims,
            cells,
            units: [...combo.map((l) => l.unit.id), ...coverSet],
            digits: [d],
            roles: { base: combo.map((l) => l.unit.id), cover: [...coverSet] },
          };
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- wings

export function xyWing(s: LogicState, v: Variant): Step | null {
  for (let p = 0; p < 81; p++) {
    if (s.vals[p] || POP[s.cand[p]] !== 2) continue;
    const pm = s.cand[p];
    const wings = v.peers[p].filter((c) => !s.vals[c] && POP[s.cand[c]] === 2 && POP[s.cand[c] & pm] === 1);
    for (const w1 of wings) {
      const shared1 = s.cand[w1] & pm; // a
      const z = s.cand[w1] & ~pm; // c
      const want = (pm & ~shared1) | z; // {b, c}
      for (const w2 of wings) {
        if (w2 <= w1 || s.cand[w2] !== want) continue;
        const elims: Elimination[] = [];
        const zd = LOW[z];
        for (const c of v.peers[w1]) {
          if (c === p || c === w2 || s.vals[c] || !(s.cand[c] & z)) continue;
          if (sees(v, c, w2)) elims.push({ cell: c, digit: zd });
        }
        if (elims.length) {
          return {
            technique: 'xyWing',
            eliminations: elims,
            cells: [p, w1, w2],
            units: [],
            digits: [zd],
            roles: { pivot: [p], wings: [w1, w2] },
          };
        }
      }
    }
  }
  return null;
}

export function xyzWing(s: LogicState, v: Variant): Step | null {
  for (let p = 0; p < 81; p++) {
    if (s.vals[p] || POP[s.cand[p]] !== 3) continue;
    const pm = s.cand[p];
    const wings = v.peers[p].filter((c) => !s.vals[c] && POP[s.cand[c]] === 2 && (s.cand[c] & ~pm) === 0);
    for (let i = 0; i < wings.length; i++) {
      for (let j = i + 1; j < wings.length; j++) {
        const w1 = wings[i], w2 = wings[j];
        if ((s.cand[w1] | s.cand[w2]) !== pm) continue;
        const z = s.cand[w1] & s.cand[w2];
        if (POP[z] !== 1) continue;
        const zd = LOW[z];
        const elims: Elimination[] = [];
        for (const c of v.peers[p]) {
          if (c === w1 || c === w2 || s.vals[c] || !(s.cand[c] & z)) continue;
          if (sees(v, c, w1) && sees(v, c, w2)) elims.push({ cell: c, digit: zd });
        }
        if (elims.length) {
          return {
            technique: 'xyzWing',
            eliminations: elims,
            cells: [p, w1, w2],
            units: [],
            digits: [zd],
            roles: { pivot: [p], wings: [w1, w2] },
          };
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- coloring

export function simpleColoring(s: LogicState, v: Variant): Step | null {
  for (let d = 1; d <= 9; d++) {
    const b = 1 << (d - 1);
    const adj = new Map<number, Set<number>>();
    const linkUnits = new Map<string, number>();
    for (const u of v.units) {
      if (placedMask(s, u.cells) & b) continue;
      const pos = positions(s, u.cells, d);
      if (pos.length !== 2) continue;
      const [x, y] = pos;
      if (!adj.has(x)) adj.set(x, new Set());
      if (!adj.has(y)) adj.set(y, new Set());
      adj.get(x)!.add(y);
      adj.get(y)!.add(x);
      linkUnits.set(x < y ? `${x}-${y}` : `${y}-${x}`, u.id);
    }
    const color = new Map<number, number>();
    const starts = [...adj.keys()].sort((a, b2) => a - b2);
    for (const start of starts) {
      if (color.has(start)) continue;
      const comp: number[] = [];
      color.set(start, 0);
      const queue = [start];
      while (queue.length) {
        const c = queue.shift()!;
        comp.push(c);
        for (const n of adj.get(c)!) {
          if (!color.has(n)) {
            color.set(n, 1 - color.get(c)!);
            queue.push(n);
          }
        }
      }
      if (comp.length < 3) continue; // a lone conjugate pair is covered by simpler techniques
      const groups = [comp.filter((c) => color.get(c) === 0), comp.filter((c) => color.get(c) === 1)];
      const units = [...new Set(comp.flatMap((c) => [...adj.get(c)!].map((n) => linkUnits.get(c < n ? `${c}-${n}` : `${n}-${c}`)!)))];
      // Color wrap: two cells of one color see each other, so that color is false.
      for (let g = 0; g < 2; g++) {
        const grp = groups[g];
        let clash = false;
        for (let i = 0; i < grp.length && !clash; i++) {
          for (let j = i + 1; j < grp.length; j++) if (sees(v, grp[i], grp[j])) { clash = true; break; }
        }
        if (clash) {
          return {
            technique: 'simpleColoring',
            eliminations: grp.map((c) => ({ cell: c, digit: d })),
            cells: comp,
            units,
            digits: [d],
            roles: { colorA: groups[1 - g], colorB: grp, rule: [1] },
          };
        }
      }
      // Color trap: a cell outside the cluster that sees both colors cannot be d.
      const compSet = new Set(comp);
      const elims: Elimination[] = [];
      for (let c = 0; c < 81; c++) {
        if (s.vals[c] || compSet.has(c) || !(s.cand[c] & b)) continue;
        const seesA = groups[0].some((x) => sees(v, c, x));
        const seesB = groups[1].some((x) => sees(v, c, x));
        if (seesA && seesB) elims.push({ cell: c, digit: d });
      }
      if (elims.length) {
        return {
          technique: 'simpleColoring',
          eliminations: elims,
          cells: comp,
          units,
          digits: [d],
          roles: { colorA: groups[0], colorB: groups[1], rule: [2] },
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- chains

/**
 * XY-Chain: a path of two-candidate cells, each seeing the next, where the
 * shared digit alternates. If the first cell is not x, the last cell is x, so a
 * cell that sees both ends cannot be x. Returns the shortest chain found.
 */
export function xyChain(s: LogicState, v: Variant, maxLen = 14): Step | null {
  const bivalue: number[] = [];
  for (let i = 0; i < 81; i++) if (!s.vals[i] && POP[s.cand[i]] === 2) bivalue.push(i);
  if (bivalue.length < 3) return null;
  const neighbors = new Map<number, number[]>();
  for (const c of bivalue) neighbors.set(c, bivalue.filter((o) => o !== c && sees(v, c, o)));
  let best: Step | null = null;
  let bestLen = Infinity;
  for (const start of bivalue) {
    for (const x of DIGITS[s.cand[start]]) {
      // State: (cell, forced value). Start: start is not x, so it is y.
      const y = LOW[s.cand[start] & ~(1 << (x - 1))];
      const key = (c: number, val: number) => c * 10 + val;
      const parent = new Map<number, number>();
      const queue: { c: number; val: number; len: number }[] = [{ c: start, val: y, len: 1 }];
      parent.set(key(start, y), -1);
      while (queue.length) {
        const cur = queue.shift()!;
        if (cur.len >= maxLen || cur.len >= bestLen) break;
        for (const n of neighbors.get(cur.c)!) {
          if (!(s.cand[n] & (1 << (cur.val - 1)))) continue;
          const nv = LOW[s.cand[n] & ~(1 << (cur.val - 1))];
          const k = key(n, nv);
          if (parent.has(k)) continue;
          parent.set(k, key(cur.c, cur.val));
          if (nv === x && n !== start && cur.len + 1 >= 3) {
            const elims: Elimination[] = [];
            const bx = 1 << (x - 1);
            for (const c of v.peers[start]) {
              if (c === n || s.vals[c] || !(s.cand[c] & bx)) continue;
              if (sees(v, c, n)) elims.push({ cell: c, digit: x });
            }
            if (elims.length && cur.len + 1 < bestLen) {
              const chain: number[] = [];
              let kk = k;
              while (kk !== -1) {
                chain.push((kk / 10) | 0);
                kk = parent.get(kk)!;
              }
              chain.reverse();
              bestLen = chain.length;
              best = {
                technique: 'xyChain',
                eliminations: elims,
                cells: chain,
                units: [],
                digits: [x],
                roles: { chain, ends: [start, n] },
              };
            }
          }
          queue.push({ c: n, val: nv, len: cur.len + 1 });
        }
      }
    }
  }
  return best;
}

export { sharedUnits };
