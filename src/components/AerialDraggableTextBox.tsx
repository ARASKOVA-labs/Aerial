import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripHorizontal, Check, X, Minus, Plus } from 'lucide-react';

export interface AerialDraggableTextBoxProps {
  initialText?: string;
  screenX: number;
  screenY: number;
  initialFontSize?: number;
  initialFontFamily?: string;
  initialColor?: string;
  initialWidth?: number;
  initialHeight?: number;
  isDarkMode?: boolean;
  onCommit: (data: {
    text: string;
    screenX: number;
    screenY: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    width: number;
    height: number;
  }) => void;
  onCancel: () => void;
  onDragMove?: (screenX: number, screenY: number) => void;
}

const FONT_OPTIONS = [
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
  { label: 'Caveat (Script)', value: "'Caveat', cursive" },
  { label: 'Rephen (Brand)', value: "'Rephen', 'Roboto', sans-serif" },
];

const COLOR_SWATCHES = [
  '#e73f07', // Araskova Orange
  '#f3f3f2', // Light
  '#0a0a0a', // Dark
  '#3b82f6', // Electric Blue
  '#10b981', // Emerald Green
  '#f59e0b', // Amber
];

export const AerialDraggableTextBox: React.FC<AerialDraggableTextBoxProps> = ({
  initialText = '',
  screenX,
  screenY,
  initialFontSize = 28,
  initialFontFamily = "'Inter', sans-serif",
  initialColor,
  initialWidth = 320,
  initialHeight = 140,
  isDarkMode = true,
  onCommit,
  onCancel,
  onDragMove,
}) => {
  const [pos, setPos] = useState({ x: screenX, y: screenY });
  const [size, setSize] = useState({ w: Math.max(260, initialWidth), h: Math.max(100, initialHeight) });
  const [text, setText] = useState(initialText);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [fontFamily, setFontFamily] = useState(initialFontFamily);
  const [color, setColor] = useState(initialColor || (isDarkMode ? '#f3f3f2' : '#0a0a0a'));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; initX: number; initY: number } | null>(null);
  const resizeStartRef = useRef<{ pointerX: number; pointerY: number; initW: number; initH: number } | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    if (initialText) {
      textareaRef.current?.select();
    }
  }, [initialText]);

  // Sync position if screenX / screenY changes externally
  useEffect(() => {
    setPos({ x: screenX, y: screenY });
  }, [screenX, screenY]);

  // Drag handling
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initX: pos.x,
      initY: pos.y,
    };

    const handlePointerMove = (ev: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = ev.clientX - dragStartRef.current.pointerX;
      const dy = ev.clientY - dragStartRef.current.pointerY;
      const newX = Math.round(dragStartRef.current.initX + dx);
      const newY = Math.round(dragStartRef.current.initY + dy);
      setPos({ x: newX, y: newY });
      onDragMove?.(newX, newY);
    };

    const handlePointerUp = () => {
      dragStartRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Resize handling
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initW: size.w,
      initH: size.h,
    };

    const handlePointerMove = (ev: PointerEvent) => {
      if (!resizeStartRef.current) return;
      const dw = ev.clientX - resizeStartRef.current.pointerX;
      const dh = ev.clientY - resizeStartRef.current.pointerY;
      const newW = Math.max(220, Math.round(resizeStartRef.current.initW + dw));
      const newH = Math.max(80, Math.round(resizeStartRef.current.initH + dh));
      setSize({ w: newW, h: newH });
    };

    const handlePointerUp = () => {
      resizeStartRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleCommit = useCallback(() => {
    if (!text.trim()) {
      onCancel();
      return;
    }
    onCommit({
      text,
      screenX: pos.x,
      screenY: pos.y,
      fontSize,
      fontFamily,
      color,
      width: size.w,
      height: size.h,
    });
  }, [text, pos.x, pos.y, fontSize, fontFamily, color, size.w, size.h, onCommit, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const adjustFontSize = (delta: number) => {
    setFontSize((prev) => Math.min(120, Math.max(12, prev + delta)));
  };

  return (
    <div
      className="absolute z-50 flex flex-col rounded-2xl shadow-2xl backdrop-blur-2xl border transition-shadow duration-200 select-none animate-in fade-in zoom-in-95"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${size.w}px`,
        backgroundColor: isDarkMode ? 'rgba(17, 17, 17, 0.94)' : 'rgba(255, 255, 255, 0.96)',
        borderColor: '#e73f07',
        boxShadow: isDarkMode
          ? '0 16px 48px -8px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(231, 63, 7, 0.25)'
          : '0 16px 48px -8px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(231, 63, 7, 0.25)',
      }}
    >
      {/* Draggable Header */}
      <div
        onPointerDown={handleHeaderPointerDown}
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)] rounded-t-2xl cursor-grab active:cursor-grabbing bg-[var(--secondary)]/40 hover:bg-[var(--secondary)]/70 transition-colors"
        title="Drag to reposition text anywhere on canvas"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold tracking-wider uppercase text-[var(--foreground)]">
          <GripHorizontal className="w-3.5 h-3.5 text-[#e73f07]" />
          <span>TEXT</span>
        </div>

        {/* Font Controls Toolbar */}
        <div className="flex items-center gap-1.5">
          {/* Font Family Selector */}
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="text-[10px] font-mono font-bold tracking-tight bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-md px-1.5 py-0.5 outline-none cursor-pointer hover:border-[#e73f07] transition-colors"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Font Size Adjuster */}
          <div className="flex items-center bg-[var(--card)] border border-[var(--border)] rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => adjustFontSize(-2)}
              className="p-1 hover:bg-[var(--accent)] text-[var(--foreground)] active:scale-95 transition-all"
              title="Decrease font size"
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <span className="text-[10px] font-mono px-1 font-bold min-w-[28px] text-center text-[var(--foreground)]">
              {fontSize}
            </span>
            <button
              type="button"
              onClick={() => adjustFontSize(2)}
              className="p-1 hover:bg-[var(--accent)] text-[var(--foreground)] active:scale-95 transition-all"
              title="Increase font size"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Color Swatches */}
          <div className="flex items-center gap-1 ml-0.5">
            {COLOR_SWATCHES.slice(0, 3).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-3.5 h-3.5 rounded-full border transition-transform ${
                  color.toLowerCase() === c.toLowerCase()
                    ? 'scale-125 border-white ring-1 ring-[#e73f07]'
                    : 'border-white/20 hover:scale-110'
                }`}
                title={c}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 pl-1 border-l border-[var(--border)] ml-1">
            <button
              type="button"
              onClick={handleCommit}
              className="p-1 bg-[#e73f07] text-white rounded-md hover:bg-[#ff4e12] active:scale-95 transition-all shadow-sm"
              title="Done (Enter)"
            >
              <Check className="w-3 h-3 stroke-[3]" />
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] rounded-md active:scale-95 transition-all"
              title="Cancel (Esc)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Textarea Editor Area */}
      <div className="relative p-2.5 flex-1 flex flex-col">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type here… (Shift+Enter for new line)"
          style={{
            fontFamily,
            fontSize: `${fontSize}px`,
            color,
            lineHeight: 1.25,
            minHeight: `${Math.max(60, size.h - 50)}px`,
          }}
          className="w-full h-full bg-transparent resize-none outline-none border-none placeholder:text-neutral-500 font-medium"
        />

        {/* Readjustment Helper footer info & Corner Resize Handle */}
        <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/50 mt-1 text-[9px] font-mono text-[var(--muted-foreground)]">
          <span>Drag header to move · Shift+Enter for newline</span>
          <div
            onPointerDown={handleResizePointerDown}
            className="w-4 h-4 -mr-1 -mb-1 flex items-center justify-center cursor-se-resize text-[#e73f07] hover:scale-125 transition-transform"
            title="Drag to resize text box"
          >
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
              <path d="M14 14H12V12H14V14ZM14 10H12V8H14V10ZM10 14H8V12H10V14ZM14 6H12V4H14V6ZM6 14H4V12H6V14Z" opacity="0.8" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
