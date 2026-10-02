/** Bottom sheet with scrim; slides in, and out before closing. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { audio } from '../../audio/audio';
import { motion } from '../../motion/scheduler';
import { DUR, EASE } from '../../motion/tokens';
import { store } from '../app/store';

export function useSheetClose(ref: { current: HTMLElement | null }) {
  return (after?: () => void) => {
    const el = ref.current;
    const done = () => {
      store.closeSheet();
      after?.();
    };
    if (!el || motion.reduced) return done();
    const panel = el.querySelector('.sheet-panel');
    motion.play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR.sheetOut, easing: EASE.in, fill: 'forwards', channel: 'sheet:scrim' });
    const a = motion.play(panel, [{ transform: 'translateY(0)' }, { transform: 'translateY(105%)' }], { duration: DUR.sheetOut, easing: EASE.in, fill: 'forwards', channel: 'sheet:panel' });
    if (a) a.finished.then(done, done);
    else done();
  };
}

export function Sheet({ title, children, class: cls, labelledBy, sheetRef }: { title?: string; children: ComponentChildren; class?: string; labelledBy?: string; sheetRef?: { current: HTMLDivElement | null } }) {
  const local = useRef<HTMLDivElement>(null);
  const ref = sheetRef ?? local;
  const close = useSheetClose(ref);
  useEffect(() => {
    audio.whoosh(true);
    const el = ref.current;
    if (!el) return;
    const panel = el.querySelector('.sheet-panel') as HTMLElement | null;
    if (motion.reduced) {
      motion.play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fade, channel: 'sheet:scrim' });
    } else {
      motion.play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.sheetIn, easing: EASE.out, channel: 'sheet:scrim' });
      motion.play(panel, [{ transform: 'translateY(100%)' }, { transform: 'translateY(-1.5%)', offset: 0.75 }, { transform: 'translateY(0)' }], {
        duration: DUR.sheetIn,
        easing: EASE.out,
        channel: 'sheet:panel',
      });
    }
    panel?.focus();
  }, []);
  return (
    <div class={`sheet ${cls ?? ''}`} ref={ref} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet-panel" role="dialog" aria-modal="true" aria-label={title} aria-labelledby={labelledBy} tabIndex={-1}>
        <div class="grab" aria-hidden="true" />
        {title && <h2 class="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
