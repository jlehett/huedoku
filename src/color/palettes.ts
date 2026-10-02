/**
 * The nine digit colors. Fill values come from scripts/design-palettes.ts
 * (hand-picked targets nudged until every pair has CIEDE2000 >= 20; see
 * docs/palette-report.md). Numeral and ink colors are derived so they always
 * reach WCAG 4.5:1.
 */
import { contrastRatio, hexToOklch, numeralFor, oklchToHex } from './colorScience';

export type PaletteId = 'spectrum' | 'cvd' | 'pastel' | 'contrast';
export type ThemeName = 'light' | 'dark';

export interface PaletteDef {
  id: PaletteId;
  name: string;
  blurb: string;
  /** Plain color names used in hints ("blue 6"). */
  names: readonly string[];
  fills: Record<ThemeName, readonly string[]>;
}

export const PALETTES: readonly PaletteDef[] = [
  {
    id: 'spectrum',
    name: 'Spectrum',
    blurb: 'The house paints: red through magenta.',
    names: ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'violet', 'magenta'],
    fills: {
      // Deep paints with light pastel numerals (dark theme), light washes with deep numerals (light theme).
      dark: ['#922a2d', '#b0560d', '#8b7302', '#428022', '#086557', '#1360a0', '#252376', '#7942ec', '#962374'],
      light: ['#fc7771', '#f69f56', '#f1cf44', '#9bd36f', '#49c5b1', '#70b2f1', '#8377d4', '#dabafe', '#f066b7'],
    },
  },
  {
    id: 'cvd',
    name: 'Clear Sight',
    blurb: 'Tuned to stay apart with red-green or blue-yellow color blindness.',
    names: ['vermilion', 'amber', 'lemon', 'olive', 'jade', 'sky', 'ocean', 'iris', 'rose'],
    fills: {
      dark: ['#d45e00', '#e9a10a', '#f4e945', '#98a165', '#0d9172', '#56b4e9', '#1f6a9c', '#9a65e1', '#c0829e'],
      light: ['#cf5e03', '#eba82b', '#f8f044', '#939f60', '#03947a', '#56b4e9', '#296c9d', '#9464e3', '#d676a6'],
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    blurb: 'Soft chalk colors.',
    names: ['rose', 'peach', 'butter', 'mint', 'seafoam', 'sky', 'periwinkle', 'lilac', 'pink'],
    fills: {
      dark: ['#ec959a', '#ffbb88', '#fbe470', '#a7f692', '#8bd7cb', '#99d0ff', '#9391c6', '#e7defe', '#ff92f6'],
      light: ['#f29ca1', '#fdb379', '#fbe168', '#9be57d', '#7fd1c4', '#91c4f7', '#8984bf', '#eac3ff', '#ec61c8'],
    },
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    blurb: 'Saturated colors with strong light/dark steps.',
    names: ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'],
    fills: {
      dark: ['#ff3b3b', '#ff9a1f', '#ffe14d', '#42d13c', '#09ceba', '#1e8dfd', '#3246ed', '#af7afe', '#ff339e'],
      light: ['#c70314', '#e86b01', '#f5c400', '#1f9e2b', '#018d84', '#1b6be2', '#122295', '#a612fc', '#d30274'],
    },
  },
];

export const PALETTE_BY_ID: Record<PaletteId, PaletteDef> = Object.fromEntries(PALETTES.map((p) => [p.id, p])) as Record<PaletteId, PaletteDef>;

/** Empty-cell slot colors, the background inks must read against. */
export const SLOT_COLOR: Record<ThemeName, string> = { dark: '#1c2733', light: '#e8e1d5' };

export interface ResolvedPalette {
  id: PaletteId;
  theme: ThemeName;
  names: readonly string[];
  fills: string[];
  /** Numeral color on each fill (>= 4.5:1). */
  numerals: string[];
  numeralIsLight: boolean[];
  /** Digit color for text on the empty slot: notes, pad counts (>= 4.5:1). */
  inks: string[];
}

/** Text color in the digit's hue that reaches 4.5:1 on `bg`. */
export function inkFor(fill: string, bg: string, theme: ThemeName): string {
  const [, C, h] = hexToOklch(fill);
  const chroma = Math.min(Math.max(C, 0.06), 0.15);
  if (theme === 'dark') {
    for (let L = 0.78; L <= 0.99; L += 0.01) {
      const c = oklchToHex(L, chroma, h) ?? oklchToHex(L, chroma * 0.6, h);
      if (c && contrastRatio(c, bg) >= 4.6) return c;
    }
    return '#ffffff';
  }
  for (let L = 0.5; L >= 0.2; L -= 0.01) {
    const c = oklchToHex(L, chroma, h) ?? oklchToHex(L, chroma * 0.6, h);
    if (c && contrastRatio(c, bg) >= 4.6) return c;
  }
  return '#000000';
}

const cache = new Map<string, ResolvedPalette>();
export function resolvePalette(id: PaletteId, theme: ThemeName): ResolvedPalette {
  const key = `${id}/${theme}`;
  let r = cache.get(key);
  if (!r) {
    const def = PALETTE_BY_ID[id] ?? PALETTES[0];
    const fills = def.fills[theme].slice();
    const nums = fills.map((f) => numeralFor(f));
    r = {
      id: def.id,
      theme,
      names: def.names,
      fills,
      numerals: nums.map((n) => n.color),
      numeralIsLight: nums.map((n) => n.light),
      inks: fills.map((f) => inkFor(f, SLOT_COLOR[theme], theme)),
    };
    cache.set(key, r);
  }
  return r;
}
