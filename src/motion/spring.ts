/**
 * Damped spring sampled into keyframe offsets, so springs run on the
 * compositor through the Web Animations API like any other animation.
 */
import type { SpringSpec } from './tokens';

export interface SpringSamples {
  /** Progress values (0 -> 1, may overshoot) at evenly spaced times. */
  values: number[];
  /** Time until settled, in ms. */
  duration: number;
  /** Peak overshoot above 1 (0.08 = 8%). */
  overshoot: number;
}

const cache = new Map<string, SpringSamples>();

export function sampleSpring(spec: SpringSpec, samples = 24): SpringSamples {
  const key = `${spec.stiffness}/${spec.damping}/${spec.mass ?? 1}/${samples}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = spec.mass ?? 1;
  let x = 0, v = 0;
  const dt = 1 / 1000;
  const trace: number[] = [];
  let settledAt = 0;
  let peak = 0;
  for (let t = 0; t < 3000; t++) {
    const a = (-spec.stiffness * (x - 1) - spec.damping * v) / m;
    v += a * dt;
    x += v * dt;
    trace.push(x);
    peak = Math.max(peak, x);
    if (Math.abs(x - 1) > 0.002 || Math.abs(v) > 0.01) settledAt = t + 1;
  }
  const duration = Math.max(60, settledAt);
  const values: number[] = [];
  for (let i = 0; i <= samples; i++) values.push(i === samples ? 1 : trace[Math.min(trace.length - 1, Math.round((i / samples) * duration))]);
  const res = { values, duration, overshoot: Math.max(0, peak - 1) };
  cache.set(key, res);
  return res;
}

/** Keyframes that interpolate `from` -> `to` along a spring. */
export function springKeyframes(
  spec: SpringSpec,
  build: (p: number) => Keyframe,
  samples = 24,
): { keyframes: Keyframe[]; duration: number } {
  const s = sampleSpring(spec, samples);
  const keyframes = s.values.map((p, i) => ({ ...build(p), offset: i / samples }));
  return { keyframes, duration: s.duration };
}

/** Sample any easing function into keyframes (used for matched counter-scales). */
export function sampled(fn: (t: number) => number, build: (p: number) => Keyframe, samples = 16): Keyframe[] {
  return Array.from({ length: samples + 1 }, (_, i) => ({ ...build(fn(i / samples)), offset: i / samples }));
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
