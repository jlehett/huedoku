/**
 * Procedural paint textures, drawn once per palette/theme on a canvas and used
 * as cell, pad and quilt backgrounds. Nothing here is a copied image; the
 * look follows docs/art-direction.md.
 */
import { hexToRgb, mix, rgbToHex } from '../color/colorScience';
import type { ResolvedPalette } from '../color/palettes';
import { rngFrom, type Rng } from '../engine/prng';

export interface Textures {
  /** Player entry tiles (wet brush paint), index 0..8 = digit 1..9 */
  player: string[];
  /** Given tiles (matte dyed). */
  given: string[];
  /** Number-pad splats. */
  splat: string[];
  /** Brush underline for the active pad digit. */
  underline: string[];
}

const TILE = 128;

function shade(hex: string, amt: number): string {
  return amt >= 0 ? mix(hex, '#ffffff', amt) : mix(hex, '#000000', -amt);
}

function roughRect(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, w: number, h: number, r: number, jitter: number) {
  const pts: [number, number][] = [];
  const steps = 14;
  const corner = (cx: number, cy: number, a0: number) => {
    for (let k = 0; k <= 3; k++) {
      const a = a0 + (k / 3) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const nx = -(y1 - y0), ny = x1 - x0;
      const len = Math.hypot(nx, ny);
      const j = (rng.float() - 0.5) * 2 * jitter;
      pts.push([x0 + (x1 - x0) * t + (nx / len) * j, y0 + (y1 - y0) * t + (ny / len) * j]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  edge(x + w, y + r, x + w, y + h - r);
  corner(x + w - r, y + h - r, 0);
  edge(x + w - r, y + h, x + r, y + h);
  corner(x + r, y + h - r, Math.PI / 2);
  edge(x, y + h - r, x, y + r);
  corner(x + r, y + r, Math.PI);
  edge(x + r, y, x + w - r, y);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i];
    const [qx, qy] = pts[(i + 1) % pts.length];
    ctx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
  }
  ctx.closePath();
}

/** Accessibility pattern per digit, drawn in `color`. */
export function drawPattern(ctx: CanvasRenderingContext2D, d: number, size: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.045;
  const s = size;
  const step = s / 6;
  ctx.beginPath();
  switch (d) {
    case 1: // horizontal stripes
      for (let y = step / 2; y < s; y += step) { ctx.moveTo(0, y); ctx.lineTo(s, y); }
      break;
    case 2: // dots
      for (let y = step / 2; y < s; y += step) for (let x = step / 2; x < s; x += step) { ctx.moveTo(x + s * 0.03, y); ctx.arc(x, y, s * 0.03, 0, Math.PI * 2); }
      ctx.fill();
      ctx.restore();
      return;
    case 3: // diagonal /
      for (let k = -s; k < s * 2; k += step) { ctx.moveTo(k, s); ctx.lineTo(k + s, 0); }
      break;
    case 4: // grid
      for (let k = step / 2; k < s; k += step) { ctx.moveTo(k, 0); ctx.lineTo(k, s); ctx.moveTo(0, k); ctx.lineTo(s, k); }
      break;
    case 5: // vertical
      for (let x = step / 2; x < s; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, s); }
      break;
    case 6: // checker
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = color;
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if ((x + y) % 2) ctx.fillRect(x * step, y * step, step, step);
      ctx.restore();
      return;
    case 7: // diagonal \
      for (let k = -s; k < s * 2; k += step) { ctx.moveTo(k, 0); ctx.lineTo(k + s, s); }
      break;
    case 8: // rings
      for (let y = step; y < s; y += step * 2) for (let x = step; x < s; x += step * 2) { ctx.moveTo(x + step * 0.55, y); ctx.arc(x, y, step * 0.55, 0, Math.PI * 2); }
      break;
    case 9: // zigzag
      for (let y = step / 2; y < s + step; y += step * 1.2) {
        ctx.moveTo(0, y);
        for (let x = 0; x <= s; x += step) ctx.lineTo(x + step / 2, y + ((x / step) % 2 ? -step / 2 : step / 2) * 0.6);
      }
      break;
  }
  ctx.stroke();
  ctx.restore();
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function drawPlayerTile(fill: string, d: number, theme: 'light' | 'dark', patterns: boolean, numeral: string): HTMLCanvasElement {
  const [c, ctx] = canvas(TILE);
  const rng = rngFrom(`tile/p/${d}/${fill}`);
  const pad = 5;
  // Base paint with ragged brush edges.
  roughRect(ctx, rng, pad, pad, TILE - pad * 2, TILE - pad * 2, 16, 2.6);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, TILE, TILE);
  g.addColorStop(0, shade(fill, theme === 'dark' ? 0.1 : 0.12));
  g.addColorStop(0.55, fill);
  g.addColorStop(1, shade(fill, -0.14));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE, TILE);
  // Brush strokes: long, slightly curved bristle marks.
  for (let k = 0; k < 46; k++) {
    const y = rng.float() * TILE;
    const lighter = rng.float() < 0.5;
    ctx.strokeStyle = shade(fill, lighter ? 0.22 : -0.22);
    ctx.globalAlpha = 0.05 + rng.float() * 0.1;
    ctx.lineWidth = 1 + rng.float() * 3.5;
    ctx.beginPath();
    const x0 = -10 + rng.float() * 30;
    ctx.moveTo(x0, y);
    ctx.bezierCurveTo(x0 + 40, y + (rng.float() - 0.5) * 10, x0 + 80, y + (rng.float() - 0.5) * 10, x0 + 110 + rng.float() * 40, y + (rng.float() - 0.5) * 14);
    ctx.stroke();
  }
  // Pigment pooling: darker rim like drying paint.
  ctx.globalAlpha = 1;
  const rim = ctx.createRadialGradient(TILE / 2, TILE / 2, TILE * 0.3, TILE / 2, TILE / 2, TILE * 0.75);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, theme === 'dark' ? 'rgba(0,0,0,0.32)' : 'rgba(40,20,0,0.18)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, TILE, TILE);
  // Wet sheen: a soft diagonal highlight.
  const sheen = ctx.createLinearGradient(0, 0, TILE * 0.7, TILE * 0.7);
  sheen.addColorStop(0, 'rgba(255,255,255,0.20)');
  sheen.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, TILE, TILE);
  if (patterns) drawPattern(ctx, d, TILE, numeral, 0.22);
  ctx.restore();
  // Edge line where the paint pools.
  roughRect(ctx, rngFrom(`tile/p/${d}/${fill}`), pad, pad, TILE - pad * 2, TILE - pad * 2, 16, 2.6);
  ctx.strokeStyle = shade(fill, -0.3);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  return c;
}

