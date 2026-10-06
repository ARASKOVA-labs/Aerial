// ── Pointer input: mouse, pen, touch, pinch, wheel ───────────────────────────

import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { AerialCanvasProps } from '../../lib/types';
import { parseElement, type ElementJson } from './element';
import type { CanvasCore } from './useCanvasCore';
import { MAGIC_IDLE_MS } from './useMagicPen';

type Point = { x: number; y: number };
type InputProps = Pick<AerialCanvasProps, 'onCanvasPointerDown' | 'onNodeDoubleClick' | 'onToolChange'>;

const pressureOf = (e: PointerEvent | ReactPointerEvent) => (e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : -1);
/** Pinch distance change (px) before it counts as zoom rather than pan. */
const PINCH_SLOP = 3;
const PINCH_ZOOM_GAIN = 1.5;

export function usePointerInput(
  core: CanvasCore,
  props: InputProps,
  text: { open: (el: ElementJson | null, worldX?: number, worldY?: number) => void },
  convertMagic: () => Promise<unknown>,
) {
  const { canvasRef, engineRef, eraserCursorRef, toolRef, styleRef, draftRef, palmRejectionRef, drawingPointerRef, magicTimerRef, engineReady, readOnly } = core;
  const { cancelMagicTimer, updateZoom, bumpView, setActiveTool, syncUi } = core;
  const { onCanvasPointerDown, onNodeDoubleClick, onToolChange } = props;
  const activePenId = useRef<number | null>(null);
  const touches = useRef(new Map<number, Point>());
  const pinchDist = useRef<number | null>(null);
  const pinchCenter = useRef<Point | null>(null);

  const local = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    },
    [canvasRef],
  );

  const moveEraserCursor = useCallback(
    (p: Point) => {
      const c = eraserCursorRef.current;
      if (!c) return;
      const size = styleRef.current.eraserSize;
      c.style.transform = `translate3d(${p.x - size / 2}px, ${p.y - size / 2}px, 0)`;
      c.style.opacity = '1';
    },
    [eraserCursorRef, styleRef],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (onCanvasPointerDown?.()) return; // host consumed it (dismissed a popover)
      const engine = engineRef.current;
      if (!engine) return;
      // Clicking away from the inline editor commits it, like Excalidraw.
      if (draftRef.current) {
        e.preventDefault();
        // Blur the editor itself (it commits on blur), even if it lost focus.
        const editor = canvasRef.current?.parentElement?.querySelector<HTMLTextAreaElement>('textarea.ae-text-editor');
        if (editor && document.activeElement !== editor) editor.focus();
        (editor ?? (document.activeElement as HTMLElement | null))?.blur?.();
        return;
      }
      const p = local(e);
      engine.set_modifiers(e.shiftKey, e.altKey);

      if (e.pointerType === 'touch') {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.current.size === 2) {
          const [a, b] = Array.from(touches.current.values());
          pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
          pinchCenter.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          // A second finger turns a one-finger stroke into a pinch.
          if (drawingPointerRef.current?.type === 'touch') {
            drawingPointerRef.current = null;
            engine.pointer_up(p.x, p.y);
          }
          return;
        }
        if (palmRejectionRef.current && toolRef.current !== 'hand') return;
      }

      // Pens win over the synthetic mouse events some drivers emit.
      if (e.pointerType === 'mouse' && activePenId.current !== null) return;
      if (e.pointerType === 'pen') activePenId.current = e.pointerId;
      if (drawingPointerRef.current !== null) return;
      if (readOnly && toolRef.current !== 'hand') return;
      if (e.button === 1) return; // middle button: reserved

      cancelMagicTimer();
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // capture can fail if the pointer is already gone
      }

      if (toolRef.current === 'text') {
        const hit = parseElement(engine.get_element_at?.(p.x, p.y));
        if (hit?.kind === 'Text') text.open(hit);
        else text.open(null, engine.screen_to_world_x(p.x), engine.screen_to_world_y(p.y));
        return;
      }

      drawingPointerRef.current = { id: e.pointerId, type: e.pointerType };
      engine.pointer_down(p.x, p.y, pressureOf(e));
      if (toolRef.current === 'hand' && canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    },
    [onCanvasPointerDown, engineRef, draftRef, local, drawingPointerRef, palmRejectionRef, toolRef, readOnly, cancelMagicTimer, text, canvasRef],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const engine = engineRef.current;
      if (!engine) return;
      const p = local(e);
      if (toolRef.current === 'eraser') moveEraserCursor(p);

      if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.current.size === 2) {
          const [a, b] = Array.from(touches.current.values());
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const c = local({ clientX: center.x, clientY: center.y });
          const last = pinchCenter.current;
          if (last) {
            const start = pinchDist.current;
            if (start && Math.abs(dist - start) > PINCH_SLOP) {
              updateZoom(engine.on_wheel(0, (start - dist) * PINCH_ZOOM_GAIN, true, c.x, c.y));
              pinchDist.current = dist;
            }
            const dx = last.x - center.x;
            const dy = last.y - center.y;
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) engine.on_wheel(dx, dy, false, c.x, c.y);
          }
          pinchCenter.current = center;
          return;
        }
      }

      const active = drawingPointerRef.current;
      if (!active) {
        // Hover feedback for the selection tool (move / resize cursors).
        if (toolRef.current === 'select' && e.pointerType !== 'touch' && canvasRef.current) canvasRef.current.style.cursor = engine.get_cursor(p.x, p.y);
        return;
      }
      if (active.id !== e.pointerId) return;
      engine.set_modifiers(e.shiftKey, e.altKey);
      // Coalesced events keep fast strokes smooth on high-rate digitisers.
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      if (events.length > 1) {
        for (const ce of events) {
          const q = local(ce);
          engine.pointer_move(q.x, q.y, pressureOf(ce));
        }
      } else {
        engine.pointer_move(p.x, p.y, pressureOf(e));
      }
      if (toolRef.current === 'hand') bumpView();
    },
    [engineRef, local, toolRef, moveEraserCursor, updateZoom, bumpView, drawingPointerRef, canvasRef],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === 'touch') {
        touches.current.delete(e.pointerId);
        if (touches.current.size < 2) {
          pinchDist.current = null;
          pinchCenter.current = null;
        }
      }
      if (e.pointerType === 'pen' && e.pointerId === activePenId.current) activePenId.current = null;
      if (drawingPointerRef.current?.id !== e.pointerId) return;
      drawingPointerRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
      const engine = engineRef.current;
      if (!engine) return;
      const p = local(e);
      engine.set_modifiers(e.shiftKey, e.altKey);
      engine.pointer_up(p.x, p.y);

      if (engine.take_tool_switch() === 'select') {
        setActiveTool('select');
        toolRef.current = 'select';
        onToolChange?.('select');
      }
      if (toolRef.current === 'hand' && canvasRef.current) canvasRef.current.style.cursor = 'grab';
      if (toolRef.current === 'magic_pen') {
        cancelMagicTimer();
        magicTimerRef.current = setTimeout(() => void convertMagic(), MAGIC_IDLE_MS);
      }
      syncUi();
    },
    [drawingPointerRef, engineRef, local, setActiveTool, cancelMagicTimer, syncUi, toolRef, onToolChange, canvasRef, magicTimerRef, convertMagic],
  );

  const onPointerLeave = useCallback(() => {
    if (eraserCursorRef.current) eraserCursorRef.current.style.opacity = '0';
  }, [eraserCursorRef]);

  const onDoubleClick = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      const engine = engineRef.current;
      if (!engine || readOnly || toolRef.current !== 'select' || draftRef.current) return;
      const p = local(e);
      const hit = parseElement(engine.get_element_at?.(p.x, p.y));
      if (hit?.kind === 'Text') return text.open(hit);
      const hitId = engine.on_double_click(p.x, p.y);
      if (hitId) {
        const [elId, nodeId] = hitId.split(',');
        if (nodeId && onNodeDoubleClick) {
          const id = BigInt(elId);
          onNodeDoubleClick(id, nodeId, engine.get_element_code(id));
        }
        syncUi();
        return;
      }
      // Double-click on empty canvas starts a text box (Excalidraw).
      text.open(null, engine.screen_to_world_x(p.x), engine.screen_to_world_y(p.y));
    },
    [engineRef, readOnly, toolRef, draftRef, local, text, onNodeDoubleClick, syncUi],
  );

  // Wheel: native listener so preventDefault works (React's is passive).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engineReady) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const engine = engineRef.current;
      if (!engine) return;
      const p = local(e);
      const ctrl = e.ctrlKey || e.metaKey;
      // Shift+wheel scrolls horizontally on mice without a horizontal wheel.
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      const z = engine.on_wheel(dx * scale, dy * scale, ctrl, p.x, p.y);
      if (ctrl) updateZoom(z);
      else bumpView();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [canvasRef, engineReady, engineRef, local, updateZoom, bumpView]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onDoubleClick };
}
