// ── Aerial Canvas — Quick Canvas (Simple, Short-Sized Instant Notes) ──────────
// Laptop-optimized, lightweight floating scratchpad with dual Ink & Text modes.
// Complies with Araskova brutalist design invariants (Space Mono, zero Orbitron).

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pen,
  Highlighter,
  Wand2,
  Eraser,
  Undo,
  Redo,
  Copy,
  Check,
  Sparkles,
  ArrowRightCircle,
  X,
  History,
} from 'lucide-react';
import { AerialCanvas } from './AerialCanvas';
import type { AerialCanvasRef, ToolId } from '../lib/types';
import { createLogger } from '../lib/logger';

const logger = createLogger('QuickCanvasModal');

export interface QuickCanvasModalProps {
  isDarkMode: boolean;
  isOpenedFromBackground?: boolean;
  isStandalone?: boolean;
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
  isStandalone = false,
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

  // Dismiss / Hide handler
  const handleDismiss = useCallback(() => {
    onClose();
    if ((isOpenedFromBackground || isStandalone) && onHideWindow) {
      onHideWindow();
    }
  }, [onClose, isOpenedFromBackground, isStandalone, onHideWindow]);

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
      const updated = [newEntry, ...filtered].slice(0, 8);
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
        }, 150);
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
      }, 150);
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
        }
      } catch (err) {
        logger.error('Failed to copy quick canvas PNG:', err);
      }
    } else {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(textContent);
        } else {
          throw new Error('No writeText');
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        if (textareaRef.current) {
          textareaRef.current.select();
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
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
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStamp, handlePromoteToBoard, handleDismiss, handleSwitchTab]);

  const paletteColors = ['#e73f07', '#f3f3f2', '#06b6d4', '#10b981'];

  // Word count calculation
  const wordCount = textContent.trim() ? textContent.trim().split(/\s+/).length : 0;

  const cardContent = (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`relative w-full flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200 ${
        activeTab === 'text'
          ? 'max-w-[490px] h-[285px]'
          : 'max-w-[580px] h-[380px]'
      } ${
        isDarkMode
          ? 'bg-[#111111]/95 border-[#2a2a2a] text-[#f3f3f2] shadow-black/80'
          : 'bg-[#ffffff]/95 border-[#e5e5e5] text-[#0a0a0a] shadow-xl'
      } backdrop-blur-2xl`}
    >
      {/* Tactical Corner Reticles */}
      <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-[#e73f07]/50 pointer-events-none z-20" />
      <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-[#e73f07]/50 pointer-events-none z-20" />
      <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-[#e73f07]/50 pointer-events-none z-20" />
      <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-[#e73f07]/50 pointer-events-none z-20" />

      {/* ── 1. Minimal 34px Header Bar ── */}
      <div
        className={`flex items-center justify-between px-3.5 py-2 border-b shrink-0 select-none ${
          isDarkMode ? 'border-[#222222] bg-[#0c0c0c]/80' : 'border-[#eeeeee] bg-[#f8f9fa]/80'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#e73f07] animate-pulse" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--foreground)]">
            Quick Note
          </span>
          <span className="text-[9px] font-mono text-[var(--muted-foreground)] opacity-70">
            ⌥Space
          </span>
        </div>

        {/* Minimal Mode Pills: Text vs Ink */}
        <div className="flex items-center p-0.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
          <button
            onClick={() => handleSwitchTab('text')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'text'
                ? 'bg-[#e73f07] text-white shadow-xs'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            title="Text Note (⌘1)"
          >
            Text
          </button>
          <button
            onClick={() => handleSwitchTab('sketch')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'sketch'
                ? 'bg-[#e73f07] text-white shadow-xs'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            title="Ink Sketch (⌘2)"
          >
            Ink
          </button>
        </div>

        {/* Subtle quick tools */}
        <div className="flex items-center gap-1">
          {recentNotes.length > 0 && (
            <div className="relative" ref={recentMenuRef}>
              <button
                onClick={() => setShowRecentMenu((v) => !v)}
                className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                title={`Recent Notes (${recentNotes.length})`}
              >
                <History className="w-3.5 h-3.5" />
              </button>

              {showRecentMenu && (
                <div
                  className={`absolute right-0 top-full mt-1.5 w-60 max-h-48 overflow-y-auto rounded-xl border shadow-xl z-50 p-1.5 ${
                    isDarkMode ? 'bg-[#181818] border-[#2a2a2a]' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] px-2 py-1 border-b border-[var(--border)] flex justify-between">
                    <span>Recent Scratchpads</span>
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
                      <span className="truncate text-[var(--foreground)] text-[11px] flex-1">
                        {note.text.split('\n')[0] || 'Untitled Note'}
                      </span>
                      <button
                        onClick={(e) => handleDeleteRecentNote(e, note.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-red-500 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleCopy}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
            title="Copy (⌘C)"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleDismiss}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
            title="Dismiss (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── 2. Content Area (Zero distractions) ── */}
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
                  logger.error('Failed to restore quick sketch:', e);
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
            placeholder="Type instant notes, tasks, code... (Auto-saved · ⌘↵ to Stamp, ⎋ to dismiss)"
            className={`w-full h-full p-4 outline-none font-mono text-[13px] leading-relaxed resize-none bg-transparent ${
              isDarkMode ? 'text-[#f3f3f2] placeholder-neutral-600' : 'text-[#0a0a0a] placeholder-neutral-400'
            }`}
          />
        </div>
      </div>

      {/* ── 3. Single Streamlined 32px Action Strip ── */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-t shrink-0 select-none ${
          isDarkMode ? 'border-[#222222] bg-[#0c0c0c]/90' : 'border-[#eeeeee] bg-[#f8f9fa]/90'
        }`}
      >
        {activeTab === 'text' ? (
          <div className="flex items-center gap-1.5">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertTextPrefix('- [ ] ')}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
              title="Todo item"
            >
              [ ]
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertTextPrefix('💡 ')}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
              title="Idea note"
            >
              💡
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertTextPrefix('```\n', '\n```')}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
              title="Code snippet"
            >
              &lt;/&gt;
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const now = new Date();
                insertTextPrefix(`[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}] `);
              }}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
              title="Timestamp"
            >
              🕒
            </button>
            <div className="w-px h-3 bg-[var(--border)] mx-0.5" />
            <button
              onClick={handleClear}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Clear note"
            >
              clear
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleSelectTool('freedraw')}
              className={`p-1 rounded text-xs cursor-pointer ${
                activeTool === 'freedraw' ? 'text-[#e73f07] bg-[#e73f07]/20' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              title="Pen"
            >
              <Pen className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleSelectTool('highlighter')}
              className={`p-1 rounded text-xs cursor-pointer ${
                activeTool === 'highlighter' ? 'text-[#e73f07] bg-[#e73f07]/20' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              title="Highlighter"
            >
              <Highlighter className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleSelectTool('magic_pen')}
              className={`p-1 rounded text-xs cursor-pointer ${
                activeTool === 'magic_pen' ? 'text-[#e73f07] bg-[#e73f07]/20' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              title="Magic Pen"
            >
              <Wand2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleSelectTool('eraser')}
              className={`p-1 rounded text-xs cursor-pointer ${
                activeTool === 'eraser' ? 'text-[#e73f07] bg-[#e73f07]/20' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              title="Eraser"
            >
              <Eraser className="w-3 h-3" />
            </button>
            <div className="w-px h-3 bg-[var(--border)] mx-1" />
            <div className="flex items-center gap-1">
              {paletteColors.map((c) => (
                <button
                  key={c}
                  onClick={() => handleSelectColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-3 h-3 rounded-full cursor-pointer transition-transform ${
                    strokeColor === c ? 'scale-125 ring-1 ring-white/60' : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
            <div className="w-px h-3 bg-[var(--border)] mx-1" />
            <div className="flex items-center gap-0.5">
              {[1.5, 3, 6].map((w) => (
                <button
                  key={w}
                  onClick={() => handleSelectWidth(w)}
                  className={`px-1 rounded text-[9px] font-mono cursor-pointer transition-colors ${
                    strokeWidth === w
                      ? 'bg-[#e73f07] text-white font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  title={`${w}px stroke`}
                >
                  {w}
                </button>
              ))}
            </div>
            <div className="w-px h-3 bg-[var(--border)] mx-1" />
            <button
              onClick={() => canvasRef.current?.undo?.()}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              title="Undo (⌘Z)"
            >
              <Undo className="w-3 h-3" />
            </button>
            <button
              onClick={() => canvasRef.current?.redo?.()}
              className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              title="Redo (⌘⇧Z)"
            >
              <Redo className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Center: word counter */}
        {activeTab === 'text' && (
          <span className="text-[9px] font-mono text-[var(--muted-foreground)] opacity-60">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        )}

        {/* Right: Primary actions (Stamp & Board) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePromoteToBoard}
            className="h-6 px-2 rounded-md border border-[var(--border)] text-[10px] font-mono font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors cursor-pointer flex items-center gap-1"
            title="Save as dedicated board (⌘S)"
          >
            <Sparkles className="w-3 h-3 text-[#e73f07]" />
            Board
          </button>

          <button
            onClick={handleStamp}
            className="h-6 px-2.5 rounded-md bg-[#e73f07] hover:bg-[#d03806] text-white text-[10px] font-mono font-bold shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
            title="Stamp to active canvas (⌘↵)"
          >
            <ArrowRightCircle className="w-3 h-3" />
            {stamped ? 'Stamped!' : 'Stamp'}
          </button>
        </div>
      </div>
    </div>
  );

  // If running in standalone window mode, render directly without fullscreen backdrop
  if (isStandalone) {
    return (
      <div className="w-screen h-screen flex items-center justify-center p-2 bg-transparent select-none">
        {cardContent}
      </div>
    );
  }

  // Inside the main app, render with soft backdrop
  return (
    <div
      onClick={handleDismiss}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0a0a0a]/50 backdrop-blur-sm pointer-events-auto p-4 animate-in fade-in duration-150"
    >
      {cardContent}
    </div>
  );
}
