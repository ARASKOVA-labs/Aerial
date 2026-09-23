// ── Aerial Canvas Library — Toolbar Subcomponents ───────────────────────────
// Modular toolbar, zoom bar, settings popover, and icon animation components.
// Fully controllable via props — usable both internally by <AerialCanvas />
// and externally by host apps that want custom toolbar placement.

import { useState, useCallback, useEffect } from 'react';
import { useAnimate } from 'motion/react';
import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Pen,
  Type,
  Eraser,
  Highlighter,
  Zap,
  Wand2,
  ZoomIn,
  ZoomOut,
  Undo,
  Redo,
  MoreHorizontal,
} from 'lucide-react';
import type {
  AerialToolbarProps,
  AerialZoomBarProps,
  AerialSettingsPopoverProps,
} from '../lib/types';

// ── Constants ───────────────────────────────────────────────────────────────

export const STROKE_COLORS = ['#000000', '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9'];

// ── Animated Icon ───────────────────────────────────────────────────────────

export function AnimatedToolIcon({
  icon: Icon,
  title,
  className,
  isHovered,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  className?: string;
  isHovered?: boolean;
}) {
  const [scope, animate] = useAnimate();

  const handleHover = useCallback(async () => {
    if (!scope.current) return;
    const t = title.toLowerCase();

    if ((scope.current as unknown as { startAnimation?: () => void }).startAnimation) {
      (scope.current as unknown as { startAnimation: () => void }).startAnimation();
      return;
    }

    if (t.includes('pen') || t.includes('draw')) {
      await animate(scope.current, { rotate: [0, -20, 10, -10, 0], x: [0, -2, 2, -1, 0] }, { duration: 0.5 });
    } else if (t.includes('select')) {
      await animate(scope.current, { scale: [1, 0.7, 1.2, 1], y: [0, -3, 0] }, { duration: 0.4 });
    } else if (t.includes('hand') || t.includes('pan')) {
      await animate(scope.current, { x: [0, -4, 4, -2, 2, 0], y: [0, 2, 0] }, { duration: 0.5 });
    } else if (t.includes('eraser')) {
      await animate(scope.current, { rotate: [0, 30, -30, 0], x: [0, 4, -4, 0] }, { duration: 0.4 });
    } else if (t.includes('rectangle') || t.includes('square')) {
      await animate(scope.current, { scale: [1, 1.1, 0.9, 1], rotate: [0, 5, -5, 0] }, { duration: 0.4 });
    } else if (t.includes('circle') || t.includes('ellipse')) {
      await animate(scope.current, { scale: [1, 1.1, 0.9, 1], rotate: [0, 180, 360] }, { duration: 0.6 });
    } else if (t.includes('arrow') || t.includes('line')) {
      await animate(scope.current, { x: [0, 5, 0], y: [0, -5, 0] }, { duration: 0.4 });
    } else if (t.includes('text') || t.includes('type')) {
      await animate(scope.current, { y: [0, -4, 0], scale: [1, 1.1, 1] }, { duration: 0.4 });
    } else if (t.includes('image')) {
      await animate(scope.current, { scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }, { duration: 0.4 });
    } else if (t.includes('trash') || t.includes('clear')) {
      await animate(scope.current, { rotate: [0, -10, 10, -10, 0], y: [0, -2, 0] }, { duration: 0.4 });
    } else if (t.includes('zoom')) {
      await animate(scope.current, { scale: [1, 1.3, 1] }, { duration: 0.4 });
    } else if (t.includes('undo')) {
      await animate(scope.current, { rotate: [0, -45, 0], x: [0, -3, 0] }, { duration: 0.4 });
    } else if (t.includes('redo')) {
      await animate(scope.current, { rotate: [0, 45, 0], x: [0, 3, 0] }, { duration: 0.4 });
    } else {
      await animate(scope.current, { scale: [1, 1.2, 0.9, 1] }, { duration: 0.4 });
    }
  }, [animate, scope, title]);

  const handleLeave = useCallback(async () => {
    if ((scope.current as unknown as { stopAnimation?: () => void })?.stopAnimation) {
      (scope.current as unknown as { stopAnimation: () => void }).stopAnimation();
    } else if (scope.current) {
      await animate(scope.current, { rotate: 0, x: 0, y: 0, scale: 1 }, { duration: 0.2 });
    }
  }, [animate, scope]);

  useEffect(() => {
    if (isHovered) handleHover();
    else handleLeave();
  }, [isHovered, handleHover, handleLeave]);

  return (
    <span ref={scope} className={`inline-flex items-center justify-center ${className || ''}`}>
      <Icon className="w-full h-full" />
    </span>
  );
}

