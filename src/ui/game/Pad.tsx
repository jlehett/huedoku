/**
 * Number pad: nine paint splats in spectrum order. Tap places (or picks the
 * brush in paint mode); long-press enters a note. Each button shows how many
 * of its digit are still needed and retires when all nine are placed.
 */
import { useEffect, useRef } from 'preact/hooks';
import { audio } from '../../audio/audio';
import { haptics } from '../../haptics/haptics';
import * as G from '../../state/game';
import { store } from '../app/store';
import { useApp } from '../app/useApp';
import type { Effects } from '../../motion/effects';

const LONG_PRESS = 420;

export function Pad({ effects, padRef }: { effects: Effects | null; padRef: { current: { button(d: number): HTMLElement | null } | null } }) {
  const game = useApp((s) => s.game);
  const settings = useApp((s) => s.meta.settings);
  const focus = useApp((s) => s.focus);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  const downDigit = useRef<number | null>(null);

  useEffect(() => {
    padRef.current = { button: (d) => rootRef.current?.querySelector<HTMLElement>(`[data-d="${d}"]`) ?? null };
    return () => {
      padRef.current = null;
    };
  }, []);

  if (!game) return null;
  const left = G.remainingCounts(game, settings.mistakeMode);
  const paint = settings.inputMode === 'paint';
  const selectedValue = game.selected !== null ? game.values[game.selected] : 0;

  const down = (d: number, e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    audio.unlock();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    effects?.pressPad(el);
    downDigit.current = d;
    longFired.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      haptics.fire('note');
      const g = store.state.game;
      if (!g) return;
      if (paint) {
        if (!g.notesMode) store.toggleNotesMode();
        store.setBrush(d);
      } else if (g.selected !== null) {
        store.input(d, true);
      }
    }, LONG_PRESS);
  };

  const up = (d: number, e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    effects?.releasePad(el);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (longFired.current || downDigit.current !== d) return;
    downDigit.current = null;
    const g = store.state.game;
    if (!g || store.state.paused) return;
    if (paint) {
      store.setBrush(g.brush === d ? null : d);
      audio.select();
    } else if (g.selected !== null && g.givens.charCodeAt(g.selected) === 48) {
      store.input(d);
    } else {
      store.setFocus(store.state.focus === d ? null : d);
      audio.select();
    }
  };

  const cancel = (e: PointerEvent) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    effects?.releasePad(e.currentTarget as HTMLElement);
  };

  return (
    <div class={`pad${game.notesMode ? ' noting' : ''}`} ref={rootRef} role="group" aria-label="Number pad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
        const done = left[d] <= 0;
        const active = paint ? game.brush === d : focus === d || (selectedValue === d && game.selected !== null);
        return (
          <button
            key={d}
            class={`pad-btn${done ? ' done' : ''}${active ? ' active' : ''}${paint && game.brush === d ? ' brush' : ''}`}
            data-d={d}
            aria-label={`${d}${done ? ', all placed' : `, ${left[d]} left`}${paint && game.brush === d ? ', brush' : ''}`}
            onPointerDown={(e) => down(d, e)}
            onPointerUp={(e) => up(d, e)}
            onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span class="splat" />
            <span class="n">{d}</span>
            <span class="count" aria-hidden="true">
              {done ? '' : left[d]}
            </span>
            <span class="under" />
          </button>
        );
      })}
    </div>
  );
}
