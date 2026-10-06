// ── Inline text editing (create and edit text elements in place) ─────────────

import { useCallback, useMemo } from 'react';
import type { ElementJson } from './element';
import type { CanvasCore } from './useCanvasCore';

export function useTextEditing(core: CanvasCore) {
  const { engineRef, styleRef, draftRef, toolRef, lockedRef, setTextDraft, applyTool, syncUi } = core;

  /** Edits `el`, or starts a new text box at a world point. */
  const open = useCallback(
    (el: ElementJson | null, worldX?: number, worldY?: number) => {
      const e = engineRef.current;
      if (!e) return;
      const s = styleRef.current;
      if (el) {
        e.hide_element(BigInt(el.id));
        setTextDraft({
          elementId: BigInt(el.id),
          worldX: el.x,
          worldY: el.y,
          text: el.text ?? '',
          fontSize: el.font_size || s.fontSize,
          fontFamily: el.font_family || s.fontFamily,
          color: el.stroke_color || s.strokeColor,
        });
      } else if (worldX !== undefined && worldY !== undefined) {
        setTextDraft({ elementId: null, worldX, worldY: worldY - s.fontSize * 0.65, text: '', fontSize: s.fontSize, fontFamily: s.fontFamily, color: s.strokeColor });
      }
    },
    [engineRef, styleRef, setTextDraft],
  );

  const commit = useCallback(
    (text: string) => {
      const e = engineRef.current;
      const draft = draftRef.current;
      setTextDraft(null);
      draftRef.current = null;
      if (!e || !draft) return;
      e.show_all_elements();
      const value = text.replace(/\s+$/, '');
      if (draft.elementId != null) {
        if (!value.trim()) {
          e.set_selected_id(draft.elementId);
          e.delete_selected();
        } else {
          e.update_text_element(draft.elementId, value, draft.worldX, draft.worldY, draft.fontSize, draft.fontFamily, draft.color);
        }
      } else if (value.trim()) {
        e.add_text(value, draft.worldX, draft.worldY, draft.fontSize, draft.fontFamily, draft.color);
      }
      e.render();
      if (toolRef.current === 'text' && !lockedRef.current) applyTool('select');
      syncUi();
    },
    [engineRef, draftRef, toolRef, lockedRef, setTextDraft, applyTool, syncUi],
  );

  return useMemo(() => ({ open, commit }), [open, commit]);
}