// ── Tool Button ─────────────────────────────────────────────────────────────

export function ToolBtn({
  icon,
  title,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${
        active
          ? 'bg-[#e73f07] text-white shadow-md shadow-[#e73f07]/30 font-bold'
          : 'text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:bg-[var(--accent)] border border-transparent'
      }`}
    >
      <AnimatedToolIcon icon={icon} title={title} isHovered={isHovered} className="w-4 h-4" />
    </button>
  );
}

// ── Dropdown Tool Button ────────────────────────────────────────────────────

export interface DropdownToolBtnProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  label?: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
  variant?: 'default' | 'danger' | 'accent';
}

export function DropdownToolBtn({
  icon,
  title,
  label,
  shortcut,
  onClick,
  active,
  className,
  variant = 'default',
}: DropdownToolBtnProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Extract shortcut if title is formatted like "Calligraphy Pen (F)"
  let displayLabel = label || title;
  let displayShortcut = shortcut;

  if (!shortcut && title.includes('(') && title.endsWith(')')) {
    const match = title.match(/^(.*?)\s*\(([^)]+)\)$/);
    if (match) {
      displayLabel = match[1];
      displayShortcut = match[2];
    }
  }

  const isDanger = variant === 'danger' || className?.includes('text-[#dc2626]');
  const isAccent = variant === 'accent' || className?.includes('text-[#e73f07]');

  return (
    <button
      type="button"
      className={`group w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer active:scale-[0.98] ${
        active
          ? 'bg-[#e73f07]/15 border border-[#e73f07]/40 shadow-sm'
          : isDanger
          ? 'hover:bg-red-500/10 hover:border-red-500/30 border border-transparent'
          : 'hover:bg-[var(--accent)] hover:border-[var(--border)]/60 border border-transparent'
      } ${className || ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${
          active
            ? 'bg-[#e73f07] text-white shadow-sm shadow-[#e73f07]/40 scale-105'
            : isDanger
            ? 'bg-red-500/15 text-red-500 group-hover:bg-red-500/25 group-hover:scale-105'
            : isAccent
            ? 'bg-[#e73f07]/15 text-[#e73f07] group-hover:bg-[#e73f07]/25 group-hover:scale-105'
            : 'bg-[var(--secondary)] text-[var(--foreground)]/80 group-hover:text-[var(--foreground)] group-hover:bg-[var(--secondary)] group-hover:scale-105 border border-[var(--border)]/40'
        }`}
      >
        <AnimatedToolIcon icon={icon} title={displayLabel} isHovered={isHovered} className="w-3.5 h-3.5" />
      </div>

      <span
        className={`font-sans font-medium text-xs tracking-tight truncate ${
          active
            ? 'text-[#e73f07] font-semibold'
            : isDanger
            ? 'text-red-500 font-medium'
            : 'text-[var(--foreground)]'
        }`}
      >
        {displayLabel}
      </span>

      {displayShortcut && (
        <kbd
          className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider transition-colors shrink-0 ${
            active
              ? 'bg-[#e73f07]/20 text-[#e73f07] border border-[#e73f07]/30 font-bold'
              : 'bg-[var(--secondary)] text-[var(--muted-foreground)] border border-[var(--border)]/60 group-hover:text-[var(--foreground)] font-semibold'
          }`}
        >
          {displayShortcut}
        </kbd>
      )}
    </button>
  );
}

// ── Main Toolbar ────────────────────────────────────────────────────────────

