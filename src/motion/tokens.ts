/**
 * Motion tokens: every duration and easing in the app comes from here.
 * Final tuned values are documented in docs/motion.md.
 */

export const DUR = {
  /** Cell / button press-down. */
  press: 70,
  /** Press release spring (approximate settle time). */
  release: 220,
  /** Paint blooming out from the tap point. */
  bloom: 280,
  /** Undo: paint drains back into the tap point. */
  drain: 240,
  /** Erase: paint lifts and fades. */
  wipe: 220,
  /** Numeral settle spring. */
  settle: 380,
  /** Delay before the numeral lands, so it sits on wet paint. */
  numeralDelay: 50,
  /** Notes pop in / fly away. */
  noteIn: 170,
  noteOut: 280,
  noteStagger: 18,
  /** Unit-complete wave: per-cell stagger and per-cell pulse length. */
  waveStagger: 42,
  wavePulse: 440,
  /** Nine copies placed: whole-color pulse. */
  digitPulse: 560,
  padRetire: 620,
  /** Mistake shake. */
  shake: 380,
  /** Solve finale total (skippable). */
  finale: 3600,
  finaleColorStep: 120,
  /** Hint highlight. */
  hint: 900,
  /** Screen and sheet transitions. */
  sheetIn: 340,
  sheetOut: 220,
  screen: 300,
  fade: 180,
  /** Selection ring move. */
  select: 130,
  /** Daily patch flight into the quilt and stitching. */
  patchShrink: 700,
  patchFly: 820,
  stitch: 900,
} as const;

export const EASE = {
  /** Decelerating, for things arriving. */
  out: 'cubic-bezier(0.16, 0.84, 0.3, 1)',
  /** Strong decel for blooms: fast start like a splash. */
  splash: 'cubic-bezier(0.1, 0.75, 0.25, 1)',
  /** Accelerating, for things leaving. */
  in: 'cubic-bezier(0.55, 0, 0.85, 0.35)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  press: 'cubic-bezier(0.3, 0, 0.6, 1)',
  linear: 'linear',
} as const;

export interface SpringSpec {
  stiffness: number;
  damping: number;
  mass?: number;
}

export const SPRING = {
  /** Numeral settle: ~8% overshoot. */
  settle: { stiffness: 380, damping: 19 } as SpringSpec,
  /** Press release: snappy, small overshoot. */
  release: { stiffness: 520, damping: 22 } as SpringSpec,
  /** Pulses that should feel round and soft. */
  soft: { stiffness: 220, damping: 16 } as SpringSpec,
  /** Sheets. */
  sheet: { stiffness: 300, damping: 30 } as SpringSpec,
} as const;
