// ── Command palette (⌘K) ─────────────────────────────────────────────────────
// A filterable list of commands the app hands in; it owns no actions itself.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  shortcut?: string;
  /** Extra words to match (e.g. "export png image"). */
  keywords?: string;
  onSelect: () => void;
}

/** Ranks a command for `q`: 0 = no match, higher = better. */
function score(c: PaletteCommand, q: string): number {
  const label = c.label.toLowerCase();
  if (label.startsWith(q)) return 3;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  if (`${label} ${c.group} ${c.keywords ?? ''}`.toLowerCase().includes(q)) return 1;
  return 0;
}

export function CommandPaletteModal({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands
      .map((c, i) => ({ c, s: score(c, q), i }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((r) => r.c);
  }, [commands, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: PaletteCommand | undefined) => {
    if (!c) return;
    onClose();
    c.onSelect();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Group headings follow the order commands arrive in.
  let lastGroup = '';
  return (
    <div className="ae-dialog-backdrop ae-palette-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ae-dialog ae-cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <input
          className="ae-cmdk__input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command or board name…"
          aria-label="Search commands"
          aria-controls="ae-cmdk-list"
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          role="combobox"
          aria-expanded="true"
        />
        <div className="ae-cmdk__list" id="ae-cmdk-list" role="listbox" ref={listRef}>
          {results.length === 0 && <p className="ae-cmdk__empty">No matching commands</p>}
          {results.map((c, i) => {
            const heading = !query.trim() && c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {heading && <div className="ae-menu-title">{heading}</div>}
                <button
                  type="button"
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  className="ae-menu-item"
                  onPointerMove={() => setActive(i)}
                  onClick={() => run(c)}
                >
                  {c.icon}
                  <span className="ae-menu-item__label">{c.label}</span>
                  {c.shortcut && <span className="ae-menu-item__hint">{c.shortcut}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <footer className="ae-cmdk__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to run
          </span>
          <span>
            <kbd>esc</kbd> to close
          </span>
        </footer>
      </div>
    </div>
  );
}
