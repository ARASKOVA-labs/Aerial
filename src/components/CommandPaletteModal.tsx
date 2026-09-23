// ── Aerial Canvas — Spotlight Command Palette (⌘K) ─────────────────────────
// High-efficiency launcher for tools, board switching, actions, and diagram insertion.
// Strictly adheres to Araskova brutalist design standards (Roboto, Space Mono, zero Orbitron).

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Pen,
  Highlighter,
  Wand2,
  Zap,
  MousePointer2,
  Hand,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Type,
  Eraser,
  Code,
  Languages,
  Download,
  FileCode,
  Layout,
  Plus,
  Maximize2,
  Sun,
  Moon,
  Trash2,
  Keyboard,
  Sparkles,
  X,
} from 'lucide-react';
import type { DesktopToolId } from '../lib/types';

export interface CommandItem {
  id: string;
  title: string;
  category: 'Quick Note' | 'Tools' | 'Boards' | 'Actions';
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

export interface CommandPaletteModalProps {
  isDarkMode: boolean;
  onClose: () => void;
  onSelectTool: (tool: DesktopToolId) => void;
  onOpenQuickCanvas: () => void;
  onNewBoard: () => void;
  boards: Array<{ id: string; name: string }>;
  onSwitchBoard: (id: string) => void;
  onOpenDiagramModal: () => void;
  onOpenTranslatorModal: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onToggleFullscreen: () => void;
  onToggleTheme: () => void;
  onClearBoard: () => void;
  onOpenShortcuts: () => void;
}

export function CommandPaletteModal({
  isDarkMode,
  onClose,
  onSelectTool,
  onOpenQuickCanvas,
  onNewBoard,
  boards,
  onSwitchBoard,
  onOpenDiagramModal,
  onOpenTranslatorModal,
  onExportPng,
  onExportSvg,
  onToggleFullscreen,
  onToggleTheme,
  onClearBoard,
  onOpenShortcuts,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allItems: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: 'quick-canvas',
        title: 'Open Quick Canvas (Instant Note)',
        category: 'Quick Note',
        shortcut: '⌘⇧N',
        icon: Sparkles,
        onSelect: () => { onClose(); onOpenQuickCanvas(); },
      },
      {
        id: 'new-board',
        title: 'Create New Canvas Board',
        category: 'Boards',
        shortcut: '⌘N',
        icon: Plus,
        onSelect: () => { onClose(); onNewBoard(); },
      },
      // Boards
      ...boards.map((b) => ({
        id: `board-${b.id}`,
        title: `Switch to: ${b.name}`,
        category: 'Boards' as const,
        icon: Layout,
        onSelect: () => { onClose(); onSwitchBoard(b.id); },
      })),
      // Tools
      { id: 'tool-select', title: 'Select Tool', category: 'Tools', shortcut: 'V', icon: MousePointer2, onSelect: () => { onClose(); onSelectTool('select'); } },
      { id: 'tool-hand', title: 'Hand / Pan Canvas', category: 'Tools', shortcut: 'H', icon: Hand, onSelect: () => { onClose(); onSelectTool('hand'); } },
      { id: 'tool-freedraw', title: 'Pen / Freehand Draw', category: 'Tools', shortcut: 'P', icon: Pen, onSelect: () => { onClose(); onSelectTool('freedraw'); } },
      { id: 'tool-fountain', title: 'Calligraphy Fountain Pen', category: 'Tools', shortcut: 'F', icon: Pen, onSelect: () => { onClose(); onSelectTool('fountain'); } },
      { id: 'tool-highlighter', title: 'Highlighter', category: 'Tools', shortcut: 'M', icon: Highlighter, onSelect: () => { onClose(); onSelectTool('highlighter'); } },
      { id: 'tool-magic_pen', title: 'Magic Pen (AI Handwriting to Text)', category: 'Tools', shortcut: 'W', icon: Wand2, onSelect: () => { onClose(); onSelectTool('magic_pen'); } },
      { id: 'tool-laser_pen', title: 'Laser Pen (Transient Glow)', category: 'Tools', shortcut: 'Z', icon: Zap, onSelect: () => { onClose(); onSelectTool('laser_pen'); } },
      { id: 'tool-text', title: 'Text Box', category: 'Tools', shortcut: 'T', icon: Type, onSelect: () => { onClose(); onSelectTool('text'); } },
      { id: 'tool-eraser', title: 'Eraser', category: 'Tools', shortcut: 'E', icon: Eraser, onSelect: () => { onClose(); onSelectTool('eraser'); } },
      { id: 'tool-rect', title: 'Rectangle Shape', category: 'Tools', shortcut: 'R', icon: Square, onSelect: () => { onClose(); onSelectTool('rectangle'); } },
      { id: 'tool-ellipse', title: 'Ellipse / Circle Shape', category: 'Tools', shortcut: 'O', icon: Circle, onSelect: () => { onClose(); onSelectTool('ellipse'); } },
      { id: 'tool-line', title: 'Line Shape', category: 'Tools', shortcut: 'L', icon: Minus, onSelect: () => { onClose(); onSelectTool('line'); } },
      { id: 'tool-arrow', title: 'Arrow Shape', category: 'Tools', shortcut: 'A', icon: ArrowUpRight, onSelect: () => { onClose(); onSelectTool('arrow'); } },
      // Actions
      { id: 'action-diagram', title: 'Insert Mermaid Architecture Diagram', category: 'Actions', icon: Code, onSelect: () => { onClose(); onOpenDiagramModal(); } },
      { id: 'action-translate', title: 'Translate Text (AI Indian Languages)', category: 'Actions', icon: Languages, onSelect: () => { onClose(); onOpenTranslatorModal(); } },
      { id: 'action-export-png', title: 'Export Canvas as PNG Image', category: 'Actions', shortcut: '⌘S', icon: Download, onSelect: () => { onClose(); onExportPng(); } },
      { id: 'action-export-svg', title: 'Export Canvas as Vector SVG', category: 'Actions', shortcut: '⌘⇧S', icon: FileCode, onSelect: () => { onClose(); onExportSvg(); } },
      { id: 'action-fullscreen', title: 'Toggle Fullscreen Mode', category: 'Actions', shortcut: '⌃⌘F', icon: Maximize2, onSelect: () => { onClose(); onToggleFullscreen(); } },
      { id: 'action-theme', title: `Toggle ${isDarkMode ? 'Light' : 'Dark'} Theme`, category: 'Actions', icon: isDarkMode ? Sun : Moon, onSelect: () => { onClose(); onToggleTheme(); } },
      { id: 'action-clear', title: 'Clear Entire Canvas Board', category: 'Actions', shortcut: '⌘⌫', icon: Trash2, onSelect: () => { onClose(); onClearBoard(); } },
      { id: 'action-shortcuts', title: 'Show Keyboard Shortcuts Cheat Sheet', category: 'Actions', shortcut: '?', icon: Keyboard, onSelect: () => { onClose(); onOpenShortcuts(); } },
    ];
    return list;
  }, [boards, isDarkMode, onClose, onOpenQuickCanvas, onNewBoard, onSwitchBoard, onSelectTool, onOpenDiagramModal, onOpenTranslatorModal, onExportPng, onExportSvg, onToggleFullscreen, onToggleTheme, onClearBoard, onOpenShortcuts]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase().trim();
    return allItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle arrow navigation and enter
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].onSelect();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [filteredItems, selectedIndex, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 bg-[#0a0a0a]/75 backdrop-blur-md pointer-events-auto p-4 animate-in fade-in duration-100">
      <div
        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
          isDarkMode
            ? 'bg-[#111111] border-[#2a2a2a] text-[#f3f3f2]'
            : 'bg-[#ffffff] border-[#e5e5e5] text-[#0a0a0a]'
        }`}
      >
        {/* Search Input Bar */}
        <div
          className={`flex items-center gap-3 px-4 py-3.5 border-b ${
            isDarkMode ? 'border-[#2a2a2a] bg-[#0a0a0a]/80' : 'border-[#e5e5e5] bg-[#f8f9fa]'
          }`}
        >
          <Search className="w-4 h-4 text-[#e73f07] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, tool, or board name..."
            className="flex-1 bg-transparent outline-none font-mono text-sm placeholder:text-[var(--muted-foreground)]"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider bg-[var(--secondary)] border border-[var(--border)] text-[var(--muted-foreground)]">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 flex flex-col gap-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-[var(--muted-foreground)]">
              No matching commands or boards found.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-mono transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#e73f07] text-white shadow-xs'
                      : 'hover:bg-[var(--accent)] text-[var(--foreground)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[var(--secondary)] text-[var(--foreground)] border border-[var(--border)]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-sans font-medium text-xs tracking-tight truncate">
                      {item.title}
                    </span>
                    <span
                      className={`text-[9px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-black/20 text-white/90'
                          : 'bg-[var(--secondary)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      {item.category}
                    </span>
                  </div>

                  {item.shortcut && (
                    <kbd
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider ml-2 shrink-0 ${
                        isSelected
                          ? 'bg-black/25 text-white'
                          : 'bg-[var(--secondary)] text-[var(--muted-foreground)] border border-[var(--border)]'
                      }`}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div
          className={`flex items-center justify-between px-4 py-2 border-t text-[10px] font-mono text-[var(--muted-foreground)] ${
            isDarkMode ? 'border-[#2a2a2a] bg-[#0a0a0a]' : 'border-[#e5e5e5] bg-[#f8f9fa]'
          }`}
        >
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Dismiss</span>
          </div>
          <span>ARASKOVA SPOTLIGHT</span>
        </div>
      </div>
    </div>
  );
}
