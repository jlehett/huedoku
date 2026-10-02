/**
 * Constraint modules.
 *
 * A variant is described only by its units: sets of nine cells that must each
 * contain the digits 1-9 exactly once. Both solvers consume the derived tables
 * (cell -> units, cell -> peers, unit intersections) and never look at the
 * variant id, so a Diagonal variant would add two 'diagonal' units and a Jigsaw
 * variant would swap the 'box' units for 'region' units without solver changes.
 */

export type UnitKind = 'row' | 'col' | 'box' | 'region' | 'diagonal';

export interface Unit {
  id: number;
  kind: UnitKind;
  /** Index within its kind (row 0..8, box 0..8, ...). */
  index: number;
  cells: readonly number[];
}

export interface Intersection {
  /** Unit whose candidates are confined to the overlap. */
  a: number;
  /** Unit that receives the eliminations. */
  b: number;
  cells: readonly number[];
}

export interface Variant {
  id: string;
  name: string;
  units: readonly Unit[];
  /** Unit ids each cell belongs to. */
  cellUnits: readonly (readonly number[])[];
  /** Every other cell that shares a unit with the cell. */
  peers: readonly (readonly number[])[];
  /** isPeer[a * 81 + b] === 1 when a and b share a unit. */
  isPeer: Uint8Array;
  /** Ordered pairs of units that overlap in two or more cells. */
  intersections: readonly Intersection[];
  /** Units grouped by kind, for fish patterns (rows vs columns). */
  byKind: Readonly<Partial<Record<UnitKind, readonly Unit[]>>>;
}

export const N = 9;
export const CELLS = 81;

export const rowOf = (i: number) => (i / 9) | 0;
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

export interface UnitSpec {
  kind: UnitKind;
  index: number;
  cells: number[];
}

export function createVariant(id: string, name: string, specs: UnitSpec[]): Variant {
  const units: Unit[] = specs.map((s, id) => ({ id, kind: s.kind, index: s.index, cells: s.cells.slice() }));
  for (const u of units) {
    if (u.cells.length !== 9 || new Set(u.cells).size !== 9) {
      throw new Error(`Unit ${u.kind}${u.index} must have 9 distinct cells`);
    }
  }
  const cellUnits: number[][] = Array.from({ length: CELLS }, () => []);
  for (const u of units) for (const c of u.cells) cellUnits[c].push(u.id);
  const isPeer = new Uint8Array(CELLS * CELLS);
  for (const u of units) {
    for (const a of u.cells) for (const b of u.cells) if (a !== b) isPeer[a * CELLS + b] = 1;
  }
  const peers: number[][] = Array.from({ length: CELLS }, (_, a) => {
    const out: number[] = [];
    for (let b = 0; b < CELLS; b++) if (isPeer[a * CELLS + b]) out.push(b);
    return out;
  });
  const intersections: Intersection[] = [];
  for (const a of units) {
    for (const b of units) {
      if (a.id === b.id) continue;
      const setB = new Set(b.cells);
      const shared = a.cells.filter((c) => setB.has(c));
      if (shared.length >= 2 && shared.length < 9) intersections.push({ a: a.id, b: b.id, cells: shared });
    }
  }
  const byKind: Partial<Record<UnitKind, Unit[]>> = {};
  for (const u of units) (byKind[u.kind] ??= []).push(u);
  return { id, name, units, cellUnits, peers, isPeer, intersections, byKind };
}

export function rowUnits(): UnitSpec[] {
  return Array.from({ length: 9 }, (_, r) => ({ kind: 'row' as const, index: r, cells: Array.from({ length: 9 }, (_, c) => r * 9 + c) }));
}
export function colUnits(): UnitSpec[] {
  return Array.from({ length: 9 }, (_, c) => ({ kind: 'col' as const, index: c, cells: Array.from({ length: 9 }, (_, r) => r * 9 + c) }));
}
export function boxUnits(): UnitSpec[] {
  return Array.from({ length: 9 }, (_, b) => {
    const r0 = ((b / 3) | 0) * 3, c0 = (b % 3) * 3;
    const cells: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((r0 + r) * 9 + c0 + c);
    return { kind: 'box' as const, index: b, cells };
  });
}

/** Classic Sudoku: rows, columns and 3x3 boxes. */
export const classic: Variant = createVariant('classic', 'Classic', [...rowUnits(), ...colUnits(), ...boxUnits()]);

const registry = new Map<string, Variant>([[classic.id, classic]]);
export function getVariant(id: string): Variant {
  const v = registry.get(id);
  if (!v) throw new Error(`Unknown variant ${id}`);
  return v;
}
export function registerVariant(v: Variant) {
  registry.set(v.id, v);
}
