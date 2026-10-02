/**
 * The single owner of running animations.
 *
 * - Every animation goes through `play()`, tagged with a channel such as
 *   "c12:paint". A new animation on a busy channel fast-forwards (or cancels)
 *   the old one, so rapid taps never stack or leave stale frames.
 * - Animations never block input: state changes are applied immediately and
 *   animations only decorate the transition from old to new visual state.
 * - `timeScale` slows everything down uniformly (used to capture frames).
 * - `reduced` switches choreography to crossfades (effects.ts reads it).
 */

export type Interrupt = 'finish' | 'cancel';

export interface PlayOptions extends KeyframeAnimationOptions {
  channel?: string;
  interrupt?: Interrupt;
}

class Scheduler {
  timeScale = 1;
  reduced = false;
  private channels = new Map<string, Set<Animation>>();
  private all = new Set<Animation>();
  private listeners = new Set<() => void>();
  /** Verification counters. */
  stats = { started: 0, interrupted: 0, peak: 0 };

  play(el: Element | null | undefined, keyframes: Keyframe[] | PropertyIndexedKeyframes, opts: PlayOptions): Animation | null {
    if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
    const { channel, interrupt = 'finish', ...rest } = opts;
    if (channel) this.interruptChannel(channel, interrupt);
    let anim: Animation;
    try {
      anim = el.animate(keyframes, { fill: 'none', ...rest });
    } catch {
      return null;
    }
    anim.playbackRate = 1 / this.timeScale;
    this.stats.started++;
    this.all.add(anim);
    this.stats.peak = Math.max(this.stats.peak, this.all.size);
    if (channel) {
      let set = this.channels.get(channel);
      if (!set) this.channels.set(channel, (set = new Set()));
      set.add(anim);
    }
    const cleanup = () => {
      this.all.delete(anim);
      if (channel) {
        const set = this.channels.get(channel);
        set?.delete(anim);
        if (set && !set.size) this.channels.delete(channel);
      }
      if (!this.all.size) this.listeners.forEach((l) => l());
    };
    anim.addEventListener('finish', cleanup);
    anim.addEventListener('cancel', cleanup);
    anim.addEventListener('remove', cleanup);
    return anim;
  }

  interruptChannel(channel: string, how: Interrupt = 'finish') {
    const set = this.channels.get(channel);
    if (!set) return;
    for (const a of [...set]) {
      this.stats.interrupted++;
      try {
        if (how === 'finish' && a.effect?.getTiming().iterations !== Infinity) a.finish();
        else a.cancel();
      } catch {
        a.cancel();
      }
    }
    this.channels.delete(channel);
  }

  /** Interrupt every channel that starts with a prefix ("c12:" = everything on cell 12). */
  interruptPrefix(prefix: string, how: Interrupt = 'finish') {
    for (const ch of [...this.channels.keys()]) if (ch.startsWith(prefix)) this.interruptChannel(ch, how);
  }

  busy(channel: string) {
    return (this.channels.get(channel)?.size ?? 0) > 0;
  }

  /** Jump every running animation to its end state (skip button, page hide). */
  finishAll() {
    for (const a of [...this.all]) {
      try {
        if (a.effect?.getTiming().iterations === Infinity) a.cancel();
        else a.finish();
      } catch {
        a.cancel();
      }
    }
  }

  cancelAll() {
    for (const a of [...this.all]) a.cancel();
  }

  get running() {
    return this.all.size;
  }

  onIdle(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setTimeScale(s: number) {
    this.timeScale = Math.max(0.01, s);
    for (const a of this.all) a.playbackRate = 1 / this.timeScale;
  }

  /** setTimeout that respects the time scale; returns a canceller. */
  after(ms: number, fn: () => void): () => void {
    const id = window.setTimeout(fn, ms * this.timeScale);
    return () => clearTimeout(id);
  }
}

export const motion = new Scheduler();
