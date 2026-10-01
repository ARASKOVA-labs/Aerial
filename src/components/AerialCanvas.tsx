// ── Aerial Canvas Library — Core Embeddable Component ───────────────────────
// A self-contained, Tauri-free canvas component that can be embedded in any
// React 19 application. Owns the WASM lifecycle, pointer/touch input, the
// keyboard map, inline text editing and (optionally) the Excalidraw-style
// editor chrome: main menu, centred toolbar, properties panel, zoom/history.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import mermaid from 'mermaid';
import { loadAerialEngine } from '../lib/wasm-loader';
import { getAraskovaMermaidConfig, applyAraskovaDiagramAesthetics } from '../lib/diagram-theme';
import type { AerialEngine, AerialCanvasProps, AerialCanvasRef, ToolId } from '../lib/types';
import { createLogger } from '../lib/logger';
import { withEmbeddedFonts } from '../lib/svg-fonts';
import { HelpButton, MainMenu, WelcomeScreen, ZoomBar } from '../ui/Chrome';
import { ColorPicker } from '../ui/ColorPicker';
import { InlineTextEditor, type TextDraft } from '../ui/InlineTextEditor';
import { PropertiesPanel, type StyleChange } from '../ui/PropertiesPanel';
import { Toolbar } from '../ui/Toolbar';
import { ExportIcon, MinusIcon, PlusIcon, TrashIcon } from '../ui/icons';
import { DEFAULT_UI_STYLE, EMPTY_SELECTION, MAIN_TOOLS, isPen, themedColor, type PenTool, type SelectionInfo, type UiStyle } from '../ui/model';
import { MenuItem, MenuSeparator } from '../ui/primitives';
import '../ui/theme.css';

const logger = createLogger('AerialCanvas');

let canvasIdCounter = 0;

const STYLE_KEY = 'aerial_ui_style_v1';
const DIAGRAM_ACCENTS = ['#e73f07', '#6965db', '#1971c2', '#2f9e44', '#e03131'];

/** Reads the persisted UI style, keeping only fields whose type matches the defaults. */
function loadUiStyle(): UiStyle {
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    if (!raw) return DEFAULT_UI_STYLE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_UI_STYLE;
    const out: Record<string, unknown> = { ...DEFAULT_UI_STYLE };
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (k in DEFAULT_UI_STYLE && typeof v === typeof (DEFAULT_UI_STYLE as unknown as Record<string, unknown>)[k]) out[k] = v;
    }
    return out as unknown as UiStyle;
  } catch {
    return DEFAULT_UI_STYLE;
  }
}

function saveUiStyle(s: UiStyle) {
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode): the style simply isn't remembered.
  }
}

/** Width the engine should draw with for a tool. */
function widthFor(tool: ToolId, s: UiStyle): number {
  if (tool === 'highlighter') return s.highlighterWidth;
  if (isPen(tool) || tool === 'magic_pen' || tool === 'laser_pen') return s.penWidth;
  return s.shapeWidth;
}

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

interface ElementJson {
  id: number;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  font_size?: number;
  font_family?: string;
  stroke_color?: string;
  code?: string | null;
}

function parseElement(json: string | null | undefined): ElementJson | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ElementJson;
  } catch {
    return null;
  }
}

/** Rasterises an SVG string (fonts embedded) into an <img> the engine can draw. */
async function renderSvgToImage(svg: string): Promise<HTMLImageElement> {
  const sanitized = await withEmbeddedFonts(svg.replace(/@import\s+url\([^)]+\);?/gi, ''));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      // WebKit sometimes rejects large data URLs; fall back to a blob URL.
      try {
        const url = URL.createObjectURL(new Blob([sanitized], { type: 'image/svg+xml;charset=utf-8' }));
        const fallback = new Image();
        fallback.onload = () => {
          URL.revokeObjectURL(url);
          resolve(fallback);
        };
        fallback.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        fallback.src = url;
      } catch (e) {
        reject(e);
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(sanitized)));
  });
}

const svgDataUrl = (svg: string) => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

// ── Component ───────────────────────────────────────────────────────────────

