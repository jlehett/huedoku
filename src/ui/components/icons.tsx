/** Hand-drawn style line icons: 24px grid, 2px rounded strokes. */
import type { JSX } from 'preact';

type P = { size?: number; class?: string };

function Svg({ size = 24, class: cls, children }: P & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg class={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M9 6v12M15 6v12" stroke-width="3" />
  </Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.2" />
  </Svg>
);
export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 7.5L4.5 11l4 3.5" />
    <path d="M5 11h9.5a5 5 0 010 10H11" />
  </Svg>
);
export const IconRedo = (p: P) => (
  <Svg {...p}>
    <path d="M15.5 7.5l4 3.5-4 3.5" />
    <path d="M19 11H9.5a5 5 0 000 10H13" />
  </Svg>
);
export const IconErase = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 4.8l4.7 4.7a1.6 1.6 0 010 2.3L11 20H6.6l-2-2a1.6 1.6 0 010-2.3L12.2 4.8a1.6 1.6 0 012.3 0z" />
    <path d="M9 10.5l5.5 5.5M11 20h9" />
  </Svg>
);
export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="M4 20l1.2-4.6L16.4 4.2a2 2 0 012.9 0l.5.5a2 2 0 010 2.9L8.6 18.8z" />
    <path d="M14.5 6l3.5 3.5" />
  </Svg>
);
export const IconBulb = (p: P) => (
  <Svg {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 00-3.7 10.7c.6.5 1 1.3 1 2.1V16h5.4v-.2c0-.8.4-1.6 1-2.1A6 6 0 0012 3z" />
  </Svg>
);
export const IconGear = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Svg>
);
export const IconStats = (p: P) => (
  <Svg {...p}>
    <path d="M5 20V11M12 20V5M19 20v-6" stroke-width="2.6" />
  </Svg>
);
export const IconHelp = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 014.8 1c0 1.7-2.3 2-2.3 3.5M12 17h.01" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconShare = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V3.5M8 7.5l4-4 4 4" />
    <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconChevronLeft = IconBack;
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const IconSpool = (p: P) => (
  <Svg {...p}>
    <path d="M6 4h12M6 20h12" />
    <path d="M8 4v16M16 4v16" />
    <path d="M8 8l8 3M8 12l8 3M8 16l8 2" stroke-width="1.6" />
  </Svg>
);
export const IconGrid = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" stroke-width="1.5" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14" />
  </Svg>
);
export const IconRestart = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 102.2-5.3" />
    <path d="M4 4.5v4h4" />
  </Svg>
);
export const IconWand = (p: P) => (
  <Svg {...p}>
    <path d="M5 19L15.5 8.5M14 5l1-2 1 2 2 1-2 1-1 2-1-2-2-1zM18.5 11.5l.6-1.2.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6z" />
  </Svg>
);
export const IconBrush = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 4.5l5 5-7.5 7.5-5-5z" />
    <path d="M7 12c-2.5 0-3.5 2-3.5 4 0 1.7-.8 2.8-1.5 3.5 3 .5 7.5-.3 8-4" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Svg>
);
