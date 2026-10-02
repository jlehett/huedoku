/**
 * All sound is synthesized with Web Audio; nothing is downloaded.
 *
 * Digits map to D major pentatonic over two octaves (D4 E4 F#4 A4 B4 D5 E5
 * F#5 A5), so 1 (red) is the lowest note and 9 (magenta) the highest, matching
 * the color order. Effects and music have separate gain buses that meet in a
 * compressor acting as a limiter, which keeps peaks below clipping.
 *
 * iOS: the context is created and resumed on the first user gesture, and the
 * audio session is left as "ambient", so the ring/silent switch is respected.
 */

const SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const BASE = 293.66; // D4
export const digitFreq = (d: number) => BASE * Math.pow(2, SEMITONES[d - 1] / 12);

type Ctx = AudioContext;

class AudioEngine {
  private ctx: Ctx | null = null;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private noise!: AudioBuffer;
  private voices: { stop: (t: number) => void; end: number }[] = [];
  private sfxVolume = 0.8;
  private musicVolume = 0.4;
  private soundOn = true;
  private musicOn = false;
  private musicTimer: number | null = null;
  /** Debug/verification hook: count of sounds triggered. */
  played = 0;
  lastPlayed = '';

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Call from a user-gesture handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        const nav = navigator as Navigator & { audioSession?: { type: string } };
        if (nav.audioSession) nav.audioSession.type = 'ambient';
      } catch {
        /* not supported */
      }
      this.ctx = new AC({ latencyHint: 'interactive' });
      const ctx = this.ctx;
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.12;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      this.limiter.connect(master).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfx.connect(this.limiter);
      this.musicBus.connect(this.limiter);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) | 0;
        data[i] = ((seed >>> 8) / 8388608 - 1) * 0.9;
      }
      this.applyVolumes();
      // Play one silent sample: required to unlock output on older iOS.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      if (this.musicOn) this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  configure(o: { sound: boolean; sfxVolume: number; music: boolean; musicVolume: number }) {
    this.soundOn = o.sound;
    this.sfxVolume = o.sfxVolume;
    this.musicVolume = o.musicVolume;
    const musicWas = this.musicOn;
    this.musicOn = o.music && o.sound;
    this.applyVolumes();
    if (this.ctx && this.musicOn && !musicWas) this.startMusic();
    if (!this.musicOn && musicWas) this.stopMusic();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Perceptual curve; 0.55 keeps the hottest stack under the limiter threshold.
    this.sfx.gain.setTargetAtTime(this.soundOn ? 0.55 * this.sfxVolume ** 1.6 : 0, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.35 * this.musicVolume ** 1.6 : 0, t, 0.2);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private now() {
    return this.ctx!.currentTime + 0.004;
  }

  private canPlay(name: string) {
    if (!this.ctx || !this.soundOn || this.sfxVolume <= 0) return false;
    if (this.ctx.state !== 'running') this.ctx.resume();
    this.played++;
    this.lastPlayed = name;
    // Voice cap: stop the oldest voices if too many overlap.
    const t = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > t);
    while (this.voices.length > 28) this.voices.shift()!.stop(t);
    return true;
  }

  private track(nodes: AudioScheduledSourceNode[], end: number) {
    this.voices.push({
      end,
      stop: (t) => nodes.forEach((n) => {
        try {
          n.stop(t + 0.01);
        } catch {
          /* already stopped */
        }
      }),
    });
  }

  /** A soft mallet note: fundamental + quick-decaying overtones. */
  private mallet(freq: number, t: number, opts: { gain?: number; decay?: number; bright?: number; bus?: AudioNode } = {}) {
    const ctx = this.ctx!;
    const gain = opts.gain ?? 0.5;
    const decay = opts.decay ?? 0.9;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(gain, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    out.connect(opts.bus ?? this.sfx);
    const partials: [number, number, number, OscillatorType][] = [
      [1, 1, 1, 'sine'],
      [2, 0.22 * (opts.bright ?? 1), 0.35, 'sine'],
      [3.98, 0.08 * (opts.bright ?? 1), 0.18, 'sine'],
    ];
    const nodes: OscillatorNode[] = [];
    for (const [mult, amp, life, type] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + decay * life);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.05);
      nodes.push(o);
    }
    this.track(nodes, t + decay);
  }

  private noiseBurst(t: number, dur: number, filter: { type: BiquadFilterType; f0: number; f1?: number; q?: number }, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bq = ctx.createBiquadFilter();
    bq.type = filter.type;
    bq.Q.value = filter.q ?? 1;
    bq.frequency.setValueAtTime(filter.f0, t);
    if (filter.f1) bq.frequency.exponentialRampToValueAtTime(filter.f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(bq).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    this.track([src], t + dur);
  }

  private thump(t: number, f0: number, f1: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.track([o], t + dur);
  }

  // ------------------------------------------------------------ events

  place(d: number) {
    if (!this.canPlay('place')) return;
    const t = this.now();
    this.thump(t, 190, 95, 0.07, 0.22); // the paint landing
    this.noiseBurst(t, 0.035, { type: 'lowpass', f0: 1800, f1: 500 }, 0.12);
    this.mallet(digitFreq(d), t + 0.012, { gain: 0.42, decay: 1.0 });
  }

  /** Rising arpeggio for a completed unit. `delays` in ms, one note per step. */
  unit(steps: number, stepMs: number, extraUnits: number, kind: 'row' | 'col' | 'box') {
    if (!this.canPlay('unit')) return;
    const t = this.now() + 0.03;
    const n = Math.min(9, steps);
    for (let k = 0; k < n; k++) {
      const d = 1 + Math.round((k * 8) / Math.max(1, n - 1));
      const f = digitFreq(d) * (kind === 'col' ? 2 : 1);
      this.mallet(f, t + (k * stepMs) / 1000, { gain: 0.16, decay: kind === 'box' ? 1.3 : 0.9, bright: kind === 'col' ? 0.4 : 1.4 });
    }
    const end = t + (n * stepMs) / 1000;
    // A chord on arrival; a second simultaneous unit adds a fifth above.
    this.mallet(digitFreq(1), end, { gain: 0.14, decay: 1.6 });
    this.mallet(digitFreq(3), end, { gain: 0.12, decay: 1.6 });
    this.mallet(digitFreq(5), end, { gain: 0.12, decay: 1.6 });
    for (let k = 0; k < extraUnits; k++) this.mallet(digitFreq(4) * 2, end + 0.05 * (k + 1), { gain: 0.12, decay: 1.8 });
  }

  digitComplete(d: number) {
    if (!this.canPlay('digit')) return;
    const t = this.now() + 0.02;
    const f = digitFreq(d);
    this.mallet(f, t, { gain: 0.3, decay: 1.8, bright: 1.6 });
    this.mallet(f * 1.5, t + 0.07, { gain: 0.2, decay: 1.8 });
    this.mallet(f * 2, t + 0.14, { gain: 0.18, decay: 2.2, bright: 0.6 });
  }

  solve() {
    if (!this.canPlay('solve')) return;
    const t = this.now() + 0.05;
    for (let d = 1; d <= 9; d++) this.mallet(digitFreq(d), t + (d - 1) * 0.12, { gain: 0.24, decay: 1.4, bright: 1.2 });
    // Warm swell under the sweep.
    const ctx = this.ctx!;
    const pad = ctx.createGain();
    pad.gain.setValueAtTime(0, t + 1.0);
    pad.gain.linearRampToValueAtTime(0.12, t + 1.6);
    pad.gain.exponentialRampToValueAtTime(0.0008, t + 3.8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    pad.connect(lp).connect(this.sfx);
    const nodes: OscillatorNode[] = [];
    for (const [d, oct] of [[1, 0.5], [4, 0.5], [6, 0.5], [2, 1], [6, 1]] as const) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = digitFreq(d) * oct;
        o.detune.value = det;
        o.connect(pad);
        o.start(t + 1.0);
        o.stop(t + 3.9);
        nodes.push(o);
      }
    }
    this.track(nodes, t + 3.9);
    this.mallet(digitFreq(9) * 2, t + 2.2, { gain: 0.1, decay: 1.6, bright: 0.3 });
  }

  /** Light pass across the board in the finale (diagonal sweep). */
  shimmer() {
    if (!this.canPlay('shimmer')) return;
    const t = this.now();
    this.noiseBurst(t, 0.9, { type: 'bandpass', f0: 2500, f1: 7000, q: 6 }, 0.05);
  }

  mistake() {
    if (!this.canPlay('mistake')) return;
    const t = this.now();
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
    lp.connect(g).connect(this.sfx);
    const nodes: OscillatorNode[] = [];
    for (const f of [155, 164]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.3);
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.35);
      nodes.push(o);
    }
    this.track(nodes, t + 0.35);
  }

  note(on: boolean, d: number) {
    if (!this.canPlay('note')) return;
    const t = this.now();
    this.noiseBurst(t, 0.03, { type: 'highpass', f0: on ? 3800 : 2400 }, 0.09);
    this.mallet(digitFreq(d) * 2, t, { gain: on ? 0.06 : 0.035, decay: 0.25, bright: 0.2 });
  }

  noteSweep(count: number) {
    if (!this.canPlay('noteSweep')) return;
    const t = this.now() + 0.04;
    for (let k = 0; k < Math.min(count, 6); k++) this.noiseBurst(t + k * 0.03, 0.04, { type: 'highpass', f0: 5000 - k * 300 }, 0.035);
  }

  erase() {
    if (!this.canPlay('erase')) return;
    const t = this.now();
    this.noiseBurst(t, 0.16, { type: 'bandpass', f0: 2200, f1: 500, q: 1.5 }, 0.14);
  }

  undo(d: number | null) {
    if (!this.canPlay('undo')) return;
    const t = this.now();
    if (d) {
      const ctx = this.ctx!;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(digitFreq(d), t);
      o.frequency.exponentialRampToValueAtTime(digitFreq(d) * 0.84, t + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0005, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.24);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.26);
      this.track([o], t + 0.26);
    }
    this.noiseBurst(t, 0.12, { type: 'bandpass', f0: 600, f1: 1800, q: 2 }, 0.06);
  }

  hint() {
    if (!this.canPlay('hint')) return;
    const t = this.now();
    this.mallet(digitFreq(7) * 2, t, { gain: 0.14, decay: 1.2, bright: 0.3 });
    this.mallet(digitFreq(9) * 2, t + 0.1, { gain: 0.12, decay: 1.4, bright: 0.3 });
  }

  tap() {
    if (!this.canPlay('tap')) return;
    const t = this.now();
    this.noiseBurst(t, 0.018, { type: 'bandpass', f0: 3200, q: 2 }, 0.08);
  }

  select() {
    if (!this.canPlay('select')) return;
    const t = this.now();
    this.thump(t, 900, 700, 0.03, 0.035);
  }

  blocked() {
    if (!this.canPlay('blocked')) return;
    const t = this.now();
    this.thump(t, 220, 180, 0.08, 0.08);
  }

  stitch(i: number) {
    if (!this.canPlay('stitch')) return;
    const t = this.now();
    this.noiseBurst(t, 0.07, { type: 'bandpass', f0: 900 + i * 40, f1: 2600 + i * 60, q: 3 }, 0.07);
    this.thump(t + 0.06, 520, 380, 0.04, 0.03);
  }

  knot() {
    if (!this.canPlay('knot')) return;
    const t = this.now();
    this.mallet(digitFreq(5), t, { gain: 0.16, decay: 1.2 });
    this.mallet(digitFreq(8), t + 0.09, { gain: 0.14, decay: 1.5 });
  }

  whoosh(up: boolean) {
    if (!this.canPlay('whoosh')) return;
    const t = this.now();
    this.noiseBurst(t, 0.25, { type: 'bandpass', f0: up ? 400 : 1600, f1: up ? 1600 : 400, q: 1 }, 0.06);
  }

  fanfare() {
    if (!this.canPlay('fanfare')) return;
    const t = this.now() + 0.05;
    const seq = [1, 3, 5, 6, 8, 9];
    seq.forEach((d, k) => this.mallet(digitFreq(d), t + k * 0.09, { gain: 0.2, decay: 1.6, bright: 1.2 }));
    [1, 4, 6, 9].forEach((d) => this.mallet(digitFreq(d), t + 0.65, { gain: 0.13, decay: 2.4 }));
  }

  // ------------------------------------------------------------ ambient music

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    const chords = [[1, 3, 5, 9], [4, 6, 8], [2, 4, 7], [1, 5, 6, 8]];
    let k = 0;
    const play = () => {
      if (!this.ctx || !this.musicOn) return;
      const t = this.ctx.currentTime + 0.1;
      const chord = chords[k++ % chords.length];
      for (const d of chord) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = digitFreq(d) / 2;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.08, t + 2.5);
        g.gain.linearRampToValueAtTime(0, t + 7.5);
        o.connect(g).connect(this.musicBus);
        o.start(t);
        o.stop(t + 7.6);
      }
      const pluck = chord[(k * 7) % chord.length];
      this.mallet(digitFreq(pluck), t + 3, { gain: 0.07, decay: 2.5, bright: 0.2, bus: this.musicBus });
    };
    play();
    this.musicTimer = window.setInterval(play, 6000);
  }

  private stopMusic() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}

export const audio = new AudioEngine();
