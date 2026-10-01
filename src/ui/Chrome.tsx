// ── Editor chrome: main menu, zoom/history bar, help, welcome screen ────────

import type { ReactNode } from 'react';
import { HelpIcon, MenuIcon, MinusIcon, PlusIcon, RedoIcon, UndoIcon } from './icons';
import { MOD, Popover } from './primitives';

export function MainMenu({ children }: { children: ReactNode | ((close: () => void) => ReactNode) }) {
  return (
    <Popover
      trigger={({ open, toggle }) => (
        <button type="button" className="ae-btn ae-btn--plain ae-tip" aria-pressed={open} aria-haspopup="menu" aria-label="Main menu" data-tip="Menu" onClick={toggle}>
          <MenuIcon />
        </button>
      )}
    >
      {(close) => (
        <div className="ae-menu" role="menu">
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </Popover>
  );
}

export function ZoomBar({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <div className="ae-row">
      <div className="ae-island" style={{ padding: 2 }}>
        <button type="button" className="ae-btn ae-tip ae-tip--up" data-tip={`Zoom out — ${MOD}−`} aria-label="Zoom out" onClick={onZoomOut}>
          <MinusIcon />
        </button>
        <button type="button" className="ae-zoom-label ae-tip ae-tip--up" data-tip={`Reset zoom — ${MOD}0`} onClick={onReset}>
          {zoom}%
        </button>
        <button type="button" className="ae-btn ae-tip ae-tip--up" data-tip={`Zoom in — ${MOD}+`} aria-label="Zoom in" onClick={onZoomIn}>
          <PlusIcon />
        </button>
      </div>
      <div className="ae-island" style={{ padding: 2 }}>
        <button type="button" className="ae-btn ae-tip ae-tip--up" data-tip={`Undo — ${MOD}Z`} aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
          <UndoIcon />
        </button>
        <button type="button" className="ae-btn ae-tip ae-tip--up" data-tip={`Redo — ${MOD}⇧Z`} aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
          <RedoIcon />
        </button>
      </div>
    </div>
  );
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ae-btn ae-btn--plain ae-tip ae-tip--up" data-tip="Help & shortcuts — ?" aria-label="Help" onClick={onClick} style={{ marginLeft: 'auto' }}>
      <HelpIcon />
    </button>
  );
}

/** Hand-drawn hint arrow (sketched cubic + open head). */
function HintArrow({ d, head, w = 90, h = 70 }: { d: string; head: string; w?: number; h?: number }) {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
      <path d={head} />
    </svg>
  );
}

export function WelcomeScreen({ logo, items, hasHelp }: { logo: ReactNode; items?: ReactNode; hasHelp?: boolean }) {
  return (
    <div className="ae-welcome" aria-hidden={!items}>
      <div className="ae-welcome__hint" style={{ top: 62, left: 28, flexDirection: 'column' }}>
        <HintArrow w={60} h={56} d="M30 52 C 22 40, 14 26, 14 8" head="M8 15 L14 7 L21 14" />
        <span style={{ maxWidth: 200 }}>Boards, export, preferences…</span>
      </div>
      <div className="ae-welcome__hint" style={{ top: 66, left: '50%', transform: 'translateX(-25%)', alignItems: 'flex-start' }}>
        <HintArrow w={56} h={60} d="M50 56 C 40 48, 26 34, 22 10" head="M15 16 L22 8 L28 17" />
        <span style={{ marginTop: 40 }}>Pick a tool &amp; start drawing!</span>
      </div>
      {hasHelp && (
        <div className="ae-welcome__hint" style={{ bottom: 66, right: 26, flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ maxWidth: 170, textAlign: 'right' }}>Shortcuts &amp; help</span>
          <HintArrow w={60} h={50} d="M14 6 C 30 14, 42 26, 46 44" head="M38 40 L46 46 L50 36" />
        </div>
      )}
      <div className="ae-welcome__center">
        <div className="ae-welcome__logo">{logo}</div>
        <div className="ae-welcome__tag">Your ideas, at the speed of thought.<br />Everything stays on your device.</div>
        {items && <div className="ae-welcome__items">{items}</div>}
      </div>
    </div>
  );
}