export function AerialToolbar({
  activeTool,
  onSelectTool,
  isHidden = false,
  onMoreAction,
}: AerialToolbarProps) {
  const [showMoreTools, setShowMoreTools] = useState(false);

  return (
    <div
      className={`pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] shadow-xl rounded-2xl px-2.5 py-2 w-max max-w-[calc(100vw-2rem)] transition-[opacity,transform] duration-300 ease-in-out ${
        isHidden ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}
    >
      <ToolBtn icon={MousePointer2} title="Select (V / 1)" active={activeTool === 'select'} onClick={() => onSelectTool('select')} />
      <ToolBtn icon={Hand} title="Pan (H / 2)" active={activeTool === 'hand'} onClick={() => onSelectTool('hand')} />
      <div className="w-px h-5 bg-[var(--border)] mx-1 hidden sm:block" />
      <div className="hidden sm:flex items-center gap-1">
        <ToolBtn icon={Square} title="Rectangle (R / 3)" active={activeTool === 'rectangle'} onClick={() => onSelectTool('rectangle')} />
        <ToolBtn icon={Circle} title="Ellipse (O / 4)" active={activeTool === 'ellipse'} onClick={() => onSelectTool('ellipse')} />
        <ToolBtn icon={Minus} title="Line (L / 5)" active={activeTool === 'line'} onClick={() => onSelectTool('line')} />
        <ToolBtn icon={ArrowUpRight} title="Arrow (A / 6)" active={activeTool === 'arrow'} onClick={() => onSelectTool('arrow')} />
      </div>
      <div className="w-px h-5 bg-[var(--border)] mx-1 hidden sm:block" />
      <ToolBtn icon={Pen} title="Draw (P / 7)" active={activeTool === 'freedraw'} onClick={() => onSelectTool('freedraw')} />
      <ToolBtn icon={Type} title="Text (T / 8)" active={activeTool === 'text'} onClick={() => onSelectTool('text')} />
      <ToolBtn icon={Eraser} title="Eraser (E / 9)" active={activeTool === 'eraser'} onClick={() => onSelectTool('eraser')} />
      <div className="w-px h-5 bg-[var(--border)] mx-1" />
      <div className="relative">
        <ToolBtn
          icon={MoreHorizontal}
          title="More Tools"
          active={showMoreTools || ['fountain', 'magic_pen', 'highlighter', 'laser_pen'].includes(activeTool)}
          onClick={() => setShowMoreTools(!showMoreTools)}
        />
        {showMoreTools && (
          <div className="absolute top-full mt-2 right-0 bg-[var(--card)]/95 backdrop-blur-2xl border border-[var(--border)] shadow-2xl rounded-2xl p-2 w-64 max-w-[calc(100vw-2rem)] flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-1.5 px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e73f07]" />
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold">Special Pens</p>
            </div>
            <DropdownToolBtn icon={Pen} title="Calligraphy Pen (F)" active={activeTool === 'fountain'} onClick={() => { onSelectTool('fountain'); setShowMoreTools(false); }} />
            <DropdownToolBtn icon={Highlighter} title="Highlighter (M)" active={activeTool === 'highlighter'} onClick={() => { onSelectTool('highlighter'); setShowMoreTools(false); }} />
            <DropdownToolBtn icon={Wand2} title="Magic Pen (W)" active={activeTool === 'magic_pen'} variant="accent" onClick={() => { onSelectTool('magic_pen'); setShowMoreTools(false); }} />
            <DropdownToolBtn icon={Zap} title="Laser Pen (Z)" active={activeTool === 'laser_pen'} variant="danger" onClick={() => { onSelectTool('laser_pen'); setShowMoreTools(false); }} />
            {onMoreAction && (
              <>
                <div className="h-px bg-[var(--border)]/60 my-1 mx-1" />
                <div className="flex items-center gap-1.5 px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)]/60" />
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold">More</p>
                </div>
                <DropdownToolBtn
                  icon={MoreHorizontal}
                  title="More Actions…"
                  onClick={() => { onMoreAction('overflow'); setShowMoreTools(false); }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Zoom Bar ────────────────────────────────────────────────────────────────

export function AerialZoomBar({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetView,
  onUndo,
  onRedo,
  isHidden = false,
}: AerialZoomBarProps) {
  return (
    <div
      className={`pointer-events-auto absolute bottom-6 left-4 flex items-center gap-1.5 bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] shadow-xl rounded-2xl px-2.5 py-1.5 transition-[opacity,transform] duration-300 ease-in-out ${
        isHidden ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}
    >
      <ToolBtn icon={ZoomOut} title="Zoom Out" onClick={onZoomOut} />
      <button
        onClick={onResetView}
        title="Reset View"
        className="text-center font-mono font-bold text-[11px] select-none text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors w-12 px-1.5 py-1 rounded-lg cursor-pointer hover:bg-[var(--accent)]"
      >
        {zoomLevel}%
      </button>
      <ToolBtn icon={ZoomIn} title="Zoom In" onClick={onZoomIn} />
      <div className="w-px h-5 bg-[var(--border)] mx-1" />
      <ToolBtn icon={Undo} title="Undo (Cmd+Z)" onClick={onUndo} />
      <ToolBtn icon={Redo} title="Redo (Cmd+Shift+Z)" onClick={onRedo} />
    </div>
  );
}

// ── Settings Popover ────────────────────────────────────────────────────────

