// ── Pointer input: mouse, pen, touch, pinch, wheel ───────────────────────────
//
// One pointer drives a gesture at a time. The hard part is not the happy path
// but everything that can interrupt it: a pointer-up that never arrives (the
// window lost focus, capture was taken away, a pen left the digitiser), a
// second finger turning a stroke into a pinch, a palm landing while the pen
// writes. Each of those must leave the canvas usable and the ink sensible —
// never a tool that silently stops responding.

import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { AerialCanvasProps, ToolId } from '../../lib/types';
import { parseElement, type ElementJson } from './element';
import type { CanvasCore } from './useCanvasCore';
import { MAGIC_IDLE_MS } from './useMagicPen';

type Point = { x: number; y: number };
type InputProps = Pick<AerialCanvasProps, 'onCanvasPointerDown' | 'onNodeDoubleClick' | 'onToolChange'>;
/** How a gesture ends: a real pointer-up, a lost one, or abandoned outright. */
type End = 'up' | 'finish' | 'cancel';

/**
 * Pen pressure exactly as reported — including 0, which many styluses send on
 * first contact — or -1 when the device has none. The engine decides from the
 * whole stroke whether the readings are real.
 */
const pressureOf = (e: PointerEvent | ReactPointerEvent) => (e.pointerType === 'pen' ? e.pressure : -1);
/** Pinch distance change (px) before it counts as zoom rather than pan. */
const PINCH_SLOP = 3;
const PINCH_ZOOM_GAIN = 1.5;
/** A pen silent for this long no longer suppresses mouse input. */
const PEN_QUIET_MS = 700;
/** Pointer `button` values. */
const MIDDLE = 1;
const PEN_ERASER = 5;

