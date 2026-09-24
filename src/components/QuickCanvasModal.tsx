// ── Aerial Canvas — Quick Canvas (Instant Note Taking) ──────────────────────
// Laptop-optimized, shortcut-driven instant scratchpad with dual Ink/Sketch & Markdown Note modes.
// Complies with Araskova brutalist design invariants (Roboto, Space Mono, zero Orbitron).

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pen,
  Highlighter,
  Wand2,
  Type,
  Eraser,
  Undo,
  Redo,
  Trash2,
  Copy,
  Check,
  Sparkles,
  ArrowRightCircle,
  X,
  ListTodo,
  Clock,
  Code2,
  Plus,
  Minimize2,
  History,
  Lightbulb,
  Link2,
} from 'lucide-react';
import { AerialCanvas } from './AerialCanvas';
import type { AerialCanvasRef, ToolId } from '../lib/types';
import { createLogger } from '../lib/logger';

const logger = createLogger('QuickCanvasModal');

export interface QuickCanvasModalProps {
  isDarkMode: boolean;
  isOpenedFromBackground?: boolean;
  onClose: () => void;
  onStampSketch: (pngBlob: Blob) => void;
  onStampText: (text: string) => void;
  onSaveAsBoard: (name: string, canvasState?: Uint8Array, textContent?: string) => void;
  onHideWindow?: () => void;
}

interface StoredQuickNote {
  id: string;
  text: string;
  timeStr: string;
}

