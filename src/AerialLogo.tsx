// ── Aerial brand ─────────────────────────────────────────────────────────────
// The mark: an "A" drawn in one pen stroke, its crossbar a contrail ending in
// the Araskova spark. Sources of truth live in brand/*.svg; these components
// draw the same geometry inline so it themes and scales crisply.

import { useId } from 'react';

export interface AerialMarkProps {
  size?: number;
  className?: string;
  /** Draw the dark plate behind the mark (app-icon style). Default true. */
  plate?: boolean;
  /** Ink colour of the A when there is no plate. Defaults to currentColor. */
  ink?: string;
  /** Kept for API compatibility; the plated mark looks the same in both themes. */
  isDarkMode?: boolean;
}

/** The Aerial mark (64-unit grid, same geometry as brand/aerial-favicon.svg). */
export function AerialMark({ size = 32, className, plate = true, ink }: AerialMarkProps) {
  const id = useId().replace(/:/g, '');
  const trail = `aerial-trail-${id}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Aerial">
      <defs>
        <linearGradient id={trail} x1="10" y1="0" x2="52" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e73f07" stopOpacity="0" />
          <stop offset="0.4" stopColor="#e73f07" />
          <stop offset="1" stopColor="#ff8a3d" />
        </linearGradient>
      </defs>
      {plate && <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" fill="#111113" stroke="#eee9df" strokeOpacity="0.12" />}
      <path
        d="M16 51 L29.4 18 Q32 12.5 34.6 18 L48 51"
        fill="none"
        stroke={plate ? '#eee9df' : (ink ?? 'currentColor')}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 43.5 C20 42.5 34 38.5 51 31 A3 3 0 0 1 52.5 36.6 C36 42 21 44.5 8 43.5 Z" fill={`url(#${trail})`} />
      <circle cx="52" cy="33.6" r="4.6" fill="#ff8a3d" />
      <circle cx="52" cy="33.6" r="2" fill="#fff6ea" />
    </svg>
  );
}

/** Mark + "AERIAL" wordmark in Rephen (the Araskova wordmark face). */
export function AerialWordmark({ markSize = 46, fontSize = 42, className }: { markSize?: number; fontSize?: number; className?: string }) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(markSize * 0.3) }}>
      <AerialMark size={markSize} />
      <span style={{ fontFamily: 'Rephen, var(--ae-font)', fontSize, fontWeight: 900, letterSpacing: '0.14em', color: 'var(--ae-text)', lineHeight: 1 }}>
        AERIAL
      </span>
    </span>
  );
}