export function AerialSettingsPopover({
  activeTool,
  strokeColor,
  strokeWidth,
  eraserSize,
  fountainSharpness,
  isRough,
  isCurved,
  onChangeColor,
  onChangeWidth,
  onChangeEraserSize,
  onChangeSharpness,
  onChangeRough,
  onChangeCurved,
  backgroundColor,
  onChangeBackgroundColor,
}: AerialSettingsPopoverProps) {
  return (
    <div className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 bg-[var(--card)]/95 backdrop-blur-2xl border border-[var(--border)] shadow-2xl rounded-2xl p-5 w-72 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
      {activeTool === 'eraser' ? (
        <>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2 flex justify-between">
              <span>Eraser Size</span>
              <span className="text-[var(--foreground)] font-mono tabular-nums">{eraserSize}px</span>
            </p>
            <input
              type="range" min="8" max="80" step="2"
              value={eraserSize}
              onChange={e => onChangeEraserSize(parseInt(e.target.value))}
              className="w-full accent-[#e73f07] cursor-pointer"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2">Color Palette</p>
            <div className="flex items-center gap-2 flex-wrap">
              {STROKE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onChangeColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${strokeColor === c ? 'border-[#e73f07] scale-110 shadow-sm ring-2 ring-[#e73f07]/25' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <div className="relative w-7 h-7 rounded-full border-2 border-[var(--border)] overflow-hidden cursor-pointer hover:scale-110 transition-transform">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => onChangeColor(e.target.value)}
                  className="absolute -top-2 -left-2 w-11 h-11 cursor-pointer"
                  title="Custom Color"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2 flex justify-between">
              <span>Stroke Size</span>
              <span className="text-[var(--foreground)] font-mono tabular-nums">{strokeWidth}px</span>
            </p>
            <input
              type="range" min="1" max="24" step="0.5"
              value={strokeWidth}
              onChange={e => onChangeWidth(parseFloat(e.target.value))}
              className="w-full accent-[#e73f07] cursor-pointer"
            />
          </div>

          {activeTool === 'fountain' && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2 flex justify-between">
                <span>Nib Sharpness</span>
                <span className="text-[var(--foreground)] font-mono tabular-nums">{fountainSharpness}</span>
              </p>
              <input
                type="range" min="0.1" max="2.0" step="0.1"
                value={fountainSharpness}
                onChange={e => onChangeSharpness(parseFloat(e.target.value))}
                className="w-full accent-[#e73f07] cursor-pointer"
              />
            </div>
          )}

          {(activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'line') && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="roughShapeToggle"
                className="w-4 h-4 rounded-md accent-[#e73f07] cursor-pointer"
                checked={isRough}
                onChange={(e) => onChangeRough(e.target.checked)}
              />
              <label htmlFor="roughShapeToggle" className="text-[11px] font-mono uppercase tracking-wider font-semibold text-[var(--muted-foreground)] cursor-pointer select-none hover:text-[var(--foreground)]">Scribble Style</label>
            </div>
          )}

          {activeTool === 'arrow' && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="curvedArrowToggle"
                className="w-4 h-4 rounded-md accent-[#e73f07] cursor-pointer"
                checked={isCurved}
                onChange={(e) => onChangeCurved(e.target.checked)}
              />
              <label htmlFor="curvedArrowToggle" className="text-[11px] font-mono uppercase tracking-wider font-semibold text-[var(--muted-foreground)] cursor-pointer select-none hover:text-[var(--foreground)]">Curved Arrow</label>
            </div>
          )}

          {onChangeBackgroundColor && (
            <div className="pt-2 border-t border-[var(--border)]">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2">Canvas Background</p>
              <div className="flex items-center gap-2 flex-wrap">
                {['#0a0a0a', '#000000', '#0d1b2a', '#0a1912', '#ffffff', '#f8f9fa'].map(bg => (
                  <button
                    key={bg}
                    onClick={() => onChangeBackgroundColor(bg)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${backgroundColor === bg ? 'border-[#e73f07] scale-110 ring-2 ring-[#e73f07]/25' : 'border-[var(--border)]'}`}
                    style={{ backgroundColor: bg }}
                  />
                ))}
                <div className="relative w-6 h-6 rounded-full border-2 border-[var(--border)] overflow-hidden cursor-pointer hover:scale-110 transition-transform">
                  <input
                    type="color"
                    value={backgroundColor || '#0a0a0a'}
                    onChange={(e) => onChangeBackgroundColor(e.target.value)}
                    className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer"
                    title="Custom Canvas Background"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
