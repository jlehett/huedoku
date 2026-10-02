/**
 * Choreography. UI code hands game events to `Effects.handle()`; this file
 * decides what moves, what sounds and what buzzes. Timings come only from
 * tokens.ts. Every effect has a reduced-motion version (crossfades, no
 * travel or shake) that still carries the same information.
 */
import { audio } from '../audio/audio';
import type { ResolvedPalette } from '../color/palettes';
import { haptics } from '../haptics/haptics';
import type { GameEvent } from '../state/game';
import type { Move } from '../state/types';
import type { BoardView } from '../ui/board/BoardView';
import { classic } from '../engine/variant';
import { fx } from './particles';
import { motion } from './scheduler';
import { easeInOutSine, sampled, springKeyframes } from './spring';
import { DUR, EASE, SPRING } from './tokens';

const rowOf = (i: number) => (i / 9) | 0;
const colOf = (i: number) => i % 9;

export interface PadHandle {
  button(d: number): HTMLElement | null;
}

/** Splash easing used for the paint bloom (fast start, long soft finish). */
const bloomEase = (t: number) => 1 - Math.pow(1 - t, 3.2);

export class Effects {
  constructor(
    private view: BoardView,
    private pal: () => ResolvedPalette,
    private pad: () => PadHandle | null,
  ) {}

  private get reduced() {
    return motion.reduced;
  }

  private size() {
    return this.view.cells[0].root.getBoundingClientRect().width || 36;
  }

  private center(i: number) {
    const r = this.view.cellRect(i);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  }

  private color(d: number) {
    return this.pal().fills[d - 1];
  }

  // ---------------------------------------------------------------- touch

