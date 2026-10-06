// ── Canvas core: editor state, engine sync and the basic actions ─────────────
// Every other canvas hook receives this object, so state lives in one place.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AerialCanvasProps, AerialEngine, ToolId } from '../../lib/types';
import type { TextDraft } from '../../ui/InlineTextEditor';
import { EMPTY_SELECTION, isPen, type PenTool, type SelectionInfo, type UiStyle } from '../../ui/model';
import type { StyleChange } from '../../ui/PropertiesPanel';
import { parseElement } from './element';
import { engineStyleFor, loadUiStyle, saveUiStyle } from './uiStyle';

type CoreProps = Pick<AerialCanvasProps, 'readOnly' | 'onToolChange' | 'onSelectionChange' | 'onZoomChange' | 'onEraserTypeChange' | 'palmRejection'>;

const PEN_KINDS = ['FreeDraw', 'FountainPen', 'Marker', 'Highlighter'];

const SET_TOOL: Partial<Record<ToolId, (e: AerialEngine) => void>> = {
  freedraw: (e) => e.set_tool_freedraw(),
  fountain: (e) => e.set_tool_fountain_pen(),
  marker: (e) => e.set_tool_marker(),
  highlighter: (e) => e.set_tool_highlighter(),
  rectangle: (e) => e.set_tool_rectangle(),
  diamond: (e) => e.set_tool_diamond(),
  ellipse: (e) => e.set_tool_ellipse(),
  line: (e) => e.set_tool_line(),
  arrow: (e) => e.set_tool_arrow(),
  select: (e) => e.set_tool_select(),
  hand: (e) => e.set_tool_hand(),
  eraser: (e) => e.set_tool_eraser(),
  laser_pen: (e) => e.set_tool_laser_pen(),
  magic_pen: (e) => e.set_tool_magic_pen(),
  text: (e) => e.set_tool_text(),
};

