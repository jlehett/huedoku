/**
 * The 9x9 board as plain DOM. Cells are created once; `update()` diffs each
 * cell's visual signature and only touches cells that changed, so a placement
 * costs a handful of class and text changes. Animations live in motion/effects.
 *
 * Cell layers (all absolutely positioned):
 *   .slot      empty-cell well; highlight tints
 *   .clip      circle used for the paint reveal (scaled from the tap point)
 *     .paint   the paint tile, counter-scaled so the texture stays put
 *   .num       numeral
 *   .notes     3x3 pencil marks
 *   .ghost     clip circle holding a copy of the old paint (exit animations)
 *   .gnum      copy of the old numeral (exit animations)
 *   .glow      light used by waves and pulses
 *   .ring      selection / hint / conflict outline
 */

export interface BoardModel {
  values: readonly number[];
  givens: string;
  notes: readonly number[];
  selected: number | null;
  focusDigit: number | null;
  conflicts: ReadonlySet<number>;
  wrong: ReadonlySet<number>;
  hintCells: ReadonlySet<number>;
  hintTarget: number | null;
  hintElims: ReadonlyMap<number, number>;
  highlightUnits: boolean;
  highlightSame: boolean;
  dots: boolean;
}

export interface CellEls {
  root: HTMLDivElement;
  slot: HTMLDivElement;
  clip: HTMLDivElement;
  paint: HTMLDivElement;
  num: HTMLDivElement;
  notes: HTMLDivElement;
  noteEls: HTMLElement[];
  ghost: HTMLDivElement;
  ghostPaint: HTMLDivElement;
  ghostNum: HTMLDivElement;
  glow: HTMLDivElement;
  ring: HTMLDivElement;
}

const rowOf = (i: number) => (i / 9) | 0;
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

function div(cls: string, parent?: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent?.appendChild(d);
  return d;
}

export class BoardView {
  readonly el: HTMLDivElement;
  readonly cells: CellEls[] = [];
  private sig: string[] = new Array(81).fill('');
  private noteSig: number[] = new Array(81).fill(-1);
  /** Last tap point per cell, in cell-relative px from the center. */
  readonly origins = new Map<number, { x: number; y: number }>();
  model: BoardModel | null = null;

  constructor(container: HTMLElement) {
    this.el = div('board');
    this.el.setAttribute('role', 'grid');
    this.el.setAttribute('aria-label', 'Sudoku board');
    for (let i = 0; i < 81; i++) {
      const r = rowOf(i), c = colOf(i);
      const root = div('cell');
      root.dataset.i = String(i);
      root.style.gridRow = String(r + 1 + Math.floor(r / 3));
      root.style.gridColumn = String(c + 1 + Math.floor(c / 3));
      root.setAttribute('role', 'gridcell');
      const slot = div('slot', root);
      const clip = div('clip', root);
      const paint = div('paint', clip);
      const num = div('num', root);
      const notes = div('notes', root);
      const noteEls: HTMLElement[] = [];
      for (let d = 1; d <= 9; d++) {
        const n = document.createElement('i');
        n.textContent = String(d);
        n.dataset.d = String(d);
        notes.appendChild(n);
        noteEls.push(n);
      }
      const ghost = div('ghost', root);
      const ghostPaint = div('gpaint', ghost);
      const ghostNum = div('gnum', root);
      const glow = div('glow', root);
      const ring = div('ring', root);
      this.el.appendChild(root);
      this.cells.push({ root, slot, clip, paint, num, notes, noteEls, ghost, ghostPaint, ghostNum, glow, ring });
    }
    container.appendChild(this.el);
  }

  private centers: { rows: number[]; cols: number[]; w: number; h: number } | null = null;

  /** Row/column centers relative to the board, re-measured when the board size changes. */
  private measure() {
    const rect = this.el.getBoundingClientRect();
    if (this.centers && this.centers.w === rect.width && this.centers.h === rect.height) return rect;
    const rows: number[] = [], cols: number[] = [];
    for (let k = 0; k < 9; k++) {
      const rr = this.cells[k * 9].root.getBoundingClientRect();
      const rc = this.cells[k].root.getBoundingClientRect();
      rows.push(rr.top + rr.height / 2 - rect.top);
      cols.push(rc.left + rc.width / 2 - rect.left);
    }
    this.centers = { rows, cols, w: rect.width, h: rect.height };
    return rect;
  }

