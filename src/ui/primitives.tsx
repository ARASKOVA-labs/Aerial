// ── Small UI primitives shared by the editor chrome ─────────────────────────

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Closes something when the user clicks / taps outside `refs` or presses Escape. */
export function useDismiss(refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[], open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const list = Array.isArray(refs) ? refs : [refs];
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.some((r) => r.current?.contains(t))) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [refs, open, onClose]);
}

type Placement = 'below' | 'right' | 'above-right';

/** Viewport margin a popover keeps from the window edges. */
const EDGE = 8;
const GAP = 8;

/**
 * Fixed-position coordinates for a popover next to `anchor`, flipped and
 * clamped so it never leaves the window (the toolbar can sit at any width,
 * and its scroll container would otherwise clip the menu).
 */
function place(anchor: DOMRect, pop: { width: number; height: number }, placement: Placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left: number;
  let top: number;
  let origin: string;
  if (placement === 'right') {
    left = anchor.right + GAP;
    if (left + pop.width > vw - EDGE) left = anchor.left - GAP - pop.width;
    top = anchor.top;
    origin = 'top left';
  } else if (placement === 'above-right') {
    left = anchor.right - pop.width;
    top = anchor.top - GAP - pop.height;
    if (top < EDGE) top = anchor.bottom + GAP;
    origin = 'bottom right';
  } else {
    left = anchor.left;
    // Not enough room to the right: align the popover's right edge with the trigger.
    if (left + pop.width > vw - EDGE) left = anchor.right - pop.width;
    top = anchor.bottom + GAP;
    origin = left < anchor.left ? 'top right' : 'top left';
  }
  left = Math.max(EDGE, Math.min(left, vw - EDGE - pop.width));
  top = Math.max(EDGE, Math.min(top, vh - EDGE - pop.height));
  return { left, top, origin, maxHeight: vh - top - EDGE };
}

/** A button that toggles a popover anchored below (or beside) it. */
export function Popover({
  trigger,
  children,
  placement = 'below',
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      if (controlledOpen === undefined) setInnerOpen(v);
      onOpenChange?.(v);
    },
    [controlledOpen, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [anchorRef, popRef], []);
  useDismiss(refs, open, close);

  const [pos, setPos] = useState<ReturnType<typeof place> | null>(null);
  const reposition = useCallback(() => {
    const a = anchorRef.current?.getBoundingClientRect();
    const p = popRef.current;
    if (!a || !p) return;
    setPos(place(a, { width: p.offsetWidth, height: p.offsetHeight }, placement));
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    reposition();
    const ro = new ResizeObserver(reposition);
    if (popRef.current) ro.observe(popRef.current);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  // Portal into the editor root so theme tokens still apply but no transformed
  // or scrolling ancestor can clip or offset the fixed-position popover.
  const host = anchorRef.current?.closest<HTMLElement>('.ae-root') ?? (typeof document !== 'undefined' ? document.body : null);
  const style: CSSProperties = pos
    ? { position: 'fixed', left: pos.left, top: pos.top, transformOrigin: pos.origin, ['--ae-pop-max-h' as string]: `${pos.maxHeight}px` }
    : { position: 'fixed', left: 0, top: 0, visibility: 'hidden' };
  return (
    <div ref={anchorRef} style={{ position: 'relative' }}>
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open &&
        host &&
        createPortal(
          <div ref={popRef} className="ae-pop" style={style}>
            {typeof children === 'function' ? children(close) : children}
          </div>,
          host,
        )}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  hint,
  onSelect,
  danger,
  current,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: string;
  onSelect?: () => void;
  danger?: boolean;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ae-menu-item${danger ? ' ae-menu-item--danger' : ''}`}
      aria-current={current || undefined}
      onClick={onSelect}
    >
      {icon}
      <span className="ae-menu-item__label">{label}</span>
      {hint && <span className="ae-menu-item__hint">{hint}</span>}
    </button>
  );
}

export const MenuSeparator = () => <div className="ae-menu-sep" role="separator" />;

export function MenuTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="ae-menu-title">
      <span>{children}</span>
      {action}
    </div>
  );
}

/** Platform-aware modifier label for shortcut hints. */
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
