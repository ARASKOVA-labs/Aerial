// ── Aerial icon set ──────────────────────────────────────────────────────────
// Original icons on a 20×20 grid: 1.25px round strokes, generous optical
// padding, one silhouette per concept so tools read at a glance.

import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

// ── Tools ────────────────────────────────────────────────────────────────────
export const LockIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4.75" y="9" width="10.5" height="8" rx="2" />
    <path d="M7.25 9V6.75a2.75 2.75 0 0 1 5.5 0V9" />
    <path d="M10 12.25v1.75" />
  </Svg>
);
export const UnlockIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4.75" y="9" width="10.5" height="8" rx="2" />
    <path d="M7.25 9V6.75a2.75 2.75 0 0 1 5.3-1.05" />
    <path d="M10 12.25v1.75" />
  </Svg>
);
export const HandIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7.75 10.25V4.6a1.1 1.1 0 0 1 2.2 0v4.9" />
    <path d="M9.95 9.25V3.85a1.1 1.1 0 0 1 2.2 0v5.4" />
    <path d="M12.15 9.4V5.1a1.1 1.1 0 0 1 2.2 0v6.15a5.6 5.6 0 0 1-5.6 5.6h-.4a4.9 4.9 0 0 1-3.86-1.88L3.6 11.6a1.15 1.15 0 0 1 1.72-1.5l2.43 2.15" />
  </Svg>
);
export const SelectIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5.25 3.75 15 9.4l-4.35 1.05 2.5 4.35-1.7.98-2.5-4.35L5.6 14.75z" />
  </Svg>
);
export const RectangleIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="13" height="11" rx="2.5" />
  </Svg>
);
export const DiamondIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 3.25 16.75 10 10 16.75 3.25 10z" />
  </Svg>
);
export const EllipseIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="6.75" />
  </Svg>
);
export const ArrowIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 15.5 15.5 4.5" />
    <path d="M9 4.5h6.5V11" />
  </Svg>
);
export const LineIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 10h12" />
  </Svg>
);
export const PenIcon = (p: P) => (
  <Svg {...p}>
    <path d="M13.6 3.9a1.9 1.9 0 0 1 2.7 2.7L7.2 15.7l-3.45.75.75-3.45z" />
    <path d="m12.1 5.4 2.7 2.7" />
  </Svg>
);
export const TextIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 16 10 4l5 12" />
    <path d="M6.85 11.75h6.3" />
  </Svg>
);
export const ImageIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.25" width="13" height="11.5" rx="2.25" />
    <circle cx="12.75" cy="8" r="1.25" />
    <path d="m3.75 13.25 3.5-3.5 3.25 3.25 1.75-1.75 3.85 3.85" />
  </Svg>
);
export const EraserIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 16.5h7.5" />
    <path d="m4.4 12.6 7.05-7.05a1.6 1.6 0 0 1 2.26 0l2.24 2.24a1.6 1.6 0 0 1 0 2.26L9.9 16.1a1.4 1.4 0 0 1-.99.4H6.8a1.4 1.4 0 0 1-.99-.4l-1.4-1.4a1.5 1.5 0 0 1 0-2.1z" />
    <path d="m8 9 4.75 4.75" />
  </Svg>
);
export const MoreToolsIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="6.25" cy="6.25" r="2.5" />
    <rect x="11.25" y="3.75" width="5" height="5" rx="1.25" />
    <path d="m6.25 11.25 3 5h-6z" />
    <path d="M13.75 11.5v4.5M11.5 13.75H16" />
  </Svg>
);
export const LaserIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3.75 16.25 7.5-7.5" />
    <circle cx="13.25" cy="6.75" r="2" />
    <path d="M13.25 2.75v.9M17.25 6.75h-.9M16.1 3.9l-.65.65M16.1 9.6l-.65-.65M10.4 3.9l.65.65" />
  </Svg>
);
export const MagicPenIcon = (p: P) => (
  <Svg {...p}>
    <path d="M11.6 5.9a1.6 1.6 0 0 1 2.26 2.26l-7.7 7.7-2.9.64.64-2.9z" />
    <path d="M15.5 2.75v2.5M14.25 4h2.5M4.5 4.5v1.5M3.75 5.25h1.5" />
  </Svg>
);
/** AI agents: a four-point spark. */
export const SparkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 2.75c.55 3.6 1.65 4.7 5.25 5.25-3.6.55-4.7 1.65-5.25 5.25-.55-3.6-1.65-4.7-5.25-5.25 3.6-.55 4.7-1.65 5.25-5.25z" />
    <path d="M15.25 13.5v3.25M13.6 15.1h3.3" />
  </Svg>
);
export const BrushIcon = (p: P) => (
  <Svg {...p}>
    <path d="M16.25 3.75c-2.5.6-6.1 3.7-7.8 6.4l1.4 1.4c2.7-1.7 5.8-5.3 6.4-7.8z" />
    <path d="M8.45 10.15c-1.9 0-3.1 1.2-3.1 2.9 0 1.05-.6 2.1-1.6 2.6 2.9.9 6.2-.2 6.1-4.1" />
  </Svg>
);
export const MarkerIcon = (p: P) => (
  <Svg {...p}>
    <path d="m12.4 3.6 4 4-7.3 7.3-4-4z" />
    <path d="m5.1 10.9-1.35 3.5 1.85 1.85 3.5-1.35" />
    <path d="M3.75 16.25h3.5" />
  </Svg>
);
export const HighlighterIcon = (p: P) => (
  <Svg {...p}>
    <path d="m11.9 3.4 4.7 4.7-6.1 6.1H7.15V10.85z" />
    <path d="m7.15 14.2-2.4 2.4H3.4" />
    <path d="M10.2 16.6h6.4" opacity="0.55" strokeWidth="2.5" />
  </Svg>
);