  /** Cell index under a viewport point (nearest row and column center). */
  cellAt(x: number, y: number): number | null {
    const rect = this.measure();
    if (x < rect.left - 4 || y < rect.top - 4 || x > rect.right + 4 || y > rect.bottom + 4) return null;
    const nearest = (arr: number[], v: number) => {
      let best = 0;
      for (let k = 1; k < 9; k++) if (Math.abs(arr[k] - v) < Math.abs(arr[best] - v)) best = k;
      return best;
    };
    const { rows, cols } = this.centers!;
    return nearest(rows, y - rect.top) * 9 + nearest(cols, x - rect.left);
  }

  cellRect(i: number): DOMRect {
    return this.cells[i].root.getBoundingClientRect();
  }

  setOrigin(i: number, clientX: number, clientY: number) {
    const r = this.cellRect(i);
    this.origins.set(i, { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) });
  }

  update(m: BoardModel) {
    this.model = m;
    const sel = m.selected;
    const sr = sel !== null ? rowOf(sel) : -1, sc = sel !== null ? colOf(sel) : -1, sb = sel !== null ? boxOf(sel) : -1;
    for (let i = 0; i < 81; i++) {
      const v = m.values[i];
      const given = m.givens.charCodeAt(i) !== 48;
      const peer = m.highlightUnits && sel !== null && i !== sel && (rowOf(i) === sr || colOf(i) === sc || boxOf(i) === sb);
      const focus = m.focusDigit;
      const same = m.highlightSame && focus !== null && v === focus;
      const dim = m.highlightSame && focus !== null && v !== 0 && v !== focus;
      const cls =
        'cell' +
        (v ? (given ? ' given' : ' filled') : ' empty') +
        (i === sel ? ' sel' : '') +
        (peer ? ' peer' : '') +
        (same ? ' same' : '') +
        (dim ? ' dim' : '') +
        (m.conflicts.has(i) ? ' conf' : '') +
        (m.wrong.has(i) ? ' wrong' : '') +
        (m.hintCells.has(i) ? ' hint' : '') +
        (m.hintTarget === i ? ' hint-target' : '');
      const s = `${cls}|${v}`;
      const c = this.cells[i];
      if (s !== this.sig[i]) {
        this.sig[i] = s;
        c.root.className = cls;
        if (v) {
          c.root.style.setProperty('--d', String(v));
          c.paint.style.backgroundImage = `var(--tile-${given ? 'g' : 'p'}${v})`;
          c.num.textContent = String(v);
          c.root.dataset.v = String(v);
          c.root.setAttribute('aria-label', `${given ? 'Given' : 'Entered'} ${v}, row ${rowOf(i) + 1}, column ${colOf(i) + 1}`);
        } else {
          c.num.textContent = '';
          delete c.root.dataset.v;
          c.root.setAttribute('aria-label', `Empty, row ${rowOf(i) + 1}, column ${colOf(i) + 1}`);
        }
      }
      // Notes: one bitmask plus focus/elimination state.
      const notes = v ? 0 : m.notes[i];
      const focusBit = m.highlightSame && focus !== null && !v ? 1 << (focus - 1) : 0;
      const elim = m.hintElims.get(i) ?? 0;
      const nsig = notes | (focusBit << 9) | (elim << 18) | (m.dots ? 1 << 28 : 0);
      if (nsig !== this.noteSig[i]) {
        this.noteSig[i] = nsig;
        c.notes.classList.toggle('dots', m.dots);
        for (let d = 1; d <= 9; d++) {
          const b = 1 << (d - 1);
          const el = c.noteEls[d - 1];
          const on = (notes & b) !== 0;
          el.className = (on ? 'on' : '') + (on && focusBit & b ? ' focus' : '') + (on && elim & b ? ' elim' : '');
        }
      }
    }
  }

  /** Fill the ghost layer with a digit's look, for exit animations. */
  prepareGhost(i: number, digit: number, given: boolean) {
    const c = this.cells[i];
    c.ghostNum.dataset.v = String(digit);
    c.ghostNum.classList.toggle('given', given);
    c.ghostPaint.style.backgroundImage = `var(--tile-${given ? 'g' : 'p'}${digit})`;
    c.ghostNum.textContent = String(digit);
  }

  destroy() {
    this.el.remove();
  }
}
