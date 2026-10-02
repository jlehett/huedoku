/**
 * One full-screen canvas for paint droplets, light bands and pigment drift.
 * The rAF loop only runs while something is alive; particle count is capped
 * and particles are pooled, so heavy moments cannot grow memory.
 */
import { motion } from './scheduler';

type Kind = 'drop' | 'ring' | 'spark' | 'band' | 'pigment' | 'thread';

interface P {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  r: number;
  r1: number;
  life: number;
  age: number;
  delay: number;
  color: string;
  alpha: number;
  /** band: end point and width */
  x2: number;
  y2: number;
  w: number;
  rot: number;
}

const MAX = 420;

class Fx {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private live: P[] = [];
  private pool: P[] = [];
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private sprites = new Map<string, HTMLCanvasElement>();
  enabled = true;
  /** Frame times of the last run (ms), for performance verification. */
  frameLog: number[] = [];

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * this.dpr);
    this.canvas.height = Math.round(window.innerHeight * this.dpr);
  }

  private alloc(): P | null {
    if (this.live.length >= MAX) return null;
    const p = this.pool.pop() ?? ({} as P);
    p.vx = p.vy = p.g = p.age = p.delay = p.rot = 0;
    p.alpha = 1;
    p.r1 = 0;
    p.w = 0;
    this.live.push(p);
    return p;
  }

  private kick() {
    if (!this.raf && this.ctx) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  /** Paint splash: droplets thrown out of the tap point. */
  splash(x: number, y: number, color: string, size: number, count = 9) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const sp = size * (2.2 + Math.random() * 3.2);
      p.kind = 'drop';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - size * 1.2;
      p.g = size * 9;
      p.r = size * (0.05 + Math.random() * 0.07);
      p.life = 0.32 + Math.random() * 0.22;
      p.color = color;
    }
    const ring = this.alloc();
    if (ring) {
      ring.kind = 'ring';
      ring.x = x;
      ring.y = y;
      ring.r = size * 0.15;
      ring.r1 = size * 0.85;
      ring.life = 0.3;
      ring.color = color;
      ring.alpha = 0.55;
    }
    this.kick();
  }

  /** A soft band of light travelling from (x,y) to (x2,y2). */
  band(x: number, y: number, x2: number, y2: number, width: number, color: string, life: number, delay = 0, alpha = 0.5) {
    if (!this.enabled) return;
    const p = this.alloc();
    if (!p) return;
    p.kind = 'band';
    p.x = x;
    p.y = y;
    p.x2 = x2;
    p.y2 = y2;
    p.w = width;
    p.life = life;
    p.delay = delay;
    p.color = color;
    p.alpha = alpha;
    this.kick();
  }

  sparkle(x: number, y: number, color: string, size: number, count = 5, delay = 0) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      p.kind = 'spark';
      p.x = x + Math.cos(a) * size * 0.3;
      p.y = y + Math.sin(a) * size * 0.3;
      p.vx = Math.cos(a) * size * 0.9;
      p.vy = Math.sin(a) * size * 0.9 - size * 0.6;
      p.r = size * (0.04 + Math.random() * 0.05);
      p.life = 0.5 + Math.random() * 0.35;
      p.delay = delay + Math.random() * 0.08;
      p.color = color;
      p.rot = Math.random() * Math.PI;
    }
    this.kick();
  }

  /** Pigment drifting up and spreading, like dye in water (solve finale). */
  pigment(x: number, y: number, color: string, size: number, delay: number) {
    if (!this.enabled) return;
    const p = this.alloc();
    if (!p) return;
    p.kind = 'pigment';
    p.x = x;
    p.y = y;
    p.vx = (Math.random() - 0.5) * size * 0.6;
    p.vy = -size * (0.8 + Math.random() * 0.9);
    p.r = size * 0.35;
    p.r1 = size * (1.4 + Math.random() * 0.8);
    p.life = 1.6 + Math.random() * 0.8;
    p.delay = delay;
    p.color = color;
    p.alpha = 0.32;
    this.kick();
  }

  clear() {
    this.pool.push(...this.live);
    this.live = [];
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  get count() {
    return this.live.length;
  }

  private sprite(color: string): HTMLCanvasElement {
    let s = this.sprites.get(color);
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = 64;
      const c = s.getContext('2d')!;
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, color);
      g.addColorStop(0.55, color + 'aa');
      g.addColorStop(1, color + '00');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      this.sprites.set(color, s);
    }
    return s;
  }

  private frame = (now: number) => {
    const ctx = this.ctx!;
    const canvas = this.canvas!;
    const dtReal = Math.min(0.05, (now - this.last) / 1000);
    this.frameLog.push(now - this.last);
    if (this.frameLog.length > 600) this.frameLog.shift();
    this.last = now;
    const dt = dtReal / motion.timeScale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / this.dpr, canvas.height / this.dpr);
    const next: P[] = [];
    for (const p of this.live) {
      if (p.delay > 0) {
        p.delay -= dt;
        next.push(p);
        continue;
      }
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        this.pool.push(p);
        continue;
      }
      next.push(p);
      switch (p.kind) {
        case 'drop': {
          p.vy += p.g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const r = p.r * (1 - t * 0.6);
          ctx.globalAlpha = Math.min(1, 1.4 * (1 - t));
          ctx.fillStyle = p.color;
          ctx.beginPath();
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const stretch = 1 + Math.min(1.2, sp / 900);
          ctx.ellipse(p.x, p.y, r * stretch, r, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'ring': {
          const e = 1 - Math.pow(1 - t, 3);
          ctx.globalAlpha = p.alpha * (1 - t);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, (p.r1 - p.r) * 0.12 * (1 - t));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + (p.r1 - p.r) * e, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'spark': {
          // A soft round glint that blooms and fades (no hard shapes left behind).
          p.x += p.vx * dt * 0.4;
          p.y += p.vy * dt * 0.4;
          const a = Math.sin(Math.PI * t);
          const r = p.r * (2 + 3 * t);
          ctx.globalAlpha = a * 0.8;
          ctx.drawImage(this.sprite(p.color.startsWith('rgba') ? '#fff8e8' : p.color), p.x - r, p.y - r, r * 2, r * 2);
          break;
        }
        case 'band': {
          // A feathered ellipse of light travelling along the path.
          const cx = p.x + (p.x2 - p.x) * t;
          const cy = p.y + (p.y2 - p.y) * t;
          const ang = Math.atan2(p.y2 - p.y, p.x2 - p.x);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ang + Math.PI / 2);
          ctx.scale(1, 0.38);
          const R = p.w * 1.1;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
          g.addColorStop(0, p.color);
          g.addColorStop(0.45, p.color.startsWith('rgba') ? p.color.replace(/[\d.]+\)$/, '0.35)') : p.color + '59');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = p.alpha * Math.sin(Math.PI * Math.min(1, t * 1.05));
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g;
          ctx.fillRect(-R, -R, R * 2, R * 2);
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'pigment': {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy *= 0.985;
          const r = p.r + (p.r1 - p.r) * (1 - Math.pow(1 - t, 2));
          ctx.globalAlpha = p.alpha * Math.sin(Math.PI * t);
          ctx.drawImage(this.sprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
          break;
        }
        case 'thread':
          break;
      }
    }
    ctx.globalAlpha = 1;
    this.live = next;
    if (this.live.length) this.raf = requestAnimationFrame(this.frame);
    else {
      this.raf = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
}

export const fx = new Fx();
