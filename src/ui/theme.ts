/**
 * Applies theme, palette and textures to the document as CSS custom
 * properties, and keeps them in sync with the system color scheme.
 */
import { resolvePalette, type PaletteId, type ResolvedPalette, type ThemeName } from '../color/palettes';
import { buildGrain, buildSplatter, buildTextures, type Textures } from './paint';
import { mix } from '../color/colorScience';

export interface AppliedTheme {
  theme: ThemeName;
  palette: ResolvedPalette;
  textures: Textures | null;
  splatters: string[];
}

let current: AppliedTheme | null = null;
let token = 0;
const listeners = new Set<(t: AppliedTheme) => void>();

export const currentTheme = () => current;
export const onTheme = (fn: (t: AppliedTheme) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function systemTheme(): ThemeName {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(pref: 'system' | ThemeName): ThemeName {
  return pref === 'system' ? systemTheme() : pref;
}

export async function applyTheme(pref: 'system' | ThemeName, paletteId: PaletteId, patterns: boolean): Promise<AppliedTheme> {
  const my = ++token;
  const theme = resolveTheme(pref);
  const pal = resolvePalette(paletteId, theme);
  const root = document.documentElement;
  root.dataset.theme = theme;
  try {
    localStorage.setItem('huedoku:theme-hint', theme);
  } catch {
    /* storage unavailable */
  }
  root.style.colorScheme = theme;
  pal.fills.forEach((f, i) => {
    root.style.setProperty(`--fill-${i + 1}`, f);
    root.style.setProperty(`--num-${i + 1}`, pal.numerals[i]);
    root.style.setProperty(`--ink-${i + 1}`, pal.inks[i]);
    root.style.setProperty(`--glow-${i + 1}`, mix(f, '#ffffff', 0.55));
  });
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement | null;
  if (meta) meta.content = theme === 'dark' ? '#0e1620' : '#f3ede2';
  const [textures, grain, s1, s2, s3, s4] = await Promise.all([
    buildTextures(pal, patterns),
    buildGrain(theme),
    buildSplatter(pal, 'tr', [9, 1, 2]),
    buildSplatter(pal, 'bl', [5, 4]),
    buildSplatter(pal, 'br', [7, 6]),
    buildSplatter(pal, 'tl', [5, 3]),
  ]);
  if (my !== token) return current!;
  textures.player.forEach((u, i) => root.style.setProperty(`--tile-p${i + 1}`, `url("${u}")`));
  textures.given.forEach((u, i) => root.style.setProperty(`--tile-g${i + 1}`, `url("${u}")`));
  textures.splat.forEach((u, i) => root.style.setProperty(`--splat-${i + 1}`, `url("${u}")`));
  textures.underline.forEach((u, i) => root.style.setProperty(`--under-${i + 1}`, `url("${u}")`));
  root.style.setProperty('--grain', `url("${grain}")`);
  root.style.setProperty('--splatter-tr', `url("${s1}")`);
  root.style.setProperty('--splatter-bl', `url("${s2}")`);
  root.style.setProperty('--splatter-br', `url("${s3}")`);
  root.style.setProperty('--splatter-tl', `url("${s4}")`);
  current = { theme, palette: pal, textures, splatters: [s1, s2, s3, s4] };
  listeners.forEach((l) => l(current!));
  return current;
}
