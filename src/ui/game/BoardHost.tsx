/**
 * Mounts the imperative BoardView, sizes it to the space available, turns
 * pointer input into game actions, and runs effects for game events on the
 * same frame the board updates.
 */
import { useEffect, useRef } from 'preact/hooks';
import { audio } from '../../audio/audio';
import { Effects } from '../../motion/effects';
import { motion } from '../../motion/scheduler';
import * as G from '../../state/game';
import { store, type AppState } from '../app/store';
import { BoardView, type BoardModel } from '../board/BoardView';
import { currentTheme } from '../theme';

export interface BoardApi {
  view: BoardView;
  effects: Effects;
}

const EMPTY = new Set<number>();
const EMPTY_MAP = new Map<number, number>();

export function buildModel(s: AppState): BoardModel | null {
  const g = s.game;
  if (!g) return null;
  const settings = s.meta.settings;
  const conflicts = settings.mistakeMode === 'conflicts' ? G.conflictCells(g.values) : EMPTY;
  const wrong = settings.mistakeMode === 'immediate' ? G.wrongCells(g) : g.checked.length ? new Set(g.checked) : EMPTY;
  const focusDigit =
    g.status !== 'playing'
      ? null
      : settings.inputMode === 'paint' && g.brush
        ? g.brush
        : g.selected !== null && g.values[g.selected]
          ? g.values[g.selected]
          : s.focus;
  let hintCells: Set<number> = EMPTY;
  let hintTarget: number | null = null;
  let hintElims: Map<number, number> = EMPTY_MAP;
  const h = s.hint?.result;
  if (h) {
    if (h.kind === 'wrong') hintCells = new Set(h.wrong);
    else if (h.step) {
      if (s.hint!.stage === 1) {
        // Stage 1 points at the area only.
        const units = h.step.units.length ? h.step.units : [];
        hintCells = new Set(units.length ? unitCells(units[0]) : h.step.cells);
      } else {
        hintCells = new Set(h.step.cells);
        hintTarget = h.place?.cell ?? null;
        hintElims = new Map();
        for (const e of h.step.eliminations) hintElims.set(e.cell, (hintElims.get(e.cell) ?? 0) | (1 << (e.digit - 1)));
      }
    }
  }
  return {
    values: g.values,
    givens: g.givens,
    notes: g.notes,
    selected: g.status === 'playing' ? g.selected : null,
    focusDigit,
    conflicts,
    wrong,
    hintCells,
    hintTarget,
    hintElims,
    highlightUnits: settings.highlightUnits,
    highlightSame: settings.highlightSame,
    dots: settings.notesStyle === 'dots',
  };
}

function unitCells(u: number): number[] {
  // classic layout: 0-8 rows, 9-17 cols, 18-26 boxes
  if (u < 9) return Array.from({ length: 9 }, (_, c) => u * 9 + c);
  if (u < 18) return Array.from({ length: 9 }, (_, r) => r * 9 + (u - 9));
  const b = u - 18;
  const r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3;
  const out: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push((r0 + r) * 9 + c0 + c);
  return out;
}

export function BoardHost({ onReady, padRef }: { onReady: (api: BoardApi) => void; padRef: { current: { button(d: number): HTMLElement | null } | null } }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<BoardApi | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const wrap = wrapRef.current!;
    const view = new BoardView(host);
    const effects = new Effects(view, () => currentTheme()!.palette, () => padRef.current);
    apiRef.current = { view, effects };
    onReady(apiRef.current);

    // ---- sizing
    const size = () => {
      const r = wrap.getBoundingClientRect();
      const S = Math.max(180, Math.min(r.width, r.height));
      const c = Math.floor(S / 10.25);
      const g = Math.max(2, Math.round(c * 0.075));
      const boxx = Math.max(2, Math.round(c * 0.13));
      host.style.setProperty('--cell', `${c}px`);
      host.style.setProperty('--gap', `${g}px`);
      host.style.setProperty('--boxx', `${boxx}px`);
    };
    const ro = new ResizeObserver(size);
    ro.observe(wrap);
    size();

    // ---- render + effects
    let last: AppState | null = null;
    const render = () => {
      const s = store.state;
      if (last && s.game === last.game && s.hint === last.hint && s.meta.settings === last.meta.settings && s.focus === last.focus) return;
      const prevSel = last?.game?.selected ?? null;
      last = s;
      const m = buildModel(s);
      if (m) view.update(m);
      const sel = s.game?.selected ?? null;
      if (sel !== null && sel !== prevSel && s.game?.status === 'playing') effects.selectRing(sel);
    };
    render();
    const unsub = store.subscribe(render);
    const unsubEvents = store.onGameEvents((events, prev) => {
      render();
      effects.handle(events, prev, store.state.game?.givens ?? '');
    });

    // ---- input
    let stroke: { digit: number; add: boolean; cells: Set<number> } | null = null;
    let pressed: number | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const s = store.state;
      const g = s.game;
      if (!g || g.status !== 'playing' || s.paused) return;
      const i = view.cellAt(e.clientX, e.clientY);
      if (i === null) return;
      e.preventDefault();
      audio.unlock();
      host.setPointerCapture?.(e.pointerId);
      view.setOrigin(i, e.clientX, e.clientY);
      pressed = i;
      effects.pressCell(i);
      const settings = s.meta.settings;
      if (settings.inputMode === 'paint' && g.brush) {
        store.select(i);
        if (g.notesMode) {
          if (g.values[i]) return;
          const add = !(g.notes[i] & (1 << (g.brush - 1)));
          stroke = { digit: g.brush, add, cells: new Set([i]) };
          store.beginStroke();
          const d = g.brush;
          store.act((st, t) => G.paintNotes(st, [i], d, add, t));
        } else {
          const d = g.brush;
          if (g.givens.charCodeAt(i) !== 48) {
            audio.select();
            return;
          }
          store.act((st, t) => G.placeDigit(st, i, d, store.settings, t));
        }
      } else {
        if (g.selected !== i) audio.select();
        store.select(i);
        if (s.focus !== null) store.setFocus(null);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!stroke) return;
      const i = view.cellAt(e.clientX, e.clientY);
      if (i === null || stroke.cells.has(i)) return;
      stroke.cells.add(i);
      const g = store.state.game;
      if (!g || g.values[i]) return;
      const { digit, add } = stroke;
      view.setOrigin(i, e.clientX, e.clientY);
      store.act((st, t) => G.paintNotes(st, [i], digit, add, t));
    };
    const onUp = () => {
      if (pressed !== null) effects.releaseCell(pressed);
      pressed = null;
      if (stroke) {
        stroke = null;
        store.endStroke();
      }
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    const noMenu = (e: Event) => e.preventDefault();
    host.addEventListener('contextmenu', noMenu);

    return () => {
      unsub();
      unsubEvents();
      ro.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('contextmenu', noMenu);
      motion.cancelAll();
      view.destroy();
    };
  }, []);

  const paused = store.state.paused;
  return (
    <div class={`board-wrap${paused ? ' paused' : ''}`} ref={wrapRef}>
      <div class="board-host" ref={hostRef} />
    </div>
  );
}
