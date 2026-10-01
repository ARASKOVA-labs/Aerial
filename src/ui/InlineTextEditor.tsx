// ── Inline text editor ───────────────────────────────────────────────────────
// Excalidraw-style WYSIWYG editing: a transparent textarea sits exactly where
// the text will render, in the same font, size (× zoom) and themed colour.
// Enter adds a line; Escape, Ctrl/Cmd+Enter or clicking away commits.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface TextDraft {
  elementId: bigint | null;
  /** World position of the text box's top-left corner. */
  worldX: number;
  worldY: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export function InlineTextEditor({
  draft,
  screenX,
  screenY,
  zoom,
  displayColor,
  onCommit,
}: {
  draft: TextDraft;
  screenX: number;
  screenY: number;
  zoom: number;
  displayColor: string;
  onCommit: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(draft.text);
  const committed = useRef(false);
  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    onCommit(value);
  };

  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    // Focus after the pointer-up that created us, so the click doesn't blur it.
    const id = requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.width = '1px';
    t.style.height = '1px';
    t.style.width = `${Math.max(t.scrollWidth + 4, 8)}px`;
    t.style.height = `${t.scrollHeight}px`;
  }, [value, zoom, draft.fontSize, draft.fontFamily]);

  const size = draft.fontSize * zoom;
  return (
    <textarea
      ref={ref}
      className="ae-text-editor"
      value={value}
      wrap="off"
      spellCheck={false}
      dir="auto"
      aria-label="Text"
      style={{
        left: screenX,
        top: screenY + size * 0.08,
        fontSize: size,
        fontFamily: draft.fontFamily,
        color: displayColor,
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation(); // keep tool shortcuts from firing while typing
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