export function QuickCanvasModal({
  isDarkMode,
  isOpenedFromBackground = false,
  onClose,
  onStampSketch,
  onStampText,
  onSaveAsBoard,
  onHideWindow,
}: QuickCanvasModalProps) {
  // Laptop-first: Default to 'text' for instant typing without stylus
  const [activeTab, setActiveTab] = useState<'text' | 'sketch'>(() => {
    const saved = localStorage.getItem('aerial_quick_note_mode');
    return saved === 'sketch' ? 'sketch' : 'text';
  });

  const [activeTool, setActiveTool] = useState<ToolId>('freedraw');
  const [strokeColor, setStrokeColor] = useState('#e73f07');
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const eraserSize = 24;

  const [textContent, setTextContent] = useState(() => {
    return localStorage.getItem('aerial_quick_note_text') || '';
  });

  // Recent quick notes archive
  const [recentNotes, setRecentNotes] = useState<StoredQuickNote[]>(() => {
    try {
      const stored = localStorage.getItem('aerial_quick_notes_archive');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showRecentMenu, setShowRecentMenu] = useState(false);
  const recentMenuRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);
  const [stamped, setStamped] = useState(false);

  const canvasRef = useRef<AerialCanvasRef>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close recent notes dropdown when clicking outside
  useEffect(() => {
    if (!showRecentMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (recentMenuRef.current && !recentMenuRef.current.contains(e.target as Node)) {
        setShowRecentMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showRecentMenu]);

  // Save mode preference
  useEffect(() => {
    localStorage.setItem('aerial_quick_note_mode', activeTab);
  }, [activeTab]);

  // Autosave text note continuously
  useEffect(() => {
    localStorage.setItem('aerial_quick_note_text', textContent);
  }, [textContent]);

  // Periodic autosave for sketch
  useEffect(() => {
    const interval = setInterval(() => {
      if (canvasRef.current) {
        try {
          const state = canvasRef.current.exportFullState();
          if (state && state.length > 0) {
            let binary = '';
            for (let i = 0; i < state.length; i++) {
              binary += String.fromCharCode(state[i]);
            }
            localStorage.setItem('aerial_quick_note_state', btoa(binary));
          }
        } catch (e) {
          logger.error('Failed to autosave quick sketch:', e);
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Instant Auto-Focus on Textarea when switching to text
  useEffect(() => {
    if (activeTab === 'text') {
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Dismiss & Go Away (hides window if invoked from background or requested)
  const handleDismiss = useCallback(() => {
    onClose();
    if (isOpenedFromBackground && onHideWindow) {
      onHideWindow();
    }
  }, [onClose, isOpenedFromBackground, onHideWindow]);

  // Explicitly hide window (dock / tray)
  const handleHide = useCallback(() => {
    onClose();
    if (onHideWindow) {
      onHideWindow();
    }
  }, [onClose, onHideWindow]);

  // Switch mode tabs seamlessly
  const handleSwitchTab = useCallback((tab: 'text' | 'sketch') => {
    setActiveTab(tab);
    if (tab === 'sketch') {
      requestAnimationFrame(() => {
        canvasRef.current?.getEngine()?.render();
      });
    } else {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      });
    }
  }, []);

  // Tool Selection Handlers
  const handleSelectTool = useCallback((tool: ToolId) => {
    setActiveTool(tool);
    canvasRef.current?.setTool(tool);
    if (tool !== 'eraser') {
      canvasRef.current?.setStrokeColor(strokeColor);
      canvasRef.current?.setStrokeWidth(strokeWidth);
    }
  }, [strokeColor, strokeWidth]);

  const handleSelectColor = useCallback((color: string) => {
    setStrokeColor(color);
    if (activeTool === 'eraser') {
      setActiveTool('freedraw');
      canvasRef.current?.setTool('freedraw');
    }
    canvasRef.current?.setStrokeColor(color);
  }, [activeTool]);

  const handleSelectWidth = useCallback((width: number) => {
    setStrokeWidth(width);
    if (activeTool === 'eraser') {
      setActiveTool('freedraw');
      canvasRef.current?.setTool('freedraw');
    }
    canvasRef.current?.setStrokeWidth(width);
  }, [activeTool]);

  // Save current note into Recent Archive
  const archiveCurrentNote = useCallback(() => {
    if (!textContent.trim()) return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newEntry: StoredQuickNote = {
      id: Date.now().toString(),
      text: textContent.trim(),
      timeStr,
    };
    setRecentNotes((prev) => {
      const filtered = prev.filter((n) => n.text !== newEntry.text);
      const updated = [newEntry, ...filtered].slice(0, 10);
      localStorage.setItem('aerial_quick_notes_archive', JSON.stringify(updated));
      return updated;
    });
  }, [textContent]);

  const handleDeleteRecentNote = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRecentNotes((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      localStorage.setItem('aerial_quick_notes_archive', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Handle New Blank Note (⌘N)
  const handleNewNote = useCallback(() => {
    archiveCurrentNote();
    setTextContent('');
    localStorage.removeItem('aerial_quick_note_text');
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [archiveCurrentNote]);

  // Handle Stamp to Main Canvas (⌘↵)
  const handleStamp = useCallback(async () => {
    if (activeTab === 'sketch') {
      if (!canvasRef.current) return;
      try {
        const blob = await canvasRef.current.exportPngBlob();
        onStampSketch(blob);
        setStamped(true);
        setTimeout(() => {
          setStamped(false);
          handleDismiss();
        }, 200);
      } catch (err) {
        logger.error('Failed to stamp sketch to canvas:', err);
      }
    } else {
      if (!textContent.trim()) return;
      archiveCurrentNote();
      onStampText(textContent.trim());
      setStamped(true);
      setTimeout(() => {
        setStamped(false);
        handleDismiss();
      }, 200);
    }
  }, [activeTab, textContent, onStampSketch, onStampText, archiveCurrentNote, handleDismiss]);

  // Handle Promote to Dedicated Board in Sidebar (⌘S)
  const handlePromoteToBoard = useCallback(() => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const boardName = `Quick Note (${timeStr})`;

    if (activeTab === 'sketch' && canvasRef.current) {
      const state = canvasRef.current.exportFullState();
      onSaveAsBoard(boardName, state, undefined);
    } else {
      if (!textContent.trim()) return;
      archiveCurrentNote();
      onSaveAsBoard(boardName, undefined, textContent.trim());
    }
    handleDismiss();
  }, [activeTab, textContent, onSaveAsBoard, archiveCurrentNote, handleDismiss]);

  // Handle Copy to Clipboard
  const handleCopy = useCallback(async () => {
    if (activeTab === 'sketch' && canvasRef.current) {
      try {
        const blob = await canvasRef.current.exportPngBlob();
        if (navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          throw new Error('Clipboard write not supported');
        }
      } catch (err) {
        logger.error('Failed to copy quick canvas PNG:', err);
      }
    } else {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(textContent);
        } else {
          throw new Error('Clipboard writeText not supported');
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback for Safari/restricted webview contexts
        if (textareaRef.current) {
          textareaRef.current.select();
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          logger.error('Failed to copy quick note text');
        }
      }
    }
  }, [activeTab, textContent]);

  // Handle Clear
  const handleClear = useCallback(() => {
    if (activeTab === 'sketch') {
      canvasRef.current?.clearBoard();
      localStorage.removeItem('aerial_quick_note_state');
    } else {
      archiveCurrentNote();
      setTextContent('');
      localStorage.removeItem('aerial_quick_note_text');
      textareaRef.current?.focus();
    }
  }, [activeTab, archiveCurrentNote]);

  // Text markdown helper actions — retains cursor and selection
  const insertTextPrefix = useCallback((prefix: string, wrapSuffix = '') => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const val = el.value;
    const selected = val.substring(start, end);
    const replacement = prefix + selected + wrapSuffix;
    const nextVal = val.substring(0, start) + replacement + val.substring(end);
    setTextContent(nextVal);
    const cursorTarget = start + prefix.length + selected.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursorTarget, cursorTarget);
      }
    });
  }, []);

  // Handle Paste event inside Quick Canvas (Screenshots & Images)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            e.stopPropagation();
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string;
              if (dataUrl) {
                if (activeTab === 'sketch' && canvasRef.current) {
                  const img = new Image();
                  img.onload = () => {
                    const w = Math.min(img.width, 500);
                    const h = (w / img.width) * img.height;
                    const assetId = crypto.randomUUID();
                    canvasRef.current?.addImage(img, 50, 50, w, h, assetId);
                  };
                  img.src = dataUrl;
                } else {
                  onStampSketch(file);
                  setStamped(true);
                  setTimeout(() => {
                    setStamped(false);
                    handleDismiss();
                  }, 250);
                }
              }
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeTab, onStampSketch, handleDismiss]);

  // Keyboard shortcut handler inside Quick Canvas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
        return;
      }
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl) {
        if (e.key === '1') {
          e.preventDefault();
          handleSwitchTab('text');
        } else if (e.key === '2') {
          e.preventDefault();
          handleSwitchTab('sketch');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleStamp();
        } else if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          handlePromoteToBoard();
        } else if (e.key.toLowerCase() === 'n' && activeTab === 'text') {
          e.preventDefault();
          handleNewNote();
        } else if (e.key.toLowerCase() === 'h') {
          e.preventDefault();
          handleHide();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStamp, handlePromoteToBoard, handleNewNote, handleDismiss, handleHide, handleSwitchTab, activeTab]);

  const paletteColors = ['#e73f07', '#f3f3f2', '#06b6d4', '#10b981', '#f59e0b', '#a855f7'];

  return (
    <div
      onClick={handleDismiss}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0a0a0a]/75 backdrop-blur-md pointer-events-auto p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          activeTab === 'text'
            ? 'max-w-2xl h-[520px]'
            : 'max-w-4xl h-[78vh]'
        } ${
          isDarkMode
            ? 'bg-[#111111] border-[#2a2a2a] text-[#f3f3f2]'
            : 'bg-[#ffffff] border-[#e5e5e5] text-[#0a0a0a]'
        }`}
      >
        {/* Tactical Corner Reticles */}
        <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t-2 border-l-2 border-[#e73f07]/60 pointer-events-none z-20" />
        <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t-2 border-r-2 border-[#e73f07]/60 pointer-events-none z-20" />
        <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b-2 border-l-2 border-[#e73f07]/60 pointer-events-none z-20" />
        <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b-2 border-r-2 border-[#e73f07]/60 pointer-events-none z-20" />

        {/* ── Modal Header ── */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-b shrink-0 ${
            isDarkMode ? 'border-[#2a2a2a] bg-[#0a0a0a]/90' : 'border-[#e5e5e5] bg-[#f8f9fa]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#e73f07] animate-pulse" />
              <h2 className="text-xs font-mono font-black uppercase tracking-wider text-[#e73f07]">
                Quick Note
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase bg-[#e73f07]/15 text-[#e73f07] border border-[#e73f07]/30">
              ⌥Space · ⌘⇧N
            </span>
            <span className="hidden sm:inline-flex text-[9px] font-mono text-[var(--muted-foreground)]">
              ● Auto-saved
            </span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--secondary)] border border-[var(--border)]">
            <button
              onClick={() => handleSwitchTab('text')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'text'
                  ? 'bg-[#e73f07] text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              title="Quick Text Note (⌘1)"
            >
              <Type className="w-3 h-3" />
              Text <span className="opacity-60 text-[9px]">⌘1</span>
            </button>
            <button
              onClick={() => handleSwitchTab('sketch')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'sketch'
                  ? 'bg-[#e73f07] text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              title="Ink / Sketch Canvas (⌘2)"
            >
              <Pen className="w-3 h-3" />
              Sketch <span className="opacity-60 text-[9px]">⌘2</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            {onHideWindow && (
              <button
                onClick={handleHide}
                className="h-8 px-2.5 rounded-lg flex items-center gap-1 hover:bg-[var(--accent)] transition-colors cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px] font-mono"
                title="Dismiss & Hide to Background (Esc / ⌘H)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Hide</span>
                <kbd className="px-1 py-0.5 rounded bg-[var(--secondary)] border border-[var(--border)] text-[9px]">
                  ⌘H
                </kbd>
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--accent)] transition-colors cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Sub-Toolbar for Sketch or Text ── */}
        {activeTab === 'sketch' ? (
          <div
            className={`flex items-center justify-between px-5 py-2 border-b shrink-0 flex-wrap gap-2 ${
              isDarkMode ? 'border-[#2a2a2a] bg-[#141414]' : 'border-[#e5e5e5] bg-[#fafafa]'
            }`}
          >
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSelectTool('freedraw')}
                className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                  activeTool === 'freedraw'
                    ? 'border-[#e73f07] bg-[#e73f07]/20 text-[#e73f07]'
                    : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
                title="Pen"
              >
                <Pen className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleSelectTool('highlighter')}
                className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                  activeTool === 'highlighter'
                    ? 'border-[#e73f07] bg-[#e73f07]/20 text-[#e73f07]'
                    : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
                title="Highlighter"
              >
                <Highlighter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleSelectTool('magic_pen')}
                className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                  activeTool === 'magic_pen'
                    ? 'border-[#e73f07] bg-[#e73f07]/20 text-[#e73f07]'
                    : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
                title="Magic Pen (Handwriting to Text)"
              >
                <Wand2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleSelectTool('text')}
                className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                  activeTool === 'text'
                    ? 'border-[#e73f07] bg-[#e73f07]/20 text-[#e73f07]'
                    : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
                title="Canvas Text"
              >
                <Type className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleSelectTool('eraser')}
                className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                  activeTool === 'eraser'
                    ? 'border-[#e73f07] bg-[#e73f07]/20 text-[#e73f07]'
                    : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
                title="Eraser"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>

              <div className="h-4 w-px bg-[var(--border)] mx-1" />

              {/* Color Swatches */}
              <div className="flex items-center gap-1">
                {paletteColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelectColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                      strokeColor === c ? 'scale-125 ring-2 ring-white/50' : 'opacity-80 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>

              <div className="h-4 w-px bg-[var(--border)] mx-1" />

              {/* Stroke sizes */}
              <div className="flex items-center gap-1">
                {[1.5, 2.5, 5, 8].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => handleSelectWidth(sz)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                      strokeWidth === sz
                        ? 'bg-[var(--accent)] text-[var(--foreground)] font-bold'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => canvasRef.current?.undo?.()}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                title="Undo (⌘Z)"
              >
                <Undo className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => canvasRef.current?.redo?.()}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                title="Redo (⌘⇧Z / ⌘Y)"
              >
                <Redo className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`flex items-center justify-between px-5 py-2 border-b shrink-0 flex-wrap gap-2 ${
              isDarkMode ? 'border-[#2a2a2a] bg-[#141414]' : 'border-[#e5e5e5] bg-[#fafafa]'
            }`}
          >
            {/* Quick-insert pills for rapid laptop note taking */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertTextPrefix('- [ ] ')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[11px] font-mono text-[var(--foreground)] transition-colors cursor-pointer select-none"
                title="Insert Todo item"
              >
                <ListTodo className="w-3 h-3 text-[#e73f07]" />
                Todo
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertTextPrefix('💡 ')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[11px] font-mono text-[var(--foreground)] transition-colors cursor-pointer select-none"
                title="Insert Idea note"
              >
                <Lightbulb className="w-3 h-3 text-amber-500" />
                Idea
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertTextPrefix('[', '](url)')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[11px] font-mono text-[var(--foreground)] transition-colors cursor-pointer select-none"
                title="Insert Markdown Link"
              >
                <Link2 className="w-3 h-3 text-cyan-500" />
                Link
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const now = new Date();
                  const time = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}] `;
                  insertTextPrefix(time);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[11px] font-mono text-[var(--foreground)] transition-colors cursor-pointer select-none"
                title="Insert Timestamp"
              >
                <Clock className="w-3 h-3 text-emerald-500" />
                Time
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertTextPrefix('```\n', '\n```')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[11px] font-mono text-[var(--foreground)] transition-colors cursor-pointer select-none"
                title="Insert Code block"
              >
                <Code2 className="w-3 h-3 text-purple-500" />
                Code
              </button>
            </div>

            {/* Note Archive & New Note */}
            <div className="flex items-center gap-2 relative">
              <button
                onClick={handleNewNote}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[11px] font-mono text-[var(--foreground)] transition-colors cursor-pointer"
                title="Start a new blank quick note (⌘N)"
              >
                <Plus className="w-3 h-3 text-[#e73f07]" />
                New Note <span className="opacity-60 text-[9px]">⌘N</span>
              </button>

              {recentNotes.length > 0 && (
                <div className="relative" ref={recentMenuRef}>
                  <button
                    onClick={() => setShowRecentMenu((v) => !v)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[11px] font-mono text-[var(--foreground)] transition-colors cursor-pointer"
                    title="View Recent Notes"
                  >
                    <History className="w-3 h-3" />
                    <span>Notes ({recentNotes.length})</span>
                  </button>

                  {showRecentMenu && (
                    <div
                      className={`absolute right-0 top-full mt-1.5 w-64 max-h-56 overflow-y-auto rounded-xl border shadow-xl z-50 p-1.5 ${
                        isDarkMode ? 'bg-[#181818] border-[#2a2a2a]' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] px-2 py-1 border-b border-[var(--border)] flex justify-between items-center">
                        <span>Recent Scratchpads</span>
                        <span className="text-[9px]">Click to load</span>
                      </div>
                      {recentNotes.map((note) => (
                        <div
                          key={note.id}
                          onClick={() => {
                            archiveCurrentNote();
                            setTextContent(note.text);
                            setShowRecentMenu(false);
                            textareaRef.current?.focus();
                          }}
                          className="px-2 py-1.5 rounded-lg text-xs font-mono hover:bg-[var(--accent)] transition-colors cursor-pointer flex items-center justify-between gap-1 group"
                        >
                          <div className="flex flex-col gap-0.5 truncate flex-1 min-w-0">
                            <span className="truncate text-[var(--foreground)]">
                              {note.text.split('\n')[0] || 'Untitled Note'}
                            </span>
                            <span className="text-[9px] text-[var(--muted-foreground)]">
                              {note.timeStr}
                            </span>
                          </div>
                          <button
                            onClick={(e) => handleDeleteRecentNote(e, note.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-500 transition-opacity"
                            title="Delete this note"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Main Content Area (Dual persistent layers keep WASM & Text live) ── */}
        <div className="flex-1 relative overflow-hidden">
          {/* Sketch Layer */}
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              visibility: activeTab === 'sketch' ? 'visible' : 'hidden',
              pointerEvents: activeTab === 'sketch' ? 'auto' : 'none',
              zIndex: activeTab === 'sketch' ? 10 : 0,
            }}
          >
            <AerialCanvas
              ref={canvasRef}
              theme={isDarkMode ? 'dark' : 'light'}
              showToolbar={false}
              eraserSize={eraserSize}
              onReady={(api) => {
                api.setTool(activeTool);
                api.setStrokeColor(strokeColor);
                api.setStrokeWidth(strokeWidth);
                const savedSketch = localStorage.getItem('aerial_quick_note_state');
                if (savedSketch) {
                  try {
                    const bytes = Uint8Array.from(atob(savedSketch), (c) => c.charCodeAt(0));
                    api.importFullState(bytes);
                  } catch (e) {
                    logger.error('Failed to restore quick sketch on ready:', e);
                  }
                }
              }}
            />
          </div>

          {/* Text Layer */}
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              visibility: activeTab === 'text' ? 'visible' : 'hidden',
              pointerEvents: activeTab === 'text' ? 'auto' : 'none',
              zIndex: activeTab === 'text' ? 10 : 0,
            }}
          >
            <textarea
              ref={textareaRef}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Type instant thoughts, tasks, scratchpad, code... (Auto-saved · ⌘↵ to Stamp, ⎋ to Dismiss)"
              className={`w-full h-full p-6 outline-none font-mono text-sm leading-relaxed resize-none ${
                isDarkMode ? 'bg-[#0e0e0e] text-[#f3f3f2]' : 'bg-[#ffffff] text-[#0a0a0a]'
              }`}
            />
          </div>
        </div>

        {/* ── Modal Footer with Instant Actions ── */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t shrink-0 ${
            isDarkMode ? 'border-[#2a2a2a] bg-[#0a0a0a]/90' : 'border-[#e5e5e5] bg-[#f8f9fa]'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-red-500/10 hover:border-red-500/30 text-red-500 text-xs font-mono font-bold transition-colors cursor-pointer"
              title="Clear Scratchpad"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--accent)] text-[var(--foreground)] text-xs font-mono font-bold transition-colors cursor-pointer"
              title="Copy to Clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : activeTab === 'sketch' ? 'Copy PNG' : 'Copy Text'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xs font-mono font-bold transition-colors cursor-pointer"
              title="Dismiss & Hide Note (Esc)"
            >
              Dismiss (⎋)
            </button>

            <button
              onClick={handlePromoteToBoard}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[var(--foreground)] text-xs font-mono font-bold transition-colors cursor-pointer"
              title="Save note as a permanent board in sidebar (⌘S)"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#e73f07]" />
              Save as Board (⌘S)
            </button>

            <button
              onClick={handleStamp}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#e73f07] hover:bg-[#d03806] text-white text-xs font-mono font-bold shadow-md shadow-[#e73f07]/20 transition-all active:translate-y-px cursor-pointer"
              title="Stamp onto active canvas and dismiss (⌘↵)"
            >
              <ArrowRightCircle className="w-4 h-4" />
              {stamped ? 'Stamped!' : 'Stamp to Canvas (⌘↵)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
