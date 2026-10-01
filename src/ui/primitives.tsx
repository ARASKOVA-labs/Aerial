// ── Small UI primitives shared by the editor chrome ─────────────────────────

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** Closes something when the user clicks / taps outside `ref` or presses Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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
  }, [ref, open, onClose]);
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
  placement?: 'below' | 'right' | 'above-right';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setInnerOpen(v);
    onOpenChange?.(v);
  };
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const style =
    placement === 'right'
      ? { left: 'calc(100% + 10px)', top: 0 }
      : placement === 'above-right'
        ? { right: 0, bottom: 'calc(100% + 8px)', transformOrigin: 'bottom right' }
        : { left: 0, top: 'calc(100% + 8px)' };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div className="ae-pop" style={style}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
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