function drawGivenTile(fill: string, d: number, theme: 'light' | 'dark', patterns: boolean, numeral: string): HTMLCanvasElement {
  const [c, ctx] = canvas(TILE);
  const rng = rngFrom(`tile/g/${d}/${fill}`);
  const pad = 3;
  const base = theme === 'dark' ? mix(fill, '#141c26', 0.12) : mix(fill, '#6b5a45', 0.08);
  ctx.beginPath();
  ctx.roundRect(pad, pad, TILE - pad * 2, TILE - pad * 2, 15);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);
  // Dyed-cloth grain: fine cross-weave noise.
  const [r, g, b] = hexToRgb(base);
  const img = ctx.getImageData(0, 0, TILE, TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const k = (y * TILE + x) * 4;
      const weave = ((x >> 1) + (y >> 1)) % 2 ? 4 : -4;
      const n = (rng.float() - 0.5) * 14 + weave;
      img.data[k] = r + n;
      img.data[k + 1] = g + n;
      img.data[k + 2] = b + n;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Inset: shadow at the top, light lip at the bottom, so givens sit "in" the board.
  const inset = ctx.createLinearGradient(0, 0, 0, TILE);
  inset.addColorStop(0, 'rgba(0,0,0,0.30)');
  inset.addColorStop(0.16, 'rgba(0,0,0,0)');
  inset.addColorStop(0.86, 'rgba(255,255,255,0)');
  inset.addColorStop(1, 'rgba(255,255,255,0.14)');
  ctx.fillStyle = inset;
  ctx.fillRect(0, 0, TILE, TILE);
  if (patterns) drawPattern(ctx, d, TILE, numeral, 0.24);
  ctx.restore();
  return c;
}

