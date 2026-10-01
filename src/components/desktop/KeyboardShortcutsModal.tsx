import { X, Command } from 'lucide-react';

export function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const quickNoteShortcuts = [
    { name: 'Quick Canvas (Instant Note)', keys: ['⌘', '⇧', 'N'] },
    { name: 'Quick Note (Alternative)', keys: ['⌘', 'J'] },
    { name: 'Spotlight Command Palette', keys: ['⌘', 'K'] },
    { name: 'Stamp Note to Main Canvas', keys: ['⌘', '↵'] },
    { name: 'Save Note as Board', keys: ['⌘', 'S'] },
  ];

  const boardShortcuts = [
    { name: 'Create New Canvas Board', keys: ['⌘', 'N'] },
    { name: 'Toggle Boards Drawer / Sidebar', keys: ['⌘', 'B'] },
    { name: 'Switch to Board 1 – 9', keys: ['⌘', '1..9'] },
    { name: 'Previous Canvas Board', keys: ['⌘', '['] },
    { name: 'Next Canvas Board', keys: ['⌘', ']'] },
    { name: 'Clear Canvas Board (Confirm)', keys: ['⌘', '⇧', '⌫'] },
  ];

  const fileShortcuts = [
    { name: 'Paste Screenshot from Clipboard', keys: ['⌘', 'V'] },
    { name: 'Drag & Drop Screenshot / Image', keys: ['Drop', 'PNG'] },
    { name: 'Export PNG Image / Save', keys: ['⌘', 'S'] },
    { name: 'Export Vector SVG', keys: ['⌘', '⇧', 'S'] },
    { name: 'Import Image', keys: ['⌘', 'O'] },
    { name: 'Import PDF Document', keys: ['⌘', '⇧', 'O'] },
    { name: 'Toggle Fullscreen Mode', keys: ['⌃', '⌘', 'F'] },
    { name: 'Reset View (100%)', keys: ['⌘', '0'] },
    { name: 'Zoom In', keys: ['⌘', '+'] },
    { name: 'Zoom Out', keys: ['⌘', '-'] },
    { name: 'Undo Operation', keys: ['⌘', 'Z'] },
    { name: 'Redo Operation', keys: ['⌘', '⇧', 'Z'] },
    { name: 'Color & Tool Settings', keys: ['⌘', ','] },
  ];

  const toolShortcuts = [
    { name: 'Select Tool', keys: ['V', '1'] },
    { name: 'Pan / Hand Tool', keys: ['H', '2'] },
    { name: 'Rectangle Shape', keys: ['R', '3'] },
    { name: 'Ellipse Shape', keys: ['O', '4'] },
    { name: 'Line Shape', keys: ['L', '5'] },
    { name: 'Arrow Shape', keys: ['A', '6'] },
    { name: 'Draw / Freehand Pen', keys: ['P', '7'] },
    { name: 'Text Tool', keys: ['T', '8'] },
    { name: 'Eraser (cycles mode)', keys: ['E', '9'] },
    { name: 'Calligraphy Fountain Pen', keys: ['F'] },
    { name: 'Highlighter', keys: ['M'] },
    { name: 'Magic Pen (AI Handwriting)', keys: ['W'] },
    { name: 'Laser Pen (Transient Glow)', keys: ['Z'] },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-150 p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#e73f07]/10 flex items-center justify-center">
              <Command className="w-5 h-5 text-[#e73f07]" />
            </div>
            <div>
              <h2 className="text-base font-sans font-black uppercase tracking-wider text-[var(--foreground)]">Mac Desktop Shortcuts</h2>
              <p className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase tracking-wider">Fast muscle-memory controls & instant note-taking</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--accent)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-[var(--muted-foreground)]" />
          </button>
        </div>

        <div className="overflow-y-auto pr-1 flex flex-col gap-5 text-xs font-mono">
          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#e73f07] font-bold mb-2.5">⚡ Instant Note & Quick Canvas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickNoteShortcuts.map(item => (
                <div key={item.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                  <span className="text-[var(--foreground)] font-medium font-sans text-xs">{item.name}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono font-bold text-[#e73f07] shadow-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#e73f07] font-bold mb-2.5">📋 Board Management & Navigation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {boardShortcuts.map(item => (
                <div key={item.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                  <span className="text-[var(--foreground)] font-medium font-sans text-xs">{item.name}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono font-bold text-[var(--foreground)] shadow-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#e73f07] font-bold mb-2.5">💾 File Operations & Viewport</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {fileShortcuts.map(item => (
                <div key={item.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                  <span className="text-[var(--foreground)] font-medium font-sans text-xs">{item.name}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono font-bold text-[var(--foreground)] shadow-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#e73f07] font-bold mb-2.5">✏️ Drawing Tools & Pens</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {toolShortcuts.map(item => (
                <div key={item.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                  <span className="text-[var(--foreground)] font-medium font-sans text-xs">{item.name}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono font-bold text-[var(--foreground)] shadow-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-[var(--border)] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#e73f07] hover:bg-[#d03806] text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all active:translate-y-px shadow-md shadow-[#e73f07]/20 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mermaid / AI Studio Dialog ───────────────────────────────────────────────

// ── Mermaid & Diagram Studio Modal ─────────────────────────────────────────