export const AerialCanvas = forwardRef<AerialCanvasRef, AerialCanvasProps>(function AerialCanvas(props, ref) {
  const {
    initialScene,
    initialState,
    onChange,
    onChanges,
    theme,
    backgroundColor,
    readOnly = false,
    showToolbar = true,
    className = '',
    onReady,
    wasmBasePath,
    changeInterval = 500,
    palmRejection = true,
    onZoomChange,
    magicLanguage = 'en',
    magicFont = 'Kalam, Caveat, cursive',
    eraserType: propEraserType,
    eraserSize: propEraserSize,
    onEraserTypeChange,
    onToolChange,
    onNodeDoubleClick,
    onCanvasPointerDown,
    onExternalRequest,
    menu,
    extraTools = [],
    topRight,
    showWelcome = false,
    welcomeItems,
    logo,
    onHelp,
    onInsertImage,
    onSelectionChange,
    panelExtra,
  } = props;

  const isDark = theme === 'dark';
  const canonicalBg = backgroundColor ?? '#ffffff';
  const paper = themedColor(canonicalBg, isDark);

  // ── Refs ────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AerialEngine | null>(null);
  const eraserCursorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initStarted = useRef(false);
  const [canvasId] = useState(() => `aerial-canvas-${canvasIdCounter++}`);

  // ── State ───────────────────────────────────────────────────────────────
  const [engineReady, setEngineReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [toolLocked, setToolLocked] = useState(false);
  const [uiStyle, setUiStyle] = useState<UiStyle>(loadUiStyle);
  const [selection, setSelection] = useState<SelectionInfo>(EMPTY_SELECTION);
  const [diagramAccent, setDiagramAccent] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [, setViewTick] = useState(0);
  const [isConvertingMagic, setIsConvertingMagic] = useState(false);

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

  // Pointer tracking
  const drawingPointerRef = useRef<{ id: number; type: string } | null>(null);
  const activePenIdRef = useRef<number | null>(null);
  const spaceToolRef = useRef<ToolId | null>(null);
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistRef = useRef<number | null>(null);
  const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);
  const magicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selVersionRef = useRef(-1);

  useEffect(() => saveUiStyle(uiStyle), [uiStyle]);

  const updateZoom = useCallback(
    (z: number) => {
      const pct = Math.round(z * 100);
      setZoomLevel(pct);
      onZoomChange?.(pct);
      if (draftRef.current) setViewTick((t) => t + 1);
    },
    [onZoomChange],
  );

  // ── Engine ↔ UI sync ────────────────────────────────────────────────────
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
    const e = engineRef.current;
    if (!e || tool === 'select' || tool === 'hand' || tool === 'eraser') return;
    e.apply_style(
      JSON.stringify({
        strokeColor: tool === 'highlighter' ? s.highlighterColor : s.strokeColor,
        backgroundColor: s.backgroundColor,
        fillStyle: s.fillStyle,
        strokeWidth: widthFor(tool, s),
        strokeStyle: s.strokeStyle,
        roughness: s.roughness,
        roundness: s.roundness,
        opacity: tool === 'highlighter' ? 100 : s.opacity,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
      }),
    );
  }, []);

  const cancelMagicTimer = () => {
    if (magicTimerRef.current) {
      clearTimeout(magicTimerRef.current);
      magicTimerRef.current = null;
    }
  };

  const applyTool = useCallback(
    (id: ToolId, notify = true) => {
      const e = engineRef.current;
      if (readOnly && id !== 'hand' && id !== 'select') return;
      if (id !== 'magic_pen') cancelMagicTimer();
      if (e) {
        switch (id) {
          case 'freedraw': e.set_tool_freedraw(); break;
          case 'fountain': e.set_tool_fountain_pen(); break;
          case 'marker': e.set_tool_marker(); break;
          case 'highlighter': e.set_tool_highlighter(); break;
          case 'rectangle': e.set_tool_rectangle(); break;
          case 'diamond': e.set_tool_diamond(); break;
          case 'ellipse': e.set_tool_ellipse(); break;
          case 'line': e.set_tool_line(); break;
          case 'arrow': e.set_tool_arrow(); break;
          case 'select': e.set_tool_select(); break;
          case 'hand': e.set_tool_hand(); break;
          case 'eraser': e.set_tool_eraser(); break;
          case 'laser_pen': e.set_tool_laser_pen(); break;
          case 'magic_pen': e.set_tool_magic_pen(); break;
          case 'text': e.set_tool_text(); break;
        }
        pushStyle(id, styleRef.current);
      }
      if (isPen(id) && styleRef.current.lastPen !== id) {
        setUiStyle((s) => ({ ...s, lastPen: id as PenTool }));
      }
      setActiveTool(id);
      toolRef.current = id;
      if (notify) onToolChange?.(id);
      syncUi();
    },
    [readOnly, pushStyle, onToolChange, syncUi],
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
      const e = engineRef.current;
      const tool = toolRef.current;
      const sel = selectionRef.current;
      const selecting = tool === 'select' && sel.count > 0;
      const next: UiStyle = { ...styleRef.current };
      const penOnly = selecting && sel.kinds.every((k) => ['FreeDraw', 'FountainPen', 'Marker', 'Highlighter'].includes(k));
      const highlighterOnly = selecting ? sel.kinds.length === 1 && sel.kinds[0] === 'Highlighter' : tool === 'highlighter';
      const penLike = selecting ? penOnly : isPen(tool) || tool === 'magic_pen' || tool === 'laser_pen';
      for (const [k, v] of Object.entries(change) as Array<[keyof StyleChange, never]>) {
        if (k === 'strokeColor') next[highlighterOnly ? 'highlighterColor' : 'strokeColor'] = v;
        else if (k === 'strokeWidth') next[highlighterOnly ? 'highlighterWidth' : penLike ? 'penWidth' : 'shapeWidth'] = v;
        else (next as unknown as Record<string, unknown>)[k] = v;
      }
      setUiStyle(next);
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

  // ── WASM boot ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    let observer: ResizeObserver | null = null;

    (async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement ?? canvas;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, parent.clientWidth * dpr);
        canvas.height = Math.max(1, parent.clientHeight * dpr);

        const engine = await loadAerialEngine(canvasId, { basePath: wasmBasePath });
        engine.set_dpr(dpr);
        if (initialState) engine.import_full_state(initialState);
        else if (initialScene) engine.load_scene_json(initialScene);

        engine.set_dark_mode(isDark);
        engine.set_background_color(canonicalBg);
        const s = styleRef.current;
        engine.set_eraser_type?.(propEraserType ?? s.eraserMode);
        engine.set_eraser_radius((propEraserSize ?? s.eraserSize) / 2);
        engineRef.current = engine;
        applyTool(toolRef.current, false);
        engine.render();
        setEngineReady(true);

        observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            const d = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, width * d);
            canvas.height = Math.max(1, height * d);
            engine.set_dpr(d);
            engine.render();
          }
        });
        observer.observe(canvas);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        window.__aerialBoot?.('error', msg);
      }
    })();

    return () => {
      observer?.disconnect();
      engineRef.current?.free?.();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Frame loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!engineReady) return;
    let raf = 0;
    let errorLogged = false;
    const loop = () => {
      try {
        engineRef.current?.tick_animations();
      } catch (err) {
        if (!errorLogged) {
          logger.warn('tick_animations threw:', err);
          errorLogged = true;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engineReady]);

  // Periodic UI sync catches changes made outside pointer handlers (remote
  // collaboration, host API calls, undo via menu).
  useEffect(() => {
    if (!engineReady) return;
    const id = setInterval(() => syncUi(), 250);
    return () => clearInterval(id);
  }, [engineReady, syncUi]);

  // ── Change notification loop ────────────────────────────────────────────
  useEffect(() => {
    if (!engineReady || (!onChange && !onChanges)) return;
    let seen = engineRef.current?.scene_version() ?? 0;
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      if (onChanges && e.has_pending_changes()) onChanges(e.take_changes());
      const v = e.scene_version();
      if (onChange && v !== seen) {
        seen = v;
        onChange(e.get_scene_json());
      }
    }, changeInterval);
    return () => clearInterval(id);
  }, [engineReady, onChange, onChanges, changeInterval]);

  // ── Diagram re-theming ──────────────────────────────────────────────────
  const rethemeDiagrams = useCallback(async (dark: boolean) => {
    const e = engineRef.current;
    if (!e) return;
    let diagrams: Array<{ id: number; code?: string; svg?: string }> = [];
    try {
      const parsed = JSON.parse(e.get_scene_json()) as { elements?: Array<{ id: number; kind?: string; code?: string; svg?: string }> };
      diagrams = (parsed.elements ?? []).filter((el) => el.kind?.toLowerCase() === 'diagram' && (el.code || el.svg));
    } catch (err) {
      logger.warn('Failed to parse scene for diagram re-theming:', err);
      return;
    }
    if (diagrams.length === 0) return;
    const style = dark ? 'brutalist' : 'industrial_light';
    try {
      (mermaid as unknown as { mermaidAPI?: { reset?: () => void } }).mermaidAPI?.reset?.();
    } catch {
      // older mermaid builds have no reset
    }
    mermaid.initialize(getAraskovaMermaidConfig(dark, style));
    for (const el of diagrams) {
      try {
        let svg = '';
        const code = (el.code ?? '').trim();
        if (code.startsWith('node ') || code.startsWith('group ')) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const res = await invoke<{ svg: string }>('render_diagram', { code });
            if (res?.svg) svg = applyAraskovaDiagramAesthetics(res.svg, dark, style);
          } catch {
            // Not running in Tauri.
          }
        }
        if (!svg && code) {
          const out = await mermaid.render(`retheme-${el.id}-${Math.random().toString(36).slice(2, 7)}`, code);
          svg = applyAraskovaDiagramAesthetics(out.svg, dark, style);
        }
        if (!svg && el.svg) svg = applyAraskovaDiagramAesthetics(el.svg, dark, style);
        if (svg && engineRef.current) {
          engineRef.current.set_cached_image(BigInt(el.id), await renderSvgToImage(svg));
          engineRef.current.render();
        }
      } catch (err) {
        logger.warn(`Failed to re-theme diagram #${el.id}:`, err);
      }
    }
  }, []);

  const recolorDiagram = useCallback(
    async (color: string) => {
      const e = engineRef.current;
      const id = selectionRef.current.ids[0];
      const el = parseElement(e?.get_selected_element_json());
      if (!e || id === undefined || !el?.code) return;
      try {
        const style = isDark ? 'brutalist' : 'industrial_light';
        mermaid.initialize(getAraskovaMermaidConfig(isDark, style, color));
        const { svg } = await mermaid.render(`recolor-${Math.random().toString(36).slice(2, 9)}`, el.code);
        const styled = applyAraskovaDiagramAesthetics(svg, isDark, style, color);
        const img = await renderSvgToImage(styled);
        const parsed = JSON.parse(e.get_scene_json()) as { elements?: Array<Record<string, unknown>> };
        const target = parsed.elements?.find((x) => Number(x.id) === id);
        if (target) {
          target.stroke_color = color;
          target.svg = svgDataUrl(styled);
          e.load_scene_json(JSON.stringify(parsed));
        }
        e.set_cached_image(BigInt(id), img);
        e.set_accent_color(color);
        e.set_selected_id(BigInt(id));
        e.render();
        setDiagramAccent(color);
      } catch (err) {
        logger.error('Failed to recolor diagram:', err);
      }
    },
    [isDark],
  );

  // ── Theme / background / eraser prop sync ───────────────────────────────
  useEffect(() => {
    const e = engineRef.current;
    if (!engineReady || !e) return;
    e.set_dark_mode(isDark);
    e.render();
    rethemeDiagrams(isDark);
  }, [isDark, engineReady, rethemeDiagrams]);

  useEffect(() => {
    if (engineReady) engineRef.current?.set_background_color(canonicalBg);
  }, [canonicalBg, engineReady]);

  useEffect(() => {
    if (!engineReady || !propEraserType) return;
    engineRef.current?.set_eraser_type?.(propEraserType);
    if (propEraserType !== 'element') setUiStyle((s) => (s.eraserMode === propEraserType ? s : { ...s, eraserMode: propEraserType }));
  }, [propEraserType, engineReady]);

  useEffect(() => {
    if (!engineReady || !propEraserSize) return;
    engineRef.current?.set_eraser_radius(propEraserSize / 2);
    setUiStyle((s) => (s.eraserSize === propEraserSize ? s : { ...s, eraserSize: propEraserSize }));
  }, [propEraserSize, engineReady]);

  // ── Magic pen ───────────────────────────────────────────────────────────
  const convertMagicStrokes = useCallback(async (): Promise<string | null> => {
    const engine = engineRef.current;
    if (!engine) return null;
    // Recognition uploads the ink to Google Input Tools; let the host gate it.
    if (onExternalRequest && !(await onExternalRequest('handwriting'))) return null;
    const jsonStr = engine.extract_magic_strokes();
    if (!jsonStr) return null;
    try {
      const { ink, bounds } = JSON.parse(jsonStr) as {
        ink?: unknown[];
        bounds?: { min_x?: number; min_y?: number; max_x?: number; max_y?: number; baseline_y?: number };
      };
      if (!Array.isArray(ink) || ink.length === 0) return null;
      setIsConvertingMagic(true);
      const lang = magicLanguage || 'en';
      const resp = await fetch(`https://inputtools.google.com/request?itc=${encodeURIComponent(lang)}-t-i0-handwrit&app=translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_version: 0.4,
          api_level: '533.0.0',
          device: navigator.userAgent,
          input_type: '0',
          options: 'enable_pre_space',
          requests: [
            {
              writing_guide: {
                writing_area_width: Math.max(800, (bounds?.max_x ?? 800) - (bounds?.min_x ?? 0)),
                writing_area_height: Math.max(300, (bounds?.max_y ?? 300) - (bounds?.min_y ?? 0)),
              },
              ink,
              language: lang,
            },
          ],
        }),
      });
      if (!resp.ok) throw new Error(`Recognition API HTTP error: ${resp.status}`);
      const data = await resp.json();
      const recognized = data?.[0] === 'SUCCESS' ? (data?.[1]?.[0]?.[1]?.[0] as string | undefined) : undefined;
      if (recognized) {
        const size = 28;
        const x = bounds?.min_x ?? 250;
        const y = bounds?.baseline_y ? bounds.baseline_y - size : (bounds?.min_y ?? 250);
        engine.add_text(recognized, x, y, size, magicFont, styleRef.current.strokeColor);
        engine.render();
        syncUi();
        return recognized;
      }
    } catch (err) {
      logger.warn('Handwriting recognition failed:', err);
    } finally {
      setIsConvertingMagic(false);
      engine.render();
    }
    return null;
  }, [magicLanguage, magicFont, onExternalRequest, syncUi]);

  // ── Text editing ────────────────────────────────────────────────────────
  const openTextEditor = useCallback((el: ElementJson | null, worldX?: number, worldY?: number) => {
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
      setTextDraft({
        elementId: null,
        worldX,
        worldY: worldY - s.fontSize * 0.65,
        text: '',
        fontSize: s.fontSize,
        fontFamily: s.fontFamily,
        color: s.strokeColor,
      });
    }
  }, []);

  const commitText = useCallback(
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
    [applyTool, syncUi],
  );

  // ── Pointer input ───────────────────────────────────────────────────────
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };
  const pressureOf = (e: PointerEvent | React.PointerEvent) => (e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : -1);

  const moveEraserCursor = (x: number, y: number) => {
    const c = eraserCursorRef.current;
    if (!c) return;
    const size = styleRef.current.eraserSize;
    c.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0)`;
    c.style.opacity = '1';
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (onCanvasPointerDown?.()) return; // host consumed it (dismissed a popover)
      const engine = engineRef.current;
      if (!engine) return;

      // Clicking away from the inline editor commits it, like Excalidraw.
      if (draftRef.current) {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }

      const { x, y } = localPoint(e);
      engine.set_modifiers(e.shiftKey, e.altKey);

      if (e.pointerType === 'touch') {
        touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touchesRef.current.size === 2) {
          const [a, b] = Array.from(touchesRef.current.values());
          pinchDistRef.current = Math.hypot(a.x - b.x, a.y - b.y);
          pinchCenterRef.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          // A second finger turns a one-finger stroke into a pinch.
          if (drawingPointerRef.current?.type === 'touch') {
            drawingPointerRef.current = null;
            engine.pointer_up(x, y);
          }
          return;
        }
        if (palmRejectionRef.current && toolRef.current !== 'hand') return;
      }

      // Pens win over the synthetic mouse events some drivers emit.
      if (e.pointerType === 'mouse' && activePenIdRef.current !== null) return;
      if (e.pointerType === 'pen') activePenIdRef.current = e.pointerId;
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
        const hit = parseElement(engine.get_element_at?.(x, y));
        if (hit?.kind === 'Text') openTextEditor(hit);
        else openTextEditor(null, engine.screen_to_world_x(x), engine.screen_to_world_y(y));
        return;
      }

      drawingPointerRef.current = { id: e.pointerId, type: e.pointerType };
      engine.pointer_down(x, y, pressureOf(e));
      if (toolRef.current === 'hand' && canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    },
    [onCanvasPointerDown, openTextEditor, readOnly],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const engine = engineRef.current;
      if (!engine) return;
      const { x, y } = localPoint(e);
      if (toolRef.current === 'eraser') moveEraserCursor(x, y);

      if (e.pointerType === 'touch' && touchesRef.current.has(e.pointerId)) {
        touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touchesRef.current.size === 2) {
          const [a, b] = Array.from(touchesRef.current.values());
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const p = localPoint({ clientX: center.x, clientY: center.y });
          const last = pinchCenterRef.current;
          if (last) {
            const start = pinchDistRef.current;
            if (start && Math.abs(dist - start) > 3) {
              updateZoom(engine.on_wheel(0, (start - dist) * 1.5, true, p.x, p.y));
              pinchDistRef.current = dist;
            }
            const dx = last.x - center.x;
            const dy = last.y - center.y;
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) engine.on_wheel(dx, dy, false, p.x, p.y);
          }
          pinchCenterRef.current = center;
          return;
        }
      }

      const active = drawingPointerRef.current;
      if (!active) {
        // Hover feedback for the selection tool (move / resize cursors).
        if (toolRef.current === 'select' && e.pointerType !== 'touch' && canvasRef.current) {
          canvasRef.current.style.cursor = engine.get_cursor(x, y);
        }
        return;
      }
      if (active.id !== e.pointerId) return;
      engine.set_modifiers(e.shiftKey, e.altKey);
      // Coalesced events keep fast strokes smooth on high-rate digitisers.
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      if (events.length > 1) {
        for (const ce of events) {
          const p = localPoint(ce);
          engine.pointer_move(p.x, p.y, pressureOf(ce));
        }
      } else {
        engine.pointer_move(x, y, pressureOf(e));
      }
      if (toolRef.current === 'hand' && draftRef.current) setViewTick((t) => t + 1);
    },
    [updateZoom],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === 'touch') {
        touchesRef.current.delete(e.pointerId);
        if (touchesRef.current.size < 2) {
          pinchDistRef.current = null;
          pinchCenterRef.current = null;
        }
      }
      if (e.pointerType === 'pen' && e.pointerId === activePenIdRef.current) activePenIdRef.current = null;
      if (drawingPointerRef.current?.id !== e.pointerId) return;
      drawingPointerRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
      const engine = engineRef.current;
      if (!engine) return;
      const { x, y } = localPoint(e);
      engine.set_modifiers(e.shiftKey, e.altKey);
      engine.pointer_up(x, y);

      const switched = engine.take_tool_switch();
      if (switched === 'select') {
        setActiveTool('select');
        toolRef.current = 'select';
        onToolChange?.('select');
      }
      if (toolRef.current === 'hand' && canvasRef.current) canvasRef.current.style.cursor = 'grab';
      if (toolRef.current === 'magic_pen') {
        cancelMagicTimer();
        magicTimerRef.current = setTimeout(() => void convertMagicStrokes(), 1200);
      }
      syncUi();
    },
    [convertMagicStrokes, onToolChange, syncUi],
  );

  const onPointerLeave = useCallback(() => {
    if (eraserCursorRef.current) eraserCursorRef.current.style.opacity = '0';
  }, []);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const engine = engineRef.current;
      if (!engine || readOnly || toolRef.current !== 'select' || draftRef.current) return;
      const { x, y } = localPoint(e);
      const hit = parseElement(engine.get_element_at?.(x, y));
      if (hit?.kind === 'Text') {
        openTextEditor(hit);
        return;
      }
      const hitId = engine.on_double_click(x, y);
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
      openTextEditor(null, engine.screen_to_world_x(x), engine.screen_to_world_y(y));
    },
    [readOnly, onNodeDoubleClick, openTextEditor, syncUi],
  );

  // Wheel: native listener so preventDefault works (React's is passive).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engineReady) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const engine = engineRef.current;
      if (!engine) return;
      const { x, y } = localPoint(e);
      const ctrl = e.ctrlKey || e.metaKey;
      // Shift+wheel scrolls horizontally on mice without a horizontal wheel.
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      const z = engine.on_wheel(dx * scale, dy * scale, ctrl, x, y);
      if (ctrl) updateZoom(z);
      else if (draftRef.current) setViewTick((t) => t + 1);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [engineReady, updateZoom]);

  // ── Actions ─────────────────────────────────────────────────────────────
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
  const undo = useCallback(() => act((e) => e.undo()), [act]);
  const redo = useCallback(() => act((e) => e.redo()), [act]);
  const deleteSelected = useCallback(() => act((e) => e.delete_selected()), [act]);
  const duplicateSelected = useCallback(() => act((e) => e.duplicate_selected()), [act]);
  const reorderSelected = useCallback((a: 'front' | 'forward' | 'backward' | 'back') => act((e) => e.reorder_selected(a)), [act]);
  const zoomIn = useCallback(() => engineRef.current && updateZoom(engineRef.current.zoom_in()), [updateZoom]);
  const zoomOut = useCallback(() => engineRef.current && updateZoom(engineRef.current.zoom_out()), [updateZoom]);
  const resetView = useCallback(() => engineRef.current && updateZoom(engineRef.current.reset_view()), [updateZoom]);
  const toggleLock = useCallback(() => {
    setToolLocked((l) => {
      engineRef.current?.set_tool_locked(!l);
      return !l;
    });
  }, []);

  const insertImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const e = engineRef.current;
          const canvas = canvasRef.current;
          if (!e || !canvas) return;
          const zoom = e.get_zoom() || 1;
          const max = 600 / zoom;
          const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const w = img.naturalWidth * k;
          const h = img.naturalHeight * k;
          const cx = e.screen_to_world_x(canvas.clientWidth / 2);
          const cy = e.screen_to_world_y(canvas.clientHeight / 2);
          e.add_image(img, cx - w / 2, cy - h / 2, w, h, `img-${Date.now().toString(36)}`);
          e.render();
          applyTool('select');
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    },
    [applyTool],
  );

  const insertImage = useCallback(() => {
    if (onInsertImage) onInsertImage();
    else fileInputRef.current?.click();
  }, [onInsertImage]);

  const exportPngBlob = useCallback(
    () =>
      new Promise<Blob>((resolve, reject) => {
        const canvas = canvasRef.current;
        const e = engineRef.current;
        if (!canvas) return reject(new Error('Canvas not available'));
        // Selection chrome is painted on the same canvas: clear it first.
        e?.deselect();
        e?.render();
        syncUi();
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to export PNG'))), 'image/png');
      }),
    [syncUi],
  );

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const toolKeys: Record<string, ToolId | 'image' | 'pen'> = {};
    for (const t of MAIN_TOOLS) {
      const id = t.id === 'freedraw' ? 'pen' : t.id;
      if (t.key) toolKeys[t.key.toLowerCase()] = id;
      if (t.num) toolKeys[t.num] = id;
    }
    toolKeys.x = 'pen';
    toolKeys.k = 'laser_pen';
    toolKeys.w = 'magic_pen';

    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.set_modifiers(e.shiftKey, e.altKey);
      if (isEditable(e.target) || draftRef.current || e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const sel = selectionRef.current;

      if (mod) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (key === 'y') {
          e.preventDefault();
          redo();
        } else if (readOnly) {
          return;
        } else if (key === 'd' && sel.count > 0) {
          e.preventDefault();
          duplicateSelected();
        } else if (key === 'a') {
          e.preventDefault();
          if (toolRef.current !== 'select') applyTool('select');
          act((en) => en.select_all());
        } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
          if (sel.count === 0) return;
          e.preventDefault();
          const fwd = e.code === 'BracketRight';
          reorderSelected(e.shiftKey ? (fwd ? 'front' : 'back') : fwd ? 'forward' : 'backward');
        } else if (key === '=' || key === '+') {
          e.preventDefault();
          zoomIn();
        } else if (key === '-') {
          e.preventDefault();
          zoomOut();
        } else if (key === '0') {
          e.preventDefault();
          resetView();
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat && toolRef.current !== 'hand' && !drawingPointerRef.current) {
          spaceToolRef.current = toolRef.current;
          applyTool('hand', false);
        }
        return;
      }
      if (e.key === '?') {
        if (onHelp) {
          e.preventDefault();
          onHelp();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (sel.count > 0) act((en) => en.deselect());
        return;
      }
      if (readOnly) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.count > 0) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (e.key === 'Enter' && sel.count === 1 && sel.kinds[0] === 'Text') {
        e.preventDefault();
        openTextEditor(parseElement(engine.get_selected_element_json()));
        return;
      }
      if (e.key.startsWith('Arrow') && sel.count > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        act((en) => en.nudge_selected(dx, dy));
        return;
      }
      if (e.repeat || e.shiftKey) return;
      if (key === 'q') {
        toggleLock();
        return;
      }
      const target = toolKeys[key];
      if (!target) return;
      e.preventDefault();
      if (target === 'image') insertImage();
      else if (target === 'pen') applyTool(isPen(toolRef.current) ? toolRef.current : styleRef.current.lastPen);
      else applyTool(target);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      engineRef.current?.set_modifiers(e.shiftKey, e.altKey);
      if (e.key === ' ' && spaceToolRef.current) {
        const prev = spaceToolRef.current;
        spaceToolRef.current = null;
        applyTool(prev, false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [readOnly, act, applyTool, deleteSelected, duplicateSelected, insertImage, onHelp, openTextEditor, redo, reorderSelected, resetView, toggleLock, undo, zoomIn, zoomOut]);

  // ── Cursor ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.style.cursor =
      activeTool === 'hand' ? 'grab' : activeTool === 'select' ? 'default' : activeTool === 'eraser' ? 'none' : activeTool === 'text' ? 'text' : 'crosshair';
  }, [activeTool]);

  // ── Imperative API ──────────────────────────────────────────────────────
  const api: AerialCanvasRef = {
    getSceneJson: () => engineRef.current?.get_scene_json() ?? '{}',
    loadSceneJson: (json) => act((e) => e.load_scene_json(json)),
    exportFullState: () => engineRef.current?.export_full_state() ?? new Uint8Array(),
    takeChanges: () => engineRef.current?.take_changes() ?? '{"reset":false,"upserts":[],"deletes":[]}',
    getElementCount: () => engineRef.current?.element_count() ?? 0,
    getRenderStats: () => {
      try {
        return JSON.parse(engineRef.current?.get_render_stats() ?? '{}');
      } catch {
        return {};
      }
    },
    setLodThreshold: (px) => engineRef.current?.set_lod_threshold(px),
    importFullState: (bytes) => act((e) => e.import_full_state(bytes)),
    addDiagram: async (code, rawSvg, scale = 1.0, accentColor = '#e73f07') => {
      const engine = engineRef.current;
      const canvas = canvasRef.current;
      if (!engine || !canvas) return;
      try {
        const style = isDark ? 'brutalist' : 'industrial_light';
        const cleanSvg = applyAraskovaDiagramAesthetics(rawSvg, isDark, style, accentColor);
        let svgW = 600;
        let svgH = 400;
        const svgEl = new DOMParser().parseFromString(cleanSvg, 'image/svg+xml').querySelector('svg');
        if (svgEl) {
          const vb = svgEl.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(parseFloat);
          if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
            svgW = Math.round(vb[2]);
            svgH = Math.round(vb[3]);
          } else {
            const w = parseFloat(svgEl.getAttribute('width') || '0');
            const h = parseFloat(svgEl.getAttribute('height') || '0');
            if (w > 0 && h > 0) {
              svgW = Math.round(w);
              svgH = Math.round(h);
            }
          }
        }
        const img = await renderSvgToImage(cleanSvg);
        const w = Math.round((svgW || img.naturalWidth || 600) * scale);
        const h = Math.round((svgH || img.naturalHeight || 400) * scale);
        const wx = engine.screen_to_world_x(canvas.clientWidth / 2) - w / 2;
        const wy = engine.screen_to_world_y(canvas.clientHeight / 2) - h / 2;
        engine.add_diagram(img, wx, wy, w, h, code, svgDataUrl(cleanSvg), '{}');
        engine.set_accent_color(accentColor);
        engine.render();
        syncUi();
      } catch (err) {
        logger.error('Error in addDiagram:', err);
      }
    },
    scaleSelected: (factor) => act((e) => e.scale_selected(factor)),
    setAccentColor: (color) => act((e) => e.set_accent_color(color)),
    addText: (text, x = 250, y = 250, size = 28, color, fontFamily) =>
      act((e) => e.add_text(text, x, y, size, fontFamily || styleRef.current.fontFamily, color)),
    convertMagicStrokes: () => convertMagicStrokes(),
    exportPngBlob,
    exportSvgString: async () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not available');
      await exportPngBlob();
      const dataUrl = canvas.toDataURL('image/png');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
    },
    clearBoard: () => act((e) => e.clear_board()),
    zoomIn,
    zoomOut,
    resetView,
    getZoom: () => (engineRef.current ? Math.round(engineRef.current.get_zoom() * 100) : zoomLevel),
    setTool: (tool) => applyTool(tool, false),
    setStrokeColor: (color) => applyStyleChange({ strokeColor: color }),
    setStrokeWidth: (width) => applyStyleChange({ strokeWidth: width }),
    setEraserType: (type) => {
      engineRef.current?.set_eraser_type?.(type);
      if (type !== 'element') applyEraser({ eraserMode: type });
    },
    setEraserSize: (size) => applyEraser({ eraserSize: size }),
    undo,
    redo,
    deleteSelected,
    setDarkMode: (dark) => {
      engineRef.current?.set_dark_mode(dark);
      engineRef.current?.render();
      void rethemeDiagrams(dark);
    },
    setBackgroundColor: (color) => engineRef.current?.set_background_color(color),
    getEngine: () => engineRef.current,
    addImage: (img, x, y, w, h, assetId) => act((e) => e.add_image(img, x, y, w, h, assetId)),
    applyStyle: applyStyleChange,
    getSelectionInfo: () => selectionRef.current,
    selectAll: () => {
      if (toolRef.current !== 'select') applyTool('select');
      act((e) => e.select_all());
    },
    duplicateSelected,
    reorderSelected,
    setToolLocked: (locked) => {
      engineRef.current?.set_tool_locked(locked);
      setToolLocked(locked);
    },
    getUiStyle: () => styleRef.current,
  };
  const apiRef = useRef(api);
  apiRef.current = api;
  useImperativeHandle(ref, () => api);

  useEffect(() => {
    if (engineReady) onReady?.(apiRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady]);

  // ── Render ──────────────────────────────────────────────────────────────
  const engine = engineRef.current;
  const draftScreen =
    textDraft && engine ? { x: engine.world_to_screen_x(textDraft.worldX), y: engine.world_to_screen_y(textDraft.worldY), zoom: engine.get_zoom() || 1 } : null;

  const diagramSelected = activeTool === 'select' && selection.count === 1 && selection.kinds[0] === 'Diagram' && diagramAccent !== null;
  const extra: ReactNode = (
    <>
      {diagramSelected && (
        <>
          <fieldset className="ae-section" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="ae-section__label" style={{ padding: 0, marginBottom: 6 }}>
              Diagram accent
            </legend>
            <ColorPicker value={diagramAccent} quick={DIAGRAM_ACCENTS} onChange={(c) => void recolorDiagram(c)} />
          </fieldset>
          <fieldset className="ae-section" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="ae-section__label" style={{ padding: 0, marginBottom: 6 }}>
              Size
            </legend>
            <div className="ae-options">
              <button type="button" className="ae-opt" title="Shrink 10%" aria-label="Shrink diagram" onClick={() => api.scaleSelected?.(0.9)}>
                <MinusIcon />
              </button>
              <button type="button" className="ae-opt" title="Grow 10%" aria-label="Grow diagram" onClick={() => api.scaleSelected?.(1.1)}>
                <PlusIcon />
              </button>
            </div>
          </fieldset>
        </>
      )}
      {panelExtra?.(activeTool)}
    </>
  );
  const hasExtra = diagramSelected || !!panelExtra?.(activeTool);

  const defaultMenu = useMemo(
    () => (close: () => void) => (
      <>
        <MenuItem
          icon={<ExportIcon />}
          label="Export image"
          onSelect={() => {
            close();
            void apiRef.current.exportPngBlob().then((blob) => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'aerial.png';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            });
          }}
        />
        <MenuSeparator />
        <MenuItem
          icon={<TrashIcon />}
          label="Reset the canvas"
          danger
          onSelect={() => {
            close();
            apiRef.current.clearBoard();
          }}
        />
      </>
    ),
    [],
  );

  return (
    <div
      className={`ae-root ${className}`}
      data-theme={isDark ? 'dark' : 'light'}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none', background: paper }}
    >
      <canvas
        id={canvasId}
        ref={canvasRef}
        aria-label="Drawing canvas"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />

      {activeTool === 'eraser' && (
        <div
          ref={eraserCursorRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: uiStyle.eraserSize,
            height: uiStyle.eraserSize,
            borderRadius: '50%',
            pointerEvents: 'none',
            opacity: 0,
            zIndex: 12,
            willChange: 'transform',
            border: `1.5px solid ${isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)'}`,
            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            boxShadow: `0 0 0 1px ${isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.8)'}`,
          }}
        />
      )}

      {textDraft && draftScreen && (
        <InlineTextEditor
          key={`${String(textDraft.elementId)}-${textDraft.worldX}-${textDraft.worldY}`}
          draft={textDraft}
          screenX={draftScreen.x}
          screenY={draftScreen.y}
          zoom={draftScreen.zoom}
          displayColor={themedColor(textDraft.color, isDark)}
          onCommit={commitText}
        />
      )}

      {showWelcome && engineReady && isEmpty && !textDraft && <WelcomeScreen logo={logo ?? <span>Aerial</span>} items={welcomeItems} hasHelp={!!onHelp} />}

      {showToolbar && engineReady && (
        <div className="ae-layer">
          <div className="ae-top">
            <div className="ae-row" style={{ alignItems: 'flex-start' }}>
              <MainMenu>{menu ?? defaultMenu}</MainMenu>
            </div>
            {!readOnly && (
              <div className="ae-top-center">
                <Toolbar
                  activeTool={activeTool}
                  lastPen={uiStyle.lastPen}
                  locked={toolLocked}
                  onToggleLock={toggleLock}
                  onSelectTool={(t) => applyTool(t)}
                  onInsertImage={insertImage}
                  extraTools={extraTools}
                />
              </div>
            )}
            <div className="ae-row">{topRight}</div>
          </div>

          {!readOnly && (
            <PropertiesPanel
                tool={activeTool}
                selection={selection}
                style={uiStyle}
                onChange={applyStyleChange}
                onPenChange={(p) => applyTool(p)}
                onEraser={applyEraser}
                onLayer={reorderSelected}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
                extra={hasExtra ? extra : undefined}
              />
          )}

          <div className="ae-bottom">
            <ZoomBar
              zoom={zoomLevel}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onReset={resetView}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo && !readOnly}
              canRedo={canRedo && !readOnly}
            />
            {onHelp && <HelpButton onClick={onHelp} />}
          </div>
        </div>
      )}

      {isConvertingMagic && (
        <div className="ae-toast" role="status">
          Recognizing handwriting…
        </div>
      )}

      {!engineReady && !loadError && (
        <div role="status" aria-label="Loading canvas" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 30 }}>
          <span className="ae-spinner" />
        </div>
      )}
      {loadError && (
        <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 30, padding: 24 }}>
          <div className="ae-dialog" style={{ position: 'static' }}>
            <h2>Canvas failed to load</h2>
            <p style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{loadError}</p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) insertImageFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
});