/** Closed smooth curve through points around (cx, cy) at the given radii. */
function smoothBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, radii: number[], rot = 0) {
  const n = radii.length;
  const pts = radii.map((r, k) => {
    const a = rot + (k / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  });
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const p0 = pts[(k - 1 + n) % n], p1 = pts[k], p2 = pts[(k + 1) % n], p3 = pts[(k + 2) % n];
    if (k === 0) ctx.moveTo(p1[0], p1[1]);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  ctx.closePath();
}

/** A tapered paint spike from radius r0 to r1 at angle a. */
function spike(ctx: CanvasRenderingContext2D, cx: number, cy: number, a: number, r0: number, r1: number, w: number) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const px = -sa, py = ca;
  ctx.beginPath();
  ctx.moveTo(cx + ca * r0 + px * w, cy + sa * r0 + py * w);
  ctx.quadraticCurveTo(cx + ca * (r0 + r1) * 0.5 + px * w * 0.35, cy + sa * (r0 + r1) * 0.5 + py * w * 0.35, cx + ca * r1, cy + sa * r1);
  ctx.quadraticCurveTo(cx + ca * (r0 + r1) * 0.5 - px * w * 0.35, cy + sa * (r0 + r1) * 0.5 - py * w * 0.35, cx + ca * r0 - px * w, cy + sa * r0 - py * w);
  ctx.closePath();
  ctx.fill();
  // round droplet at the tip
  ctx.beginPath();
  ctx.arc(cx + ca * r1, cy + sa * r1, w * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawSplat(fill: string, d: number, patterns: boolean, numeral: string): HTMLCanvasElement {
  const S = 160;
  const [c, ctx] = canvas(S);
  const rng = rngFrom(`splat/${d}`);
  const cx = S / 2, cy = S / 2;
  const R = S * 0.33;
  ctx.fillStyle = fill;
  smoothBlob(ctx, cx, cy, Array.from({ length: 16 }, () => R * (0.9 + rng.float() * 0.16)), rng.float());
  ctx.fill();
  for (let k = 0; k < 11; k++) {
    const a = rng.float() * Math.PI * 2;
    spike(ctx, cx, cy, a, R * 0.85, R * (1.12 + rng.float() * 0.22), 2 + rng.float() * 3.5);
  }
  for (let k = 0; k < 14; k++) {
    const a = rng.float() * Math.PI * 2;
    const dist = R * (1.25 + rng.float() * 0.3);
    ctx.globalAlpha = 0.6 + rng.float() * 0.4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, 0.8 + rng.float() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Texture inside the blob
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 40; k++) {
    ctx.strokeStyle = shade(fill, rng.float() < 0.5 ? 0.18 : -0.18);
    ctx.globalAlpha = 0.05 + rng.float() * 0.09;
    ctx.lineWidth = 2 + rng.float() * 4;
    const y = rng.float() * S;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(S / 2, y + (rng.float() - 0.5) * 30, S, y + (rng.float() - 0.5) * 20);
    ctx.stroke();
  }
  const rim = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.1, cx, cy, R * 1.25);
  rim.addColorStop(0, 'rgba(255,255,255,0.16)');
  rim.addColorStop(0.6, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, S, S);
  if (patterns) drawPattern(ctx, d, S, numeral, 0.2);
  ctx.restore();
  return c;
}

function drawUnderline(fill: string, d: number): HTMLCanvasElement {
  const [c, ctx] = canvas(120, 24);
  const rng = rngFrom(`under/${d}`);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(6, 13);
  for (let x = 6; x <= 114; x += 6) ctx.lineTo(x, 9 + rng.float() * 2);
  for (let x = 114; x >= 6; x -= 6) ctx.lineTo(x, 15 + rng.float() * 3);
  ctx.closePath();
  ctx.fill();
  return c;
}

async function toUrl(c: HTMLCanvasElement): Promise<string> {
  if (c.toBlob) {
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (blob) return URL.createObjectURL(blob);
  }
  return c.toDataURL('image/png');
}

let previous: string[] = [];

export async function buildTextures(pal: ResolvedPalette, patterns: boolean): Promise<Textures> {
  const theme = pal.theme;
  const [player, given, splat, underline] = await Promise.all([
    Promise.all(pal.fills.map((f, i) => toUrl(drawPlayerTile(f, i + 1, theme, patterns, pal.numerals[i])))),
    Promise.all(pal.fills.map((f, i) => toUrl(drawGivenTile(f, i + 1, theme, patterns, pal.numerals[i])))),
    Promise.all(pal.fills.map((f, i) => toUrl(drawSplat(f, i + 1, patterns, pal.numerals[i])))),
    Promise.all(pal.fills.map((f, i) => toUrl(drawUnderline(f, i + 1)))),
  ]);
  // Free the last set of blob URLs.
  for (const u of previous) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  previous = [...player, ...given, ...splat, ...underline];
  return { player, given, splat, underline };
}

/** Grain noise tile for page and slot backgrounds. */
export async function buildGrain(theme: 'light' | 'dark'): Promise<string> {
  const S = 160;
  const [c, ctx] = canvas(S);
  const rng = rngFrom(`grain/${theme}`);
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = rng.float();
    const a = theme === 'dark' ? (v > 0.5 ? 10 : 6) : v > 0.5 ? 12 : 8;
    const shadeV = v > 0.5 ? 255 : 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = shadeV;
    img.data[i * 4 + 3] = a * Math.abs(v - 0.5) * 2;
  }
  ctx.putImageData(img, 0, 0);
  return toUrl(c);
}

