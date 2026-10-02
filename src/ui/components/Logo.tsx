/**
 * The Huedoku wordmark: brush lettering with a dry-brush texture filter and a
 * rainbow brush stroke underneath, drawn in the current palette's colors.
 */
import { useRef } from 'preact/hooks';
import { useApp } from '../app/useApp';

let uid = 0;

export function Logo({ height = 64, compact = false }: { height?: number; compact?: boolean }) {
  useApp((s) => s.meta.settings.palette);
  const id = useRef(`logo${++uid}`).current;
  const w = height * 3.5;
  return (
    <svg class="logo" width={w} height={height} viewBox="0 0 350 100" role="img" aria-label="Huedoku">
      <defs>
        <filter id={`${id}-dry`} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.35 0.03" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 4.9" result="streaks" />
          <feComposite in="SourceGraphic" in2="streaks" operator="in" result="dry" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="warp" />
          <feDisplacementMap in="dry" in2="warp" scale="3" />
        </filter>
        <linearGradient id={`${id}-rainbow`} x1="0" x2="1" y1="0" y2="0">
          {[5, 4, 3, 2, 1, 9].map((d, k) => (
            <stop offset={`${(k / 5) * 100}%`} stop-color={`var(--fill-${d})`} />
          ))}
        </linearGradient>
        <filter id={`${id}-stroke`} x="-5%" y="-40%" width="110%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.7" numOctaves="2" seed="11" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 2.3" result="s" />
          <feComposite in="SourceGraphic" in2="s" operator="in" />
        </filter>
      </defs>
      {!compact && (
        <path
          d="M48 84 C 110 76, 200 74, 300 70 C 305 72, 304 80, 298 80 C 200 84, 120 88, 52 92 C 44 92, 42 86, 48 84 Z"
          fill={`url(#${id}-rainbow)`}
          filter={`url(#${id}-stroke)`}
          opacity="0.95"
        />
      )}
      <text
        x="175"
        y="72"
        text-anchor="middle"
        font-family="'Caveat Brush', cursive"
        font-size="86"
        fill="var(--text)"
        filter={`url(#${id}-dry)`}
        transform="rotate(-3 175 60)"
      >
        Huedoku
      </text>
    </svg>
  );
}
