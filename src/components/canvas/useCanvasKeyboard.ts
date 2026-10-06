// ── Canvas keyboard map: tools, edit commands, nudging, view ─────────────────

import { useEffect, useRef } from 'react';
import type { ToolId } from '../../lib/types';
import { isPen, MAIN_TOOLS } from '../../ui/model';
import { isEditable, parseElement, type ElementJson } from './element';
import type { CanvasCore } from './useCanvasCore';

type ToolKey = ToolId | 'image' | 'pen';

/** Single-key tool shortcuts (letters and the toolbar's number hints). */
const TOOL_KEYS: Record<string, ToolKey> = (() => {
  const keys: Record<string, ToolKey> = { x: 'pen', k: 'laser_pen', w: 'magic_pen' };
  for (const t of MAIN_TOOLS) {
    const id: ToolKey = t.id === 'freedraw' ? 'pen' : (t.id as ToolId);
    if (t.key) keys[t.key.toLowerCase()] = id;
    if (t.num) keys[t.num] = id;
  }
  return keys;
})();

const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function useCanvasKeyboard(core: CanvasCore, actions: { insertImage: () => void; onHelp?: () => void; openText: (el: ElementJson | null) => void }) {
  // Always use the latest state and handlers without re-binding listeners.
  const ref = useRef({ core, actions });
  ref.current = { core, actions };
  const spaceTool = useRef<ToolId | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { core: c, actions: a } = ref.current;
      const engine = c.engineRef.current;
      if (!engine) return;
      engine.set_modifiers(e.shiftKey, e.altKey);
      if (isEditable(e.target) || c.draftRef.current || e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      const sel = c.selectionRef.current;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') return run(e.shiftKey ? c.redo : c.undo);
        if (key === 'y') return run(c.redo);
        if (key === '=' || key === '+') return run(c.zoomIn);
        if (key === '-') return run(c.zoomOut);
        if (key === '0') return run(c.resetView);
        if (c.readOnly) return;
        if (key === 'd' && sel.count > 0) return run(c.duplicateSelected);
        if (key === 'a') return run(c.selectAll);
        if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && sel.count > 0) {
          const fwd = e.code === 'BracketRight';
          return run(() => c.reorderSelected(e.shiftKey ? (fwd ? 'front' : 'back') : fwd ? 'forward' : 'backward'));
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat && c.toolRef.current !== 'hand' && !c.drawingPointerRef.current) {
          spaceTool.current = c.toolRef.current;
          c.applyTool('hand', false);
        }
        return;
      }
      if (e.key === '?') return a.onHelp && run(a.onHelp);
      if (e.key === 'Escape') return void (sel.count > 0 && c.act((en) => en.deselect()));
      if (c.readOnly) return;
      if (e.key === 'Delete' || e.key === 'Backspace') return void (sel.count > 0 && run(c.deleteSelected));
      if (e.key === 'Enter' && sel.count === 1 && sel.kinds[0] === 'Text') return run(() => a.openText(parseElement(engine.get_selected_element_json())));
      const nudge = NUDGE[e.key];
      if (nudge && sel.count > 0) {
        const step = e.shiftKey ? 5 : 1;
        return run(() => c.act((en) => en.nudge_selected(nudge[0] * step, nudge[1] * step)));
      }
      if (e.repeat || e.shiftKey) return;
      if (key === 'q') return c.toggleLock();
      const target = TOOL_KEYS[key];
      if (!target) return;
      e.preventDefault();
      if (target === 'image') a.insertImage();
      else if (target === 'pen') c.applyTool(isPen(c.toolRef.current) ? c.toolRef.current : c.styleRef.current.lastPen);
      else c.applyTool(target);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const c = ref.current.core;
      c.engineRef.current?.set_modifiers(e.shiftKey, e.altKey);
      if (e.key === ' ' && spaceTool.current) {
        const prev = spaceTool.current;
        spaceTool.current = null;
        c.applyTool(prev, false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