/** Decorative paint splatter for screen corners, in the palette's colors. */
export async function buildSplatter(pal: ResolvedPalette, seed: string, digits: number[], w = 260, h = 260): Promise<string> {
  const [c, ctx] = canvas(w, h);
  const rng = rngFrom(`splatter/${seed}`);
  digits.forEach((d, idx) => {
    const fill = pal.theme === 'dark' ? mix(pal.fills[d - 1], '#ffffff', 0.18) : pal.fills[d - 1];
    const cx = w * (0.35 + rng.float() * 0.3), cy = h * (0.35 + rng.float() * 0.3);
    const R = w * (idx === 0 ? 0.12 : 0.06 + rng.float() * 0.05);
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.9;
    smoothBlob(ctx, cx, cy, Array.from({ length: 14 }, () => R * (0.7 + rng.float() * 0.5)), rng.float() * 6);
    ctx.fill();
    for (let k = 0; k < 9; k++) {
      const a = rng.float() * Math.PI * 2;
      spike(ctx, cx, cy, a, R * 0.7, R * (1.2 + rng.float() * 0.75), 2.2 + rng.float() * 3.5);
    }
    for (let k = 0; k < 30; k++) {
      const a = rng.float() * Math.PI * 2;
      const dist = R * (1.2 + rng.float() * 2.8);
      ctx.globalAlpha = 0.45 + rng.float() * 0.5;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, 0.7 + rng.float() * (dist < R * 2 ? 3.2 : 1.8), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  return toUrl(c);
}

export { rgbToHex };
