// ── Aerial Canvas — Quick Canvas (Instant Note Taking) ──────────────────────
// High-performance shortcut-driven instant scratchpad with dual Ink/Sketch & Markdown Note modes.
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
  PlusSquare,
  ListTodo,
  Clock,
  Code2,
} from 'lucide-react';
import { AerialCanvas } from './AerialCanvas';
import type { AerialCanvasRef, ToolId } from '../lib/types';
import { createLogger } from '../lib/logger';

const logger = createLogger('QuickCanvasModal');

export interface QuickCanvasModalProps {
  isDarkMode: boolean;
  onClose: () => void;
  onStampSketch: (pngBlob: Blob) => void;
  onStampText: (text: string) => void;
  onSaveAsBoard: (name: string, canvasState?: Uint8Array, textContent?: string) => void;
}

export function QuickCanvasModal({
  isDarkMode,
  onClose,
  onStampSketch,
  onStampText,
  onSaveAsBoard,
}: QuickCanvasModalProps) {
  const [activeTab, setActiveTab] = useState<'sketch' | 'text'>('sketch');
  const [activeTool, setActiveTool] = useState<ToolId>('freedraw');
  const [strokeColor, setStrokeColor] = useState('#e73f07');
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const eraserSize = 24;
  const [textContent, setTextContent] = useState(() => {
    return localStorage.getItem('aerial_quick_note_text') || '';
  });
  const [copied, setCopied] = useState(false);
  const [stamped, setStamped] = useState(false);

  const canvasRef = useRef<AerialCanvasRef>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore sketch from localStorage
  useEffect(() => {
    const savedSketch = localStorage.getItem('aerial_quick_note_state');
    if (savedSketch && canvasRef.current) {
      try {
        const bytes = Uint8Array.from(atob(savedSketch), c => c.charCodeAt(0));
        canvasRef.current.importFullState(bytes);
      } catch (e) {
        logger.error('Failed to restore quick sketch:', e);
      }
    }
  }, []);

  // Autosave text
  useEffect(() => {
    localStorage.setItem('aerial_quick_note_text', textContent);
  }, [textContent]);

  // Periodic autosave for sketch
  useEffect(() => {
    const interval = setInterval(() => {
      if (canvasRef.current && activeTab === 'sketch') {
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
  }, [activeTab]);

  // Handle Stamp to Main Canvas
  const handleStamp = useCallback(async () => {
    if (activeTab === 'sketch') {
      if (!canvasRef.current) return;
      try {
        const blob = await canvasRef.current.exportPngBlob();
        onStampSketch(blob);
        setStamped(true);
        setTimeout(() => setStamped(false), 2000);
      } catch (err) {
        logger.error('Failed to stamp sketch to canvas:', err);
      }
    } else {
      if (!textContent.trim()) return;
      onStampText(textContent.trim());
      setStamped(true);
      setTimeout(() => setStamped(false), 2000);
    }
  }, [activeTab, textContent, onStampSketch, onStampText]);

  // Handle Promote to Board
  const handlePromoteToBoard = useCallback(() => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const boardName = `Quick Note (${timeStr})`;

    if (activeTab === 'sketch' && canvasRef.current) {
      const state = canvasRef.current.exportFullState();
      onSaveAsBoard(boardName, state, undefined);
    } else {
      onSaveAsBoard(boardName, undefined, textContent);
    }
    onClose();
  }, [activeTab, textContent, onSaveAsBoard, onClose]);

  // Handle Copy PNG to clipboard
  const handleCopyPng = useCallback(async () => {
    if (activeTab === 'sketch' && canvasRef.current) {
      try {
        const blob = await canvasRef.current.exportPngBlob();
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        logger.error('Failed to copy quick canvas PNG:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(textContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        logger.error('Failed to copy quick note text:', err);
      }
    }
  }, [activeTab, textContent]);

  // Handle Clear
  const handleClear = useCallback(() => {
    if (activeTab === 'sketch') {
      canvasRef.current?.clearBoard();
      localStorage.removeItem('aerial_quick_note_state');
    } else {
      setTextContent('');
      localStorage.removeItem('aerial_quick_note_text');
    }
  }, [activeTab]);

  // Text markdown helper actions
  const insertTextPrefix = useCallback((prefix: string) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    const nextVal = val.substring(0, start) + prefix + val.substring(end);
    setTextContent(nextVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  }, []);

  // Keyboard shortcut handler inside Quick Canvas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key === 'Enter') {
        e.preventDefault();
        handleStamp();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handlePromoteToBoard();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStamp, handlePromoteToBoard, onClose]);

  const paletteColors = ['#e73f07', '#f3f3f2', '#06b6d4', '#10b981', '#f59e0b', '#a855f7'];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0a0a0a]/75 backdrop-blur-md pointer-events-auto p-4 animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-4xl h-[80vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
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
                Quick Canvas // Instant Note
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase bg-[#e73f07]/15 text-[#e73f07] border border-[#e73f07]/30">
              ⌘⇧N
            </span>
            <span className="hidden sm:inline-flex text-[9px] font-mono text-[var(--muted-foreground)]">
              ● Autosaved
            </span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--secondary)] border border-[var(--border)]">
            <button
              onClick={() => setActiveTab('sketch')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'sketch'
                  ? 'bg-[#e73f07] text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Pen className="w-3 h-3" />
              Sketch / Ink
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'text'
                  ? 'bg-[#e73f07] text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Type className="w-3 h-3" />
              Quick Text
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--accent)] transition-colors cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="Close Quick Canvas (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Sub-Toolbar for Sketch or Text ── */}
        {activeTab === 'sketch' ? (
          <div
            className={`flex items-center justify-between px-4 py-2 border-b shrink-0 text-xs ${
              isDarkMode ? 'border-[#2a2a2a] bg-[#141414]' : 'border-[#e5e5e5] bg-[#fafafa]'
            }`}
          >
            {/* Tools */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setActiveTool('freedraw'); canvasRef.current?.setTool('freedraw'); }}
                title="Pen"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTool === 'freedraw' ? 'bg-[#e73f07] text-white' : 'hover:bg-[var(--accent)] text-[var(--foreground)]/80'
                }`}
              >
                <Pen className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setActiveTool('highlighter'); canvasRef.current?.setTool('highlighter'); }}
                title="Highlighter"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTool === 'highlighter' ? 'bg-[#e73f07] text-white' : 'hover:bg-[var(--accent)] text-[var(--foreground)]/80'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setActiveTool('magic_pen'); canvasRef.current?.setTool('magic_pen'); }}
                title="Magic Pen (AI Handwriting)"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTool === 'magic_pen' ? 'bg-[#e73f07] text-white' : 'hover:bg-[var(--accent)] text-[var(--foreground)]/80'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setActiveTool('text'); canvasRef.current?.setTool('text'); }}
                title="Text"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTool === 'text' ? 'bg-[#e73f07] text-white' : 'hover:bg-[var(--accent)] text-[var(--foreground)]/80'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setActiveTool('eraser'); canvasRef.current?.setTool('eraser'); }}
                title="Eraser"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTool === 'eraser' ? 'bg-[#e73f07] text-white' : 'hover:bg-[var(--accent)] text-[var(--foreground)]/80'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Colors */}
            <div className="flex items-center gap-1.5">
              {paletteColors.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setStrokeColor(c);
                    canvasRef.current?.setStrokeColor?.(c);
                  }}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                    strokeColor === c ? 'border-[#e73f07] ring-2 ring-[#e73f07]/40 scale-110' : 'border-white/20'
                  }`}
                />
              ))}
            </div>

            {/* Sizes */}
            <div className="flex items-center gap-1">
              {[2, 5, 10].map((sz) => (
                <button
                  key={sz}
                  onClick={() => {
                    setStrokeWidth(sz);
                    canvasRef.current?.setStrokeWidth?.(sz);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                    strokeWidth === sz
                      ? 'bg-[var(--foreground)] text-[var(--background)]'
                      : 'hover:bg-[var(--accent)] text-[var(--muted-foreground)]'
                  }`}
                >
                  {sz}px
                </button>
              ))}
            </div>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => canvasRef.current?.undo?.()}
                title="Undo"
                className="p-1.5 rounded-lg hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <Undo className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => canvasRef.current?.redo?.()}
                title="Redo"
                className="p-1.5 rounded-lg hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <Redo className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`flex items-center gap-2 px-4 py-2 border-b shrink-0 text-xs ${
              isDarkMode ? 'border-[#2a2a2a] bg-[#141414]' : 'border-[#e5e5e5] bg-[#fafafa]'
            }`}
          >
            <button
              onClick={() => insertTextPrefix('- ')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-[10px] font-mono font-bold cursor-pointer"
            >
              <PlusSquare className="w-3 h-3 text-[#e73f07]" />
              Bullet
            </button>
            <button
              onClick={() => insertTextPrefix('- [ ] ')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-[10px] font-mono font-bold cursor-pointer"
            >
              <ListTodo className="w-3 h-3 text-[#e73f07]" />
              Checklist
            </button>
            <button
              onClick={() => {
                const now = new Date();
                const ts = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}] `;
                insertTextPrefix(ts);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-[10px] font-mono font-bold cursor-pointer"
            >
              <Clock className="w-3 h-3 text-[#e73f07]" />
              Timestamp
            </button>
            <button
              onClick={() => insertTextPrefix('```\n\n```')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-[10px] font-mono font-bold cursor-pointer"
            >
              <Code2 className="w-3 h-3 text-[#e73f07]" />
              Code Block
            </button>
          </div>
        )}

        {/* ── Main Content Area ── */}
        <div className="flex-1 relative overflow-hidden">
          {activeTab === 'sketch' ? (
            <div className="w-full h-full relative">
              <AerialCanvas
                ref={canvasRef}
                theme={isDarkMode ? 'dark' : 'light'}
                showToolbar={false}
                eraserSize={eraserSize}
              />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Type instant notes, thoughts, tasks, code snippets here... (Auto-saved)"
              className={`w-full h-full p-6 outline-none font-mono text-sm leading-relaxed resize-none ${
                isDarkMode ? 'bg-[#0e0e0e] text-[#f3f3f2]' : 'bg-[#ffffff] text-[#0a0a0a]'
              }`}
            />
          )}
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
              onClick={handleCopyPng}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--accent)] text-[var(--foreground)] text-xs font-mono font-bold transition-colors cursor-pointer"
              title="Copy to Clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : activeTab === 'sketch' ? 'Copy PNG' : 'Copy Text'}
            </button>
          </div>

          <div className="flex items-center gap-2">
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
              title="Stamp onto the current active canvas (⌘↵)"
            >
              <ArrowRightCircle className="w-4 h-4" />
              {stamped ? 'Stamped!' : 'Stamp to Main (⌘↵)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