  pressCell(i: number) {
    if (this.reduced) return;
    motion.play(this.view.cells[i].root, [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }], {
      duration: DUR.press,
      easing: EASE.press,
      fill: 'forwards',
      channel: `c${i}:press`,
    });
  }

  releaseCell(i: number) {
    if (this.reduced) return;
    const { keyframes, duration } = springKeyframes(SPRING.release, (p) => ({ transform: `scale(${0.9 + 0.1 * p})` }));
    motion.play(this.view.cells[i].root, keyframes, { duration, easing: 'linear', channel: `c${i}:press`, interrupt: 'cancel' });
  }

  selectRing(i: number) {
    const ring = this.view.cells[i].ring;
    if (this.reduced) {
      motion.play(ring, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.select, channel: `c${i}:ring` });
      return;
    }
    motion.play(ring, [{ opacity: 0, transform: 'scale(1.18)' }, { opacity: 1, transform: 'scale(1)' }], {
      duration: DUR.select,
      easing: EASE.out,
      channel: `c${i}:ring`,
    });
  }

  pressPad(el: HTMLElement) {
    if (this.reduced) return;
    motion.play(el, [{ transform: 'scale(1)' }, { transform: 'scale(0.88)' }], { duration: DUR.press, easing: EASE.press, fill: 'forwards', channel: `pad:${el.dataset.d ?? el.id}` });
  }

  releasePad(el: HTMLElement) {
    if (this.reduced) return;
    const { keyframes, duration } = springKeyframes(SPRING.release, (p) => ({ transform: `scale(${0.88 + 0.12 * p})` }));
    motion.play(el, keyframes, { duration, easing: 'linear', channel: `pad:${el.dataset.d ?? el.id}`, interrupt: 'cancel' });
  }

  /** Generic button press feedback for tools. */
  pressButton(el: HTMLElement) {
    audio.tap();
    haptics.fire('tap');
    if (this.reduced) return;
    const { keyframes, duration } = springKeyframes(SPRING.release, (p) => ({ transform: `scale(${0.86 + 0.14 * p})` }));
    motion.play(el, keyframes, { duration, easing: 'linear', channel: `btn:${el.dataset.fx ?? ''}`, interrupt: 'cancel' });
  }

  // ---------------------------------------------------------------- dispatcher

  handle(events: GameEvent[], prevValues: readonly number[], givens: string) {
    for (const e of events) {
      switch (e.type) {
        case 'placeDigit': {
          const wrong = events.some((x) => (x.type === 'mistake' || x.type === 'conflict') && x.cell === e.cell);
          this.bloom(e.cell, e.digit, !wrong);
          if (!wrong) {
            audio.place(e.digit);
            haptics.fire('place');
          }
          break;
        }
        case 'erase':
          this.wipe(e.cell, e.digit, givens);
          audio.erase();
          haptics.fire('undo');
          break;
        case 'mistake':
          this.mistake(e.cell);
          audio.mistake();
          haptics.fire('mistake');
          break;
        case 'conflict':
          this.conflict(e.cell, e.cells);
          audio.mistake();
          haptics.fire('mistake');
          break;
        case 'unitComplete':
          this.wave(e.units, e.cell);
          break;
        case 'digitComplete':
          this.digitComplete(e.digit);
          break;
        case 'noteToggle':
          this.note(e.cell, e.digit, e.on);
          audio.note(e.on, e.digit);
          haptics.fire('note');
          break;
        case 'notesBatch':
          this.notesBatch(e.cells);
          audio.noteSweep(e.cells.length);
          break;
        case 'noteCleared':
          this.notesFly(e.origin, e.cleared);
          break;
        case 'undo':
          this.undo(e.move, givens);
          haptics.fire('undo');
          break;
        case 'redo':
          this.redo(e.move);
          break;
        case 'blocked':
          this.blocked(e.cell, e.reason);
          break;
        default:
          break;
      }
    }
    void prevValues;
  }

  // ---------------------------------------------------------------- placement

  bloom(i: number, d: number, splash = true) {
    const c = this.view.cells[i];
    const size = this.size();
    const o = this.view.origins.get(i) ?? { x: 0, y: 0 };
    const ox = Math.max(-size / 2, Math.min(size / 2, o.x));
    const oy = Math.max(-size / 2, Math.min(size / 2, o.y));
    motion.interruptPrefix(`c${i}:g`, 'cancel');
    if (this.reduced) {
      motion.play(c.clip, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fade, easing: EASE.out, channel: `c${i}:clip` });
      motion.play(c.num, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fade, easing: EASE.out, channel: `c${i}:num` });
      return;
    }
    const s0 = 0.04;
    const scale = (p: number) => s0 + (1 - s0) * p;
    motion.play(c.clip, sampled(bloomEase, (p) => ({ transform: `translate(${ox}px, ${oy}px) scale(${scale(p)})` })), {
      duration: DUR.bloom,
      easing: 'linear',
      channel: `c${i}:clip`,
    });
    motion.play(c.paint, sampled(bloomEase, (p) => ({ transform: `scale(${1 / scale(p)}) translate(${-ox}px, ${-oy}px)` })), {
      duration: DUR.bloom,
      easing: 'linear',
      channel: `c${i}:paint`,
    });
    const settle = springKeyframes(SPRING.settle, (p) => ({ transform: `scale(${0.3 + 0.7 * p})`, opacity: Math.min(1, p * 2.2) }));
    motion.play(c.num, settle.keyframes, {
      duration: settle.duration,
      delay: DUR.numeralDelay,
      easing: 'linear',
      fill: 'backwards',
      channel: `c${i}:num`,
    });
    // The cell takes the weight of the paint: a quick dip, then a springy return.
    motion.play(
      c.root,
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.9)', offset: 0.18 },
        { transform: 'scale(1.035)', offset: 0.55 },
        { transform: 'scale(0.995)', offset: 0.8 },
        { transform: 'scale(1)' },
      ],
      { duration: DUR.press + DUR.release, easing: EASE.out, composite: 'add', channel: `c${i}:weight` },
    );
    if (!splash) return;
    const r = c.root.getBoundingClientRect();
    fx.splash(r.left + r.width / 2 + ox, r.top + r.height / 2 + oy, this.color(d), size, 8);
  }

  /** Erase: the paint lifts off and the numeral drops away. */
  wipe(i: number, d: number, givens: string) {
    const c = this.view.cells[i];
    this.view.prepareGhost(i, d, givens.charCodeAt(i) !== 48);
    if (this.reduced) {
      motion.play(c.ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fade, channel: `c${i}:ghost` });
      motion.play(c.ghostNum, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fade, channel: `c${i}:gnum` });
      return;
    }
    motion.play(c.ghost, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.82) rotate(-4deg)' }], {
      duration: DUR.wipe,
      easing: EASE.in,
      channel: `c${i}:ghost`,
    });
    motion.play(c.ghostNum, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(18%) scale(0.7)' }], {
      duration: DUR.wipe,
      easing: EASE.in,
      channel: `c${i}:gnum`,
    });
  }

  /** Undo of a placement: the color drains back into the tap point. */
  drain(i: number, d: number, givens: string) {
    const c = this.view.cells[i];
    this.view.prepareGhost(i, d, givens.charCodeAt(i) !== 48);
    motion.interruptPrefix(`c${i}:`, 'cancel');
    if (this.reduced) {
      motion.play(c.ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fade, channel: `c${i}:ghost` });
      motion.play(c.ghostNum, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fade, channel: `c${i}:gnum` });
      return;
    }
    const size = this.size();
    const o = this.view.origins.get(i) ?? { x: 0, y: 0 };
    const ox = Math.max(-size / 2, Math.min(size / 2, o.x));
    const oy = Math.max(-size / 2, Math.min(size / 2, o.y));
    const s0 = 0.04;
    const scale = (p: number) => s0 + (1 - s0) * (1 - p);
    motion.play(c.ghost, sampled(easeInOutSine, (p) => ({ opacity: 1, transform: `translate(${ox}px, ${oy}px) scale(${scale(p)})` })), {
      duration: DUR.drain,
      easing: 'linear',
      channel: `c${i}:ghost`,
    });
    motion.play(c.ghostPaint, sampled(easeInOutSine, (p) => ({ transform: `scale(${1 / scale(p)}) translate(${-ox}px, ${-oy}px)` })), {
      duration: DUR.drain,
      easing: 'linear',
      channel: `c${i}:gpaint`,
    });
    motion.play(c.ghostNum, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.4)' }], {
      duration: DUR.drain * 0.7,
      easing: EASE.in,
      channel: `c${i}:gnum`,
    });
  }

  mistake(i: number) {
    const c = this.view.cells[i];
    // Show why, when the wrong digit repeats in a row, column or box.
    const vals = this.view.model?.values;
    if (vals) {
      for (const p of classic.peers[i]) {
        if (vals[p] === vals[i]) {
          motion.play(this.view.cells[p].glow, [{ opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }], { duration: 900, delay: 120, easing: EASE.inOut, channel: `c${p}:glow` });
        }
      }
    }
    motion.play(c.ring, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1 }], { duration: DUR.shake, channel: `c${i}:ring` });
    if (this.reduced) return;
    motion.play(
      c.root,
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-11%)' },
        { transform: 'translateX(9%)' },
        { transform: 'translateX(-6%)' },
        { transform: 'translateX(4%)' },
        { transform: 'translateX(-1.5%)' },
        { transform: 'translateX(0)' },
      ],
      { duration: DUR.shake, easing: EASE.out, delay: DUR.numeralDelay, composite: 'add', channel: `c${i}:shake` },
    );
  }

  conflict(i: number, peers: number[]) {
    this.mistake(i);
    for (const p of peers) {
      motion.play(this.view.cells[p].ring, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.0 }, { opacity: 1 }], { duration: 600, channel: `c${p}:ring` });
    }
  }

  blocked(i: number, reason: 'given' | 'solved' | 'nothing') {
    if (reason === 'solved') return;
    audio.blocked();
    haptics.fire('blocked');
    if (this.reduced) return;
    motion.play(this.view.cells[i].root, [{ transform: 'scale(1)' }, { transform: 'scale(0.95)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }], {
      duration: 260,
      easing: EASE.out,
      composite: 'add',
      channel: `c${i}:bump`,
    });
  }

  // ---------------------------------------------------------------- notes

  note(i: number, d: number, on: boolean) {
    const el = this.view.cells[i].noteEls[d - 1];
    if (this.reduced) {
      motion.play(el, [{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { duration: DUR.fade, channel: `c${i}:n${d}` });
      return;
    }
    if (on) {
      const k = springKeyframes(SPRING.settle, (p) => ({ transform: `scale(${0.2 + 0.8 * p})`, opacity: Math.min(1, p * 2) }));
      motion.play(el, k.keyframes, { duration: k.duration, easing: 'linear', channel: `c${i}:n${d}` });
    } else {
      motion.play(el, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.3)' }], { duration: DUR.noteIn, easing: EASE.in, channel: `c${i}:n${d}` });
    }
  }

  notesBatch(cells: number[]) {
    cells.forEach((i, k) => {
      const el = this.view.cells[i].notes;
      if (this.reduced) {
        motion.play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fade, channel: `c${i}:notes` });
      } else {
        motion.play(el, [{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'scale(1)' }], {
          duration: DUR.noteIn + 60,
          delay: Math.min(400, k * 6),
          easing: EASE.out,
          fill: 'backwards',
          channel: `c${i}:notes`,
        });
      }
    });
  }

  /** Notes removed by a placement float away from it, nearest first. */
  notesFly(origin: number, cleared: { cell: number; digit: number }[]) {
    const or = rowOf(origin), oc = colOf(origin);
    const sorted = cleared
      .map((x) => ({ ...x, dist: Math.hypot(rowOf(x.cell) - or, colOf(x.cell) - oc) }))
      .sort((a, b) => a.dist - b.dist);
    sorted.forEach((x, k) => {
      const el = this.view.cells[x.cell].noteEls[x.digit - 1];
      if (this.reduced) {
        motion.play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR.noteOut, delay: 80, fill: 'backwards', channel: `c${x.cell}:n${x.digit}` });
        return;
      }
      const dx = colOf(x.cell) - oc, dy = rowOf(x.cell) - or;
      const len = Math.hypot(dx, dy) || 1;
      const tx = (dx / len) * 60, ty = (dy / len) * 60 - 50;
      motion.play(
        el,
        [
          { opacity: 1, transform: 'translate(0,0) scale(1)' },
          { opacity: 1, transform: `translate(${tx * 0.25}%, ${ty * 0.25}%) scale(1.25)`, offset: 0.3 },
          { opacity: 0, transform: `translate(${tx}%, ${ty}%) scale(0.4)` },
        ],
        { duration: DUR.noteOut, delay: 90 + k * DUR.noteStagger, easing: EASE.out, fill: 'backwards', channel: `c${x.cell}:n${x.digit}` },
      );
    });
  }

  // ---------------------------------------------------------------- undo / redo

  undo(move: Move, givens: string) {
    let digit: number | null = null;
    for (const ch of move.changes) {
      if (ch.v0 !== ch.v1) {
        if (ch.v1 && !ch.v0) {
          this.drain(ch.i, ch.v1, givens);
          digit = ch.v1;
        } else if (ch.v0) {
          // value comes back (undoing an erase or a replacement)
          this.bloom(ch.i, ch.v0);
          digit = ch.v0;
        }
      }
      if (ch.n0 !== ch.n1) {
        const appear = ch.n0 & ~ch.n1;
        const gone = ch.n1 & ~ch.n0;
        for (let d = 1; d <= 9; d++) {
          if (appear & (1 << (d - 1))) this.note(ch.i, d, true);
          else if (gone & (1 << (d - 1)) && !ch.v0) this.note(ch.i, d, false);
        }
      }
    }
    audio.undo(digit);
  }

  redo(move: Move) {
    for (const ch of move.changes) {
      if (ch.v0 !== ch.v1 && ch.v1) {
        this.bloom(ch.i, ch.v1);
        audio.place(ch.v1);
      } else if (ch.n0 !== ch.n1) {
        const appear = ch.n1 & ~ch.n0;
        for (let d = 1; d <= 9; d++) if (appear & (1 << (d - 1))) this.note(ch.i, d, true);
      }
    }
    if (!move.changes.some((c) => c.v1 && c.v0 !== c.v1)) audio.undo(null);
  }

  // ---------------------------------------------------------------- celebrations

  /**
   * Unit completion: a wave of light runs out from the placed cell through
   * each finished unit. Two or three units at once merge per cell (earliest
   * arrival wins, overlap glows brighter), so nothing plays twice as fast.
   */
  wave(units: number[], origin: number) {
    const delays = new Map<number, { delay: number; hits: number }>();
    const or = rowOf(origin), oc = colOf(origin);
    let maxRank = 0;
    for (const u of units) {
      const cells = [...classic.units[u].cells].sort((a, b) => {
        const da = Math.max(Math.abs(rowOf(a) - or), Math.abs(colOf(a) - oc));
        const db = Math.max(Math.abs(rowOf(b) - or), Math.abs(colOf(b) - oc));
        return da - db || a - b;
      });
      cells.forEach((c, rank) => {
        const dist = Math.max(Math.abs(rowOf(c) - or), Math.abs(colOf(c) - oc));
        const step = classic.units[u].kind === 'box' ? rank : dist;
        maxRank = Math.max(maxRank, step);
        const prev = delays.get(c);
        const delay = step * DUR.waveStagger;
        if (!prev) delays.set(c, { delay, hits: 1 });
        else delays.set(c, { delay: Math.min(prev.delay, delay), hits: prev.hits + 1 });
      });
    }
    const pal = this.pal();
    for (const [i, { delay, hits }] of delays) {
      const c = this.view.cells[i];
      const peak = hits > 1 ? 1 : 0.8;
      motion.play(c.glow, [{ opacity: 0 }, { opacity: peak, offset: 0.25 }, { opacity: 0 }], {
        duration: DUR.wavePulse,
        delay,
        easing: EASE.out,
        channel: `c${i}:glow`,
      });
      if (!this.reduced) {
        const lift = hits > 1 ? 1.1 : 1.065;
        motion.play(
          c.root,
          [{ transform: 'translateY(0) scale(1)' }, { transform: `translateY(-3%) scale(${lift})`, offset: 0.3 }, { transform: 'translateY(0) scale(1)' }],
          { duration: DUR.wavePulse, delay, easing: EASE.inOut, composite: 'add', channel: `c${i}:wave` },
        );
      }
    }
    if (!this.reduced) {
      const oc0 = this.center(origin);
      for (const u of units) {
        const unit = classic.units[u];
        const color = unit.kind === 'box' ? '#ffffff' : pal.theme === 'dark' ? 'rgba(255,248,230,0.9)' : 'rgba(255,255,255,0.95)';
        if (unit.kind === 'box') {
          for (const c of unit.cells) {
            const d = delays.get(c)!.delay / 1000;
            const p = this.center(c);
            fx.sparkle(p.x, p.y, color, p.w, 1, d);
          }
        } else {
          const first = this.center(unit.cells[0]);
          const last = this.center(unit.cells[8]);
          const spanA = Math.hypot(first.x - oc0.x, first.y - oc0.y);
          const spanB = Math.hypot(last.x - oc0.x, last.y - oc0.y);
          const per = DUR.waveStagger / 1000 / (oc0.w * 1.1);
          if (spanA > 4) fx.band(oc0.x, oc0.y, first.x, first.y, oc0.w * 1.2, color, Math.max(0.15, spanA * per + 0.2), 0, 0.45);
          if (spanB > 4) fx.band(oc0.x, oc0.y, last.x, last.y, oc0.w * 1.2, color, Math.max(0.15, spanB * per + 0.2), 0, 0.45);
        }
      }
    }
    const kind = classic.units[units[0]].kind;
    audio.unit(maxRank + 1, DUR.waveStagger, units.length - 1, kind === 'box' ? 'box' : kind === 'col' ? 'col' : 'row');
    haptics.fire('unit');
  }

  /** Ninth copy placed: every cell of that color pulses together; its pad button retires. */
  digitComplete(d: number) {
    const cells: number[] = [];
    this.view.model?.values.forEach((v, i) => v === d && cells.push(i));
    const color = this.color(d);
    cells.forEach((i, k) => {
      const c = this.view.cells[i];
      const delay = 110 + k * 4;
      motion.play(c.glow, [{ opacity: 0 }, { opacity: 0.95, offset: 0.3 }, { opacity: 0 }], { duration: DUR.digitPulse, delay, easing: EASE.out, channel: `c${i}:glow` });
      if (!this.reduced) {
        const k2 = springKeyframes(SPRING.soft, (p) => ({ transform: `scale(${1 + 0.16 * Math.sin(Math.PI * Math.min(1, p))})` }));
        motion.play(c.root, k2.keyframes, { duration: DUR.digitPulse, delay, easing: 'linear', composite: 'add', channel: `c${i}:pulse` });
        const p = this.center(i);
        fx.sparkle(p.x, p.y, color, p.w, 3, delay / 1000);
      }
    });
    const btn = this.pad()?.button(d);
    if (btn) {
      if (this.reduced) {
        motion.play(btn, [{ opacity: 1 }, { opacity: 0.4 }], { duration: DUR.fade, channel: `pad:${d}:retire` });
      } else {
        motion.play(
          btn,
          [
            { transform: 'scale(1) rotate(0deg)', opacity: 1 },
            { transform: 'scale(1.28) rotate(-8deg)', opacity: 1, offset: 0.22 },
            { transform: 'scale(1.18) rotate(4deg)', opacity: 1, offset: 0.4 },
            { transform: 'scale(0.84) rotate(0deg)', opacity: 0.38 },
          ],
          { duration: DUR.padRetire, easing: EASE.inOut, channel: `pad:${d}:retire` },
        );
        const r = btn.getBoundingClientRect();
        fx.splash(r.left + r.width / 2, r.top + r.height / 2, color, r.width * 0.9, 12);
      }
    }
    audio.digitComplete(d);
    haptics.fire('digit');
  }

  /** Hint: pulse the cells involved, ring the target. */
  hint(cells: number[], target: number | null) {
    audio.hint();
    haptics.fire('tap');
    for (const i of cells) {
      const c = this.view.cells[i];
      motion.play(c.glow, [{ opacity: 0 }, { opacity: 0.6 }, { opacity: 0 }], { duration: DUR.hint, iterations: 2, easing: EASE.inOut, channel: `c${i}:glow` });
    }
    if (target !== null && !this.reduced) {
      motion.play(this.view.cells[target].ring, [{ transform: 'scale(1.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: DUR.select * 2, easing: EASE.out, channel: `c${target}:ring` });
    }
  }

  /**
   * Solve finale (about 3.6 s, skippable). Colors light up in spectrum order
   * (1 red ... 9 magenta) with a rising scale, then a diagonal light pass
   * sweeps the board, then pigment drifts up off the cells and the board
   * settles. Distinct from the unit wave: whole colors, not lines.
   */
  finale(boardEl: HTMLElement, values: readonly number[], onDone: () => void): { skip: () => void } {
    const timers: (() => void)[] = [];
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      timers.forEach((t) => t());
      onDone();
    };
    audio.solve();
    haptics.fire('solve');
    const step = DUR.finaleColorStep;
    // The board steps back, then each color returns in spectrum order (1 red ... 9 magenta).
    const fadeIn = 180;
    const lead = 220;
    for (let i = 0; i < 81; i++) {
      const d = values[i];
      const turn = lead + (d - 1) * step;
      const dur = turn + 260;
      const kf = [
        { opacity: 1, offset: 0 },
        { opacity: 0.22, offset: fadeIn / dur },
        { opacity: 0.22, offset: turn / dur },
        { opacity: 1, offset: 1 },
      ];
      const c = this.view.cells[i];
      motion.play(c.clip, kf, { duration: dur, easing: 'linear', channel: `c${i}:finfade` });
      motion.play(c.num, kf, { duration: dur, easing: 'linear', channel: `c${i}:finfadeN` });
    }
    for (let d = 1; d <= 9; d++) {
      const cells: number[] = [];
      values.forEach((v, i) => v === d && cells.push(i));
      const delay = lead + (d - 1) * step;
      for (const i of cells) {
        const c = this.view.cells[i];
        motion.play(c.glow, [{ opacity: 0 }, { opacity: 0.6, offset: 0.3 }, { opacity: 0 }], { duration: 520, delay, easing: EASE.out, channel: `c${i}:glow` });
        if (!this.reduced) {
          motion.play(c.root, [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-6%) scale(1.14)', offset: 0.35 }, { transform: 'translateY(0) scale(1)' }], {
            duration: 520,
            delay,
            easing: EASE.inOut,
            composite: 'add',
            channel: `c${i}:wave`,
          });
        }
      }
    }
    const sweepAt = lead + 9 * step + 160;
    timers.push(
      motion.after(sweepAt, () => {
        audio.shimmer();
        const rect = boardEl.getBoundingClientRect();
        for (let i = 0; i < 81; i++) {
          const delay = (rowOf(i) + colOf(i)) * 28;
          const c = this.view.cells[i];
          motion.play(c.glow, [{ opacity: 0 }, { opacity: 0.75, offset: 0.4 }, { opacity: 0 }], { duration: 480, delay, easing: EASE.inOut, channel: `c${i}:glow` });
          if (!this.reduced) {
            motion.play(c.root, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.4 }, { transform: 'scale(1)' }], {
              duration: 480,
              delay,
              easing: EASE.inOut,
              composite: 'add',
              channel: `c${i}:wave`,
            });
          }
        }
        if (!this.reduced) {
          fx.band(rect.left - rect.width * 0.2, rect.top - rect.height * 0.2, rect.right + rect.width * 0.2, rect.bottom + rect.height * 0.2, rect.width * 0.5, 'rgba(255,250,235,0.85)', 1.0, 0, 0.5);
        }
      }),
    );
    timers.push(
      motion.after(sweepAt + 760, () => {
        if (!this.reduced) {
          motion.play(boardEl, [{ transform: 'scale(1)' }, { transform: 'scale(1.035)', offset: 0.45 }, { transform: 'scale(1)' }], {
            duration: 1100,
            easing: EASE.inOut,
            composite: 'add',
            channel: 'board:breathe',
          });
          const pal = this.pal();
          for (let k = 0; k < 36; k++) {
            const i = (k * 37 + 11) % 81;
            const p = this.center(i);
            fx.pigment(p.x, p.y, pal.fills[values[i] - 1], p.w, k * 0.02);
          }
        }
      }),
    );
    timers.push(motion.after(DUR.finale, done));
    return {
      skip: () => {
        motion.finishAll();
        fx.clear();
        done();
      },
    };
  }
}