// ── Chrome ───────────────────────────────────────────────────────────────────
export const MenuIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h12M4 10h12M4 14h12" />
  </Svg>
);
export const UndoIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7.75 5.5 4.5 8.75 7.75 12" />
    <path d="M4.5 8.75h7.25a3.75 3.75 0 0 1 0 7.5H10" />
  </Svg>
);
export const RedoIcon = (p: P) => (
  <Svg {...p}>
    <path d="m12.25 5.5 3.25 3.25L12.25 12" />
    <path d="M15.5 8.75H8.25a3.75 3.75 0 0 0 0 7.5H10" />
  </Svg>
);
export const MinusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 10h10" />
  </Svg>
);
export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 5v10M5 10h10" />
  </Svg>
);
export const HelpIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M8.1 7.9a2 2 0 1 1 2.9 1.8c-.6.3-1 .8-1 1.45v.35" />
    <path d="M10 14h.01" strokeWidth="1.75" />
  </Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h12M8.5 6V4.5h3V6" />
    <path d="M5.5 6l.7 9a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-9" />
    <path d="M8.5 9v4.5M11.5 9v4.5" />
  </Svg>
);
export const DuplicateIcon = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="7" width="9" height="9" rx="2" />
    <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
  </Svg>
);
export const ToFrontIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 15.5V5M6.5 8.5 10 5l3.5 3.5" />
    <path d="M4.5 3.5h11" />
  </Svg>
);
export const ForwardIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 15V6M6.5 9.5 10 6l3.5 3.5" />
  </Svg>
);
export const BackwardIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 5v9M6.5 10.5 10 14l3.5-3.5" />
  </Svg>
);
export const ToBackIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 4.5V15M6.5 11.5 10 15l3.5-3.5" />
    <path d="M4.5 16.5h11" />
  </Svg>
);
export const SunIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="3.25" />
    <path d="M10 2.75v1.5M10 15.75v1.5M2.75 10h1.5M15.75 10h1.5M4.9 4.9l1.05 1.05M14.05 14.05l1.05 1.05M4.9 15.1l1.05-1.05M14.05 5.95l1.05-1.05" />
  </Svg>
);
export const MoonIcon = (p: P) => (
  <Svg {...p}>
    <path d="M15.75 12.1A6.5 6.5 0 0 1 7.9 4.25a6.5 6.5 0 1 0 7.85 7.85z" />
  </Svg>
);
export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m4.75 10.25 3.5 3.5 7-7.5" />
  </Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </Svg>
);
export const EditIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12.6 4.4a1.6 1.6 0 0 1 2.26 2.26L7.5 14l-3 .75.75-3z" />
  </Svg>
);
export const BoardIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.25" y="3.75" width="13.5" height="10.5" rx="2" />
    <path d="M7 17h6M10 14.25V17" />
  </Svg>
);
export const ExportIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 3.75v8.5M6.75 9 10 12.25 13.25 9" />
    <path d="M4.25 13.5v1.25a1.5 1.5 0 0 0 1.5 1.5h8.5a1.5 1.5 0 0 0 1.5-1.5V13.5" />
  </Svg>
);
export const FileIcon = (p: P) => (
  <Svg {...p}>
    <path d="M11.5 3.5H6.25a1.5 1.5 0 0 0-1.5 1.5v10a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V7.25z" />
    <path d="M11.25 3.75v3.75h3.75" />
  </Svg>
);
export const CommandIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 7.5h5v5h-5z" />
    <path d="M7.5 7.5H6A1.75 1.75 0 1 1 7.5 6zM12.5 7.5V6A1.75 1.75 0 1 1 14 7.5zM12.5 12.5H14A1.75 1.75 0 1 1 12.5 14zM7.5 12.5V14A1.75 1.75 0 1 1 6 12.5z" />
  </Svg>
);
export const NoteIcon = (p: P) => (
  <Svg {...p}>
    <path d="M15.75 11.5V5.25a1.5 1.5 0 0 0-1.5-1.5h-8.5a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h6.25z" />
    <path d="M11.5 16.25v-3.25a1.25 1.25 0 0 1 1.25-1.25h3" />
    <path d="M7 7.5h6M7 10.25h3.5" />
  </Svg>
);
export const DiagramIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.25" y="3.25" width="5" height="4" rx="1" />
    <rect x="11.75" y="12.75" width="5" height="4" rx="1" />
    <path d="M5.75 7.25v3.5a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 1 1.5 1.5" />
    <rect x="11.75" y="3.25" width="5" height="4" rx="1" />
    <path d="M8.25 5.25h3.5" />
  </Svg>
);
export const TranslateIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 5h7M7 3.5V5M9 5c-.6 3-2.6 5.4-5 6.5M5.25 7.5c.9 1.6 2.3 2.8 4 3.5" />
    <path d="m10.75 16.5 2.75-6.5 2.75 6.5M11.6 14.5h3.8" />
  </Svg>
);
export const ClipboardIcon = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="4.5" width="10" height="12" rx="1.75" />
    <path d="M7.75 4.5V4a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v.5" />
  </Svg>
);
export const GridIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7.25 3.5v13M12.75 3.5v13M3.5 7.25h13M3.5 12.75h13" />
  </Svg>
);
export const FullscreenIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7.5V4h3.5M16 7.5V4h-3.5M4 12.5V16h3.5M16 12.5V16h-3.5" />
  </Svg>
);
export const ChatIcon = (p: P) => (
  <Svg {...p}>
    <path d="M16.25 10a6.25 6.25 0 0 1-9.2 5.5l-3.3.75.85-3.1A6.25 6.25 0 1 1 16.25 10z" />
  </Svg>
);
export const ChevronDownIcon = (p: P) => (
  <Svg {...p}>
    <path d="m6 8 4 4 4-4" />
  </Svg>
);