export function useCanvasCore({ readOnly = false, onToolChange, onSelectionChange, onZoomChange, onEraserTypeChange, palmRejection = true }: CoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AerialEngine | null>(null);
  const eraserCursorRef = useRef<HTMLDivElement>(null);

  const [engineReady, setEngineReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [toolLocked, setToolLockedState] = useState(false);
  const [uiStyle, setUiStyle] = useState<UiStyle>(loadUiStyle);
  const [selection, setSelection] = useState<SelectionInfo>(EMPTY_SELECTION);
  const [diagramAccent, setDiagramAccent] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [, setViewTick] = useState(0);

  // Mirrors for event handlers that must not be re-created on every change.
  const toolRef = useRef(activeTool);
  const styleRef = useRef(uiStyle);
  const lockedRef = useRef(toolLocked);
  const draftRef = useRef(textDraft);
  const selectionRef = useRef(selection);
  const palmRejectionRef = useRef(palmRejection);
  toolRef.current = activeTool;
  styleRef.current = uiStyle;
  lockedRef.current = toolLocked;
  draftRef.current = textDraft;
  selectionRef.current = selection;
  palmRejectionRef.current = palmRejection;

  /** Pointer currently drawing (pens win over synthetic mouse events). */
  const drawingPointerRef = useRef<{ id: number; type: string } | null>(null);
  const magicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selVersionRef = useRef(-1);

  useEffect(() => saveUiStyle(uiStyle), [uiStyle]);

  /** Re-renders overlays positioned in world space (the inline text editor). */
  const bumpView = useCallback(() => {
    if (draftRef.current) setViewTick((t) => t + 1);
  }, []);

  const updateZoom = useCallback(
    (z: number) => {
      const pct = Math.round(z * 100);
      setZoomLevel(pct);
      onZoomChange?.(pct);
      bumpView();
    },
    [onZoomChange, bumpView],
  );

  const syncUi = useCallback(
    (forceSelection = false) => {
      const e = engineRef.current;
      if (!e) return;
      setCanUndo(e.can_undo());
      setCanRedo(e.can_redo());
      setIsEmpty(e.element_count() === 0);
      const v = e.selection_version();
      if (!forceSelection && v === selVersionRef.current) return;
      selVersionRef.current = v;
      let info = EMPTY_SELECTION;
      try {
        info = JSON.parse(e.get_selection_info()) as SelectionInfo;
      } catch {
        // keep EMPTY_SELECTION
      }
      setSelection(info);
      if (info.count === 1 && info.kinds[0] === 'Diagram') {
        const el = parseElement(e.get_selected_element_json());
        setDiagramAccent(el?.stroke_color && el.stroke_color !== 'transparent' ? el.stroke_color : '#e73f07');
      } else {
        setDiagramAccent(null);
      }
      onSelectionChange?.(info);
    },
    [onSelectionChange],
  );

  /** Sends the current style for `tool` to the engine (used for new elements). */
  const pushStyle = useCallback((tool: ToolId, s: UiStyle) => {
    if (tool === 'select' || tool === 'hand' || tool === 'eraser') return;
    engineRef.current?.apply_style(engineStyleFor(tool, s));
  }, []);

  const cancelMagicTimer = useCallback(() => {
    if (magicTimerRef.current) clearTimeout(magicTimerRef.current);
    magicTimerRef.current = null;
  }, []);

  const applyTool = useCallback(
    (id: ToolId, notify = true) => {
      if (readOnly && id !== 'hand' && id !== 'select') return;
      if (id !== 'magic_pen') cancelMagicTimer();
      const e = engineRef.current;
      if (e) {
        SET_TOOL[id]?.(e);
        pushStyle(id, styleRef.current);
      }
      if (isPen(id) && styleRef.current.lastPen !== id) setUiStyle((s) => ({ ...s, lastPen: id as PenTool }));
      setActiveTool(id);
      toolRef.current = id;
      if (notify) onToolChange?.(id);
      syncUi();
    },
    [readOnly, cancelMagicTimer, pushStyle, onToolChange, syncUi],
  );

  const applyEraser = useCallback(
    (patch: Partial<Pick<UiStyle, 'eraserMode' | 'eraserSize'>>) => {
      const e = engineRef.current;
      if (patch.eraserMode) {
        e?.set_eraser_type?.(patch.eraserMode);
        onEraserTypeChange?.(patch.eraserMode);
      }
      if (patch.eraserSize) e?.set_eraser_radius(patch.eraserSize / 2);
      setUiStyle((s) => ({ ...s, ...patch }));
    },
    [onEraserTypeChange],
  );

  /** Style edits from the panel: go to the selection, and become the default for new elements. */
  const applyStyleChange = useCallback(
    (change: StyleChange) => {
      const tool = toolRef.current;
      const sel = selectionRef.current;
      const selecting = tool === 'select' && sel.count > 0;
      const next: UiStyle = { ...styleRef.current };
      const penOnly = selecting && sel.kinds.every((k) => PEN_KINDS.includes(k));
      const highlighterOnly = selecting ? sel.kinds.length === 1 && sel.kinds[0] === 'Highlighter' : tool === 'highlighter';
      const penLike = selecting ? penOnly : isPen(tool) || tool === 'magic_pen' || tool === 'laser_pen';
      for (const [k, v] of Object.entries(change) as Array<[keyof StyleChange, never]>) {
        if (k === 'strokeColor') next[highlighterOnly ? 'highlighterColor' : 'strokeColor'] = v;
        else if (k === 'strokeWidth') next[highlighterOnly ? 'highlighterWidth' : penLike ? 'penWidth' : 'shapeWidth'] = v;
        else (next as unknown as Record<string, unknown>)[k] = v;
      }
      setUiStyle(next);
      const e = engineRef.current;
      if (!e) return;
      if (selecting) {
        e.apply_style(JSON.stringify(change));
        syncUi(true);
      } else {
        pushStyle(tool, next);
      }
    },
    [pushStyle, syncUi],
  );

  /** Runs an engine mutation, then repaints and refreshes the UI. */
  const act = useCallback(
    (fn: (e: AerialEngine) => void) => {
      const e = engineRef.current;
      if (!e) return;
      fn(e);
      e.render();
      syncUi();
    },
    [syncUi],
  );

  const zoomWith = useCallback((fn: (e: AerialEngine) => number) => engineRef.current && updateZoom(fn(engineRef.current)), [updateZoom]);

  const setToolLocked = useCallback((locked: boolean) => {
    engineRef.current?.set_tool_locked(locked);
    setToolLockedState(locked);
  }, []);

  return {
    readOnly,
    canvasRef,
    engineRef,
    eraserCursorRef,
    toolRef,
    styleRef,
    lockedRef,
    draftRef,
    selectionRef,
    palmRejectionRef,
    drawingPointerRef,
    magicTimerRef,
    engineReady,
    setEngineReady,
    loadError,
    setLoadError,
    activeTool,
    setActiveTool,
    toolLocked,
    uiStyle,
    setUiStyle,
    selection,
    diagramAccent,
    setDiagramAccent,
    zoomLevel,
    canUndo,
    canRedo,
    isEmpty,
    textDraft,
    setTextDraft,
    bumpView,
    updateZoom,
    syncUi,
    cancelMagicTimer,
    applyTool,
    applyEraser,
    applyStyleChange,
    act,
    setToolLocked,
    undo: useCallback(() => act((e) => e.undo()), [act]),
    redo: useCallback(() => act((e) => e.redo()), [act]),
    deleteSelected: useCallback(() => act((e) => e.delete_selected()), [act]),
    duplicateSelected: useCallback(() => act((e) => e.duplicate_selected()), [act]),
    reorderSelected: useCallback((a: 'front' | 'forward' | 'backward' | 'back') => act((e) => e.reorder_selected(a)), [act]),
    selectAll: useCallback(() => {
      if (toolRef.current !== 'select') applyTool('select');
      act((e) => e.select_all());
    }, [act, applyTool]),
    zoomIn: useCallback(() => zoomWith((e) => e.zoom_in()), [zoomWith]),
    zoomOut: useCallback(() => zoomWith((e) => e.zoom_out()), [zoomWith]),
    resetView: useCallback(() => zoomWith((e) => e.reset_view()), [zoomWith]),
    zoomToFit: useCallback(() => zoomWith((e) => e.zoom_to_fit(64)), [zoomWith]),
    toggleLock: useCallback(() => setToolLocked(!lockedRef.current), [setToolLocked]),
  };
}

export type CanvasCore = ReturnType<typeof useCanvasCore>;