export function usePointerInput(
  core: CanvasCore,
  props: InputProps,
  text: { open: (el: ElementJson | null, worldX?: number, worldY?: number) => void },
  convertMagic: () => Promise<unknown>,
) {
  const { canvasRef, engineRef, eraserCursorRef, toolRef, styleRef, draftRef, palmRejectionRef, drawingPointerRef, magicTimerRef, engineReady, readOnly } = core;
  const { cancelMagicTimer, updateZoom, bumpView, setActiveTool, syncUi, applyTool } = core;
  const { onCanvasPointerDown, onNodeDoubleClick, onToolChange } = props;
  /** Last time a pen produced an event: pens win over the synthetic mouse events some drivers emit. */
  const penSeenAt = useRef(-Infinity);
  /** Whether a pen has ever been used here; until then a finger may draw. */
  const penUsed = useRef(false);
  const touches = useRef(new Map<number, Point>());
  const pinchDist = useRef<number | null>(null);
  const pinchCenter = useRef<Point | null>(null);
  /** Tool to return to after the pen's eraser end was used. */
  const restoreTool = useRef<ToolId | null>(null);
  /** Cursor to put back after a middle-button pan (null when not panning). */
  const panCursor = useRef<string | null>(null);
  /** Canvas position, cached so a 240 Hz pen does not force layout per sample. */
  const rect = useRef<DOMRect | null>(null);

  const local = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const r = (rect.current ??= canvasRef.current?.getBoundingClientRect() ?? null);
      return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
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

  /** Ends the gesture in progress and puts tools, cursor and UI back in order. */
  const endGesture = useCallback(
    (how: End, at?: Point) => {
      const active = drawingPointerRef.current;
      if (!active) return;
      drawingPointerRef.current = null;
      const canvas = canvasRef.current;
      try {
        canvas?.releasePointerCapture(active.id);
      } catch {
        // already released
      }
      const engine = engineRef.current;
      if (!engine) return;
      if (how === 'cancel') engine.pointer_cancel();
      else if (how === 'up' && at) engine.pointer_up(at.x, at.y);
      else engine.pointer_finish();

      const switched = engine.take_tool_switch();
      const restore = restoreTool.current;
      restoreTool.current = null;
      if (restore) {
        applyTool(restore, false);
      } else if (switched === 'select') {
        setActiveTool('select');
        toolRef.current = 'select';
        onToolChange?.('select');
      }
      if (panCursor.current !== null && canvas) canvas.style.cursor = panCursor.current;
      else if (toolRef.current === 'hand' && canvas) canvas.style.cursor = 'grab';
      panCursor.current = null;
      if (toolRef.current === 'magic_pen' && how !== 'cancel') {
        cancelMagicTimer();
        magicTimerRef.current = setTimeout(() => void convertMagic(), MAGIC_IDLE_MS);
      }
      syncUi();
    },
    [drawingPointerRef, canvasRef, engineRef, applyTool, setActiveTool, toolRef, onToolChange, cancelMagicTimer, magicTimerRef, convertMagic, syncUi],
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
      rect.current = null; // layout may have changed since the last gesture
      const p = local(e);
      engine.set_modifiers(e.shiftKey, e.altKey);

      if (e.pointerType === 'pen') {
        penSeenAt.current = e.timeStamp;
        penUsed.current = true;
      }

      if (e.pointerType === 'touch') {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.current.size === 2) {
          const [a, b] = Array.from(touches.current.values());
          pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
          pinchCenter.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          // A second finger means the first was the start of a pinch, not a
          // stroke: drop what it drew instead of leaving a stray mark.
          if (drawingPointerRef.current?.type === 'touch') endGesture('cancel');
          return;
        }
        if (touches.current.size > 2) return;
        // Palm rejection: once a pen is in use, a lone touch is a resting hand.
        if (palmRejectionRef.current && penUsed.current && toolRef.current !== 'hand') return;
      }

      const active = drawingPointerRef.current;
      if (active) {
        if (active.id === e.pointerId) {
          // A new press from a pointer we believed was still down: its
          // pointer-up was lost. Finish that gesture and start afresh.
          endGesture('finish');
        } else if (active.type === 'touch' && e.pointerType === 'pen') {
          endGesture('cancel'); // the touch was a palm arriving before the pen
        } else {
          return; // one gesture at a time
        }
      }

      // Pens win over the synthetic mouse events some drivers emit alongside.
      if (e.pointerType === 'mouse' && e.timeStamp - penSeenAt.current < PEN_QUIET_MS) return;

      // Buttons: left draws; middle pans whatever the tool; the pen's eraser
      // end erases; right (context menu) and the rest do nothing.
      let temporary: ToolId | null = null;
      let pan = false;
      if (e.pointerType === 'mouse') {
        if (e.button === MIDDLE) pan = true;
        else if (e.button !== 0) return;
      } else if (e.pointerType === 'pen' && (e.button === PEN_ERASER || (e.buttons & 32) !== 0)) {
        temporary = 'eraser';
      }
      if (readOnly && toolRef.current !== 'hand' && !pan) return;

      cancelMagicTimer();
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // capture can fail if the pointer is already gone
      }

      if (pan) {
        // Pans without touching the active tool or the selection.
        drawingPointerRef.current = { id: e.pointerId, type: e.pointerType };
        engine.pan_begin(p.x, p.y);
        if (canvasRef.current) {
          panCursor.current = canvasRef.current.style.cursor;
          canvasRef.current.style.cursor = 'grabbing';
        }
        return;
      }
      if (temporary && temporary !== toolRef.current) {
        restoreTool.current = toolRef.current;
        applyTool(temporary, false);
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
      if (toolRef.current === 'eraser') moveEraserCursor(p);
    },
    [onCanvasPointerDown, engineRef, draftRef, local, drawingPointerRef, palmRejectionRef, toolRef, readOnly, cancelMagicTimer, text, canvasRef, endGesture, applyTool, moveEraserCursor],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (e.pointerType === 'pen') penSeenAt.current = e.timeStamp;
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
      // Moving with no button held means the release happened where we could
      // not see it (outside the window, during a system dialog).
      if (e.buttons === 0 && e.pointerType !== 'touch') {
        endGesture('finish');
        return;
      }
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
      if (toolRef.current === 'hand' || panCursor.current !== null) bumpView();
    },
    [engineRef, local, toolRef, moveEraserCursor, updateZoom, bumpView, drawingPointerRef, canvasRef, endGesture],
  );

  const forgetTouch = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'touch') return;
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) {
      pinchDist.current = null;
      pinchCenter.current = null;
    }
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      forgetTouch(e);
      if (drawingPointerRef.current?.id !== e.pointerId) return;
      engineRef.current?.set_modifiers(e.shiftKey, e.altKey);
      endGesture('up', local(e));
    },
    [forgetTouch, drawingPointerRef, engineRef, endGesture, local],
  );

  /**
   * The system took the pointer away. For touch that is nearly always a
   * gesture takeover or palm rejection, so the mark is dropped; for a pen or
   * mouse the ink is kept — losing a long stroke is worse than undoing one.
   */
  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      forgetTouch(e);
      if (drawingPointerRef.current?.id !== e.pointerId) return;
      endGesture(e.pointerType === 'touch' ? 'cancel' : 'finish');
    },
    [forgetTouch, drawingPointerRef, endGesture],
  );

  /** Capture ended without a pointer-up reaching us: finish where we are. */
  const onLostPointerCapture = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (drawingPointerRef.current?.id === e.pointerId) endGesture('finish');
    },
    [drawingPointerRef, endGesture],
  );

  const onPointerLeave = useCallback(() => {
    if (eraserCursorRef.current) eraserCursorRef.current.style.opacity = '0';
  }, [eraserCursorRef]);

  /** Stops the browser's middle-click autoscroll; the middle button pans here. */
  const onMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button === MIDDLE) e.preventDefault();
  }, []);

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

  // When the window loses focus mid-gesture no pointer-up or key-up follows:
  // finish the gesture and drop held modifiers, or the next stroke would start
  // with Alt "still down" (erasing would restore, shapes grow from the centre).
  useEffect(() => {
    const release = () => {
      endGesture('finish');
      touches.current.clear();
      pinchDist.current = null;
      pinchCenter.current = null;
      penSeenAt.current = -Infinity;
      engineRef.current?.set_modifiers(false, false);
    };
    const onVisibility = () => document.visibilityState === 'hidden' && release();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [endGesture, engineRef]);

  // The cached canvas position is stale after any scroll or resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const invalidate = () => {
      rect.current = null;
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(canvas);
    window.addEventListener('resize', invalidate);
    window.addEventListener('scroll', invalidate, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate, true);
    };
  }, [canvasRef]);

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

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture, onPointerLeave, onMouseDown, onDoubleClick };
}