// ── Property glyphs ──────────────────────────────────────────────────────────
export const StrokeWidthIcon = ({ width, ...p }: P & { width: number }) => (
  <Svg {...p}>
    <path d="M4 10h12" strokeWidth={Math.min(5, 0.75 + width)} />
  </Svg>
);
export const StrokeSolidIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 10h12" strokeWidth={1.75} />
  </Svg>
);
export const StrokeDashedIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 10h12" strokeWidth={1.75} strokeDasharray="3 2.5" />
  </Svg>
);
export const StrokeDottedIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 10h12" strokeWidth={2} strokeDasharray="0.1 3" />
  </Svg>
);
export const SloppyArchitectIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 14c3-1 4.5-8 6.5-8s3.5 7 6.5 8" />
  </Svg>
);
export const SloppyArtistIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 14c3-1 4.5-8 6.5-8s3.5 7 6.5 8" />
    <path d="M3.8 13.1c3.1-.6 4.4-7.9 6.6-7.6 2.1.3 3.2 6.6 6.2 7.9" opacity="0.7" />
  </Svg>
);
export const SloppyCartoonistIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 14.5c2-1.5 3-3 3.9-5.4.7-1.9 1.4-3.4 2.6-3.6 1.4-.2 2 2.4 2.9 4.3.9 2.1 1.9 3.9 3.6 4.7" />
    <path d="M4 13.2c2.6-.3 3.4-4.4 4.4-6.4.6-1.1 1.4-1.8 2.4-1.2 1.1.7 1.5 3.3 2.4 5.1.6 1.2 1.6 2.4 3.3 3.1" opacity="0.7" />
  </Svg>
);
export const EdgeSharpIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 15V5h10" />
  </Svg>
);
export const EdgeRoundIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 15V9a4 4 0 0 1 4-4h6" />
  </Svg>
);
export const FillHachureIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.75" y="3.75" width="12.5" height="12.5" rx="2" />
    <path d="M4.5 10.5 10.5 4.5M4.5 15.25 15.25 4.5M9.5 15.75l6.25-6.25" strokeWidth="1" />
  </Svg>
);
export const FillCrossIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.75" y="3.75" width="12.5" height="12.5" rx="2" />
    <path d="M4.5 10.5 10.5 4.5M4.5 15.25 15.25 4.5M9.5 15.75l6.25-6.25M9.5 4.25l6.25 6.25M4.75 4.75 15.25 15.25M4.25 9.5l6.25 6.25" strokeWidth="1" />
  </Svg>
);
export const FillSolidIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.75" y="3.75" width="12.5" height="12.5" rx="2" fill="currentColor" />
  </Svg>
);
export const EraseWholeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 13.5c2-4.5 4-6 5.5-6s2.5 2 4 2 2-1 2.5-2" strokeDasharray="1.6 1.6" />
    <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" opacity="0.35" />
  </Svg>
);
export const ErasePartialIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 13.5c1.4-3 2.6-4.6 3.8-5.5" />
    <path d="M12.6 9.2c.5.2 1 .3 1.6.3 1 0 1.6-.7 2.3-1.5" />
    <circle cx="10" cy="9" r="2.4" />
  </Svg>
);
