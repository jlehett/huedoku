/**
 * Haptics.
 *
 * Android Chrome: the Vibration API with short patterns per event.
 * iOS Safari has no Vibration API. Since iOS 17.4, toggling an
 * <input type="checkbox" switch> during a user gesture plays the system
 * "switch" tick; on iOS 18+ that works from script via a label click. We use
 * that as a best-effort single tick on iOS and never claim more: patterns
 * collapse to one tick, and nothing happens outside a user gesture. This could
 * not be verified on a real iPhone while building (see README).
 */

export type HapticEvent = 'tap' | 'place' | 'note' | 'unit' | 'digit' | 'solve' | 'mistake' | 'blocked' | 'undo' | 'stitch';

const PATTERNS: Record<HapticEvent, number | number[]> = {
  tap: 6,
  place: 12,
  note: 5,
  unit: [10, 40, 14],
  digit: [14, 50, 18, 50, 24],
  solve: [20, 70, 20, 70, 40],
  mistake: [28, 50, 28],
  blocked: 8,
  undo: 8,
  stitch: 6,
};

const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

class Haptics {
  enabled = true;
  private label: HTMLLabelElement | null = null;
  readonly kind: 'vibrate' | 'ios-switch' | 'none' =
    typeof navigator !== 'undefined' && 'vibrate' in navigator && !isIOS ? 'vibrate' : isIOS ? 'ios-switch' : 'none';
  /** Debug counter for tests. */
  fired = 0;

  private iosTick() {
    if (!this.label) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.id = 'haptic-switch';
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-10px;top:-10px';
      label.appendChild(input);
      document.body.appendChild(label);
      this.label = label;
    }
    this.label.click();
  }

  fire(e: HapticEvent) {
    if (!this.enabled) return;
    this.fired++;
    if (this.kind === 'vibrate') {
      try {
        navigator.vibrate(PATTERNS[e]);
      } catch {
        /* ignore */
      }
    } else if (this.kind === 'ios-switch') {
      if (e === 'note' || e === 'stitch') return; // keep iOS ticks for meaningful moments
      try {
        this.iosTick();
      } catch {
        /* ignore */
      }
    }
  }
}

export const haptics = new Haptics();
