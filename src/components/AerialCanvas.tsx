// ── Aerial Canvas Library — Core Embeddable Component ───────────────────────
// A self-contained, Tauri-free canvas component that can be embedded in any
// React 19 application. Owns the WASM lifecycle, pointer/touch events,
// resize handling, animation loop, and optional built-in toolbar.

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { loadAerialEngine } from '../lib/wasm-loader';
import {
  AerialToolbar,
  AerialZoomBar,
  AerialSettingsPopover,
} from './AerialToolbar';
import { AerialDraggableTextBox } from './AerialDraggableTextBox';
import { Edit3 } from 'lucide-react';
import type {
  AerialEngine,
  AerialCanvasProps,
  AerialCanvasRef,
  ToolId,
} from '../lib/types';
import { createLogger } from '../lib/logger';

const logger = createLogger('AerialCanvas');

// ── Unique canvas ID counter (supports multiple instances) ──────────────────
let canvasIdCounter = 0;

// ── Component ───────────────────────────────────────────────────────────────

export const AerialCanvas = forwardRef<AerialCanvasRef, AerialCanvasProps>(
  function AerialCanvas(props, ref) {
    const {
      initialScene,
      initialState,
      onChange,
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
      onChangeBackgroundColor,
      magicLanguage = 'en',
      magicFont = "'Space Grotesk', sans-serif",
      eraserType: propEraserType = 'precision',
      eraserSize: propEraserSize = 24,
      onEraserTypeChange,
      onToolChange,
      onNodeDoubleClick,
    } = props;

    // ── Refs ──────────────────────────────────────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<AerialEngine | null>(null);
    const eraserCursorRef = useRef<HTMLDivElement | null>(null);
    const initStarted = useRef(false);
    const [canvasId] = useState(() => `aerial-canvas-${canvasIdCounter++}`);

    // ── Canvas state ──────────────────────────────────────────────────────
    const [engineReady, setEngineReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<ToolId>('freedraw');
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [fillColor] = useState('transparent');
    const [strokeWidth, setStrokeWidth] = useState(2.5);
    const [eraserSize, setEraserSize] = useState(propEraserSize);
    const [eraserType, setEraserTypeState] = useState<'stroke' | 'precision' | 'element'>(propEraserType);
    const [fountainSharpness, setFountainSharpness] = useState(0.5);
    const [isRough, setIsRough] = useState(true);
    const [isCurved, setIsCurved] = useState(true);
    const [zoomLevel, setZoomLevel] = useState(100);
    const [showSettings, setShowSettings] = useState(false);
    const [typingText, setTypingText] = useState<{
      elementId?: bigint | null;
      screenX: number;
      screenY: number;
      worldX: number;
      worldY: number;
      value: string;
      fontSize?: number;
      fontFamily?: string;
      color?: string;
      width?: number;
      height?: number;
    } | null>(null);
    const [selectedTextEl, setSelectedTextEl] = useState<{
      id: bigint;
      screenX: number;
      screenY: number;
      worldX: number;
      worldY: number;
      value: string;
      fontSize: number;
      fontFamily: string;
      color: string;
      width: number;
      height: number;
    } | null>(null);
    const [isConvertingMagic, setIsConvertingMagic] = useState(false);
    const magicDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [fontFamily] = useState('Caveat');

    // Determine dark mode from prop
    const isDarkMode = theme === 'dark';

    // ── Pointer tracking refs ─────────────────────────────────────────────
    const isDrawingRef = useRef(false);
    const activeDrawingPointerIdRef = useRef<number | null>(null);
    const activeDrawingPointerTypeRef = useRef<string | null>(null);
    const activePenIdRef = useRef<number | null>(null);
    const prevToolRef = useRef<ToolId | null>(null);
    const palmRejectionRef = useRef(palmRejection);
    useEffect(() => {
      palmRejectionRef.current = palmRejection;
    }, [palmRejection]);

    const updateZoom = useCallback((pct: number) => {
      setZoomLevel(pct);
      onZoomChange?.(pct);
    }, [onZoomChange]);

    // Touch / pinch state
    const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const pinchStartDistRef = useRef<number | null>(null);
    const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null);

    // ── WASM Init ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (initStarted.current) return;
      initStarted.current = true;

      async function boot() {
        try {
          const canvas = canvasRef.current!;
          const parent = canvas.parentElement!;
          const dpr = window.devicePixelRatio || 1;
          canvas.width = parent.clientWidth * dpr;
          canvas.height = parent.clientHeight * dpr;

          const engine = await loadAerialEngine(canvasId, {
            basePath: wasmBasePath,
          });

          engine.set_dpr(dpr);

          // Load initial state/scene
          if (initialState) {
            engine.import_full_state(initialState);
          } else if (initialScene) {
            engine.load_scene_json(initialScene);
          }

          // Sync React state → engine
          engine.set_dark_mode(isDarkMode);
          if (backgroundColor && typeof (engine as any).set_background_color === 'function') {
            (engine as any).set_background_color(backgroundColor);
          }
          engine.set_grid_type('dots');
          engine.set_stroke_color(strokeColor);
          engine.set_fill_color(fillColor);
          engine.set_stroke_width(strokeWidth);
          engine.set_is_rough(isRough);
          engine.set_is_curved(isCurved);
          if (typeof engine.set_eraser_type === 'function') {
            engine.set_eraser_type(eraserType);
          }
          if (typeof engine.set_eraser_radius === 'function') {
            engine.set_eraser_radius(eraserSize / 2);
          } else if (typeof engine.set_eraser_size === 'function') {
            engine.set_eraser_size(eraserSize);
          }
          engine.set_tool_freedraw();

          engine.render();
          engineRef.current = engine;
          setEngineReady(true);

          // ResizeObserver for dynamic canvas sizing
          const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const { width, height } = entry.contentRect;
              const currentDpr = window.devicePixelRatio || 1;
              canvas.width = width * currentDpr;
              canvas.height = height * currentDpr;
              engine.set_dpr(currentDpr);
              engine.render();
            }
          });
          observer.observe(canvas);

          return () => observer.disconnect();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setLoadError(msg);
        }
      }

      boot();

      return () => {
        if (engineRef.current) {
          engineRef.current.free?.();
          engineRef.current = null;
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Notify onReady ────────────────────────────────────────────────────
    useEffect(() => {
      if (engineReady && onReady && refApi.current) {
        onReady(refApi.current);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engineReady]);

    // ── Animation Loop ────────────────────────────────────────────────────
    useEffect(() => {
      if (!engineReady) return;
      let animationFrameId: number;
      let errorLogged = false;
      const loop = () => {
        const e = engineRef.current;
        if (e && e.tick_animations) {
          try {
            e.tick_animations();
          } catch (err) {
            if (!errorLogged) {
              logger.warn('tick_animations threw:', err);
              errorLogged = true;
            }
          }
        }
        animationFrameId = requestAnimationFrame(loop);
      };
      loop();
      return () => cancelAnimationFrame(animationFrameId);
    }, [engineReady]);

    // ── onChange Dirty Check Loop ──────────────────────────────────────────
    useEffect(() => {
      if (!engineReady || !onChange) return;
      const interval = setInterval(() => {
        const e = engineRef.current;
        if (!e) return;
        const needsNotify = e.check_and_clear_dirty();
        if (needsNotify) {
          onChange(e.get_scene_json());
        }
      }, changeInterval);
      return () => clearInterval(interval);
    }, [engineReady, onChange, changeInterval]);

    // ── Dark mode sync ────────────────────────────────────────────────────
    useEffect(() => {
      if (engineReady && engineRef.current) {
        engineRef.current.set_dark_mode(isDarkMode);
        engineRef.current.render();
      }
    }, [isDarkMode, engineReady]);

    // ── Background color sync ──────────────────────────────────────────────
    useEffect(() => {
      if (engineReady && engineRef.current && backgroundColor !== undefined) {
        if (typeof (engineRef.current as any).set_background_color === 'function') {
          (engineRef.current as any).set_background_color(backgroundColor);
        }
        engineRef.current.render();
      }
    }, [backgroundColor, engineReady]);

    // ── Prevent native elastic scroll on canvas ───────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const preventScroll = (e: WheelEvent) => e.preventDefault();
      canvas.addEventListener('wheel', preventScroll, { passive: false });
      return () => canvas.removeEventListener('wheel', preventScroll);
    }, [engineReady]);

    // ── Eraser prop sync ──────────────────────────────────────────────────
    useEffect(() => {
      if (propEraserType && propEraserType !== eraserType) {
        setEraserTypeState(propEraserType);
        engineRef.current?.set_eraser_type?.(propEraserType);
      }
    }, [propEraserType]);

    useEffect(() => {
      if (propEraserSize && propEraserSize !== eraserSize) {
        setEraserSize(propEraserSize);
        if (engineRef.current) {
          if (typeof engineRef.current.set_eraser_radius === 'function') {
            engineRef.current.set_eraser_radius(propEraserSize / 2);
          } else if (typeof engineRef.current.set_eraser_size === 'function') {
            engineRef.current.set_eraser_size(propEraserSize);
          }
        }
      }
    }, [propEraserSize]);

    const changeEraserType = useCallback((t: 'stroke' | 'precision' | 'element') => {
      setEraserTypeState(t);
      engineRef.current?.set_eraser_type?.(t);
      onEraserTypeChange?.(t);
    }, [onEraserTypeChange]);

    const changeEraserSize = useCallback((s: number) => {
      setEraserSize(s);
      if (engineRef.current) {
        if (typeof engineRef.current.set_eraser_radius === 'function') {
          engineRef.current.set_eraser_radius(s / 2);
        } else if (typeof engineRef.current.set_eraser_size === 'function') {
          engineRef.current.set_eraser_size(s);
        }
      }
    }, []);

    const cycleEraserType = useCallback(() => {
      const nextType: 'stroke' | 'precision' | 'element' =
        eraserType === 'stroke' ? 'precision' : eraserType === 'precision' ? 'element' : 'stroke';
      changeEraserType(nextType);
    }, [eraserType, changeEraserType]);

    // ── Tool selection ────────────────────────────────────────────────────
    const applyTool = useCallback((id: ToolId, notifyParent: boolean = true) => {
      if (readOnly) return;
      if (notifyParent) {
        onToolChange?.(id);
      }
      setActiveTool((prev) => {
        if (prev === id) {
          if (id === 'eraser') {
            cycleEraserType();
          } else if (['freedraw', 'fountain', 'highlighter', 'rectangle', 'ellipse', 'line', 'arrow'].includes(id)) {
            setShowSettings(s => !s);
          }
          return prev;
        }
        setShowSettings(false);
        if (id !== 'magic_pen' && magicDebounceTimerRef.current) {
          clearTimeout(magicDebounceTimerRef.current);
          magicDebounceTimerRef.current = null;
        }
        const e = engineRef.current;
        if (!e) return id;
        switch (id) {
          case 'freedraw':  e.set_tool_freedraw();    break;
          case 'fountain':  e.set_tool_fountain_pen(); break;
          case 'rectangle': e.set_tool_rectangle();   break;
          case 'ellipse':   e.set_tool_ellipse();     break;
          case 'line':      e.set_tool_line();        break;
          case 'arrow':     e.set_tool_arrow();       break;
          case 'select':    e.set_tool_select();      break;
          case 'hand':      e.set_tool_hand();        break;
          case 'highlighter': e.set_tool_highlighter(); break;
          case 'eraser':    e.set_tool_eraser();      break;
          case 'laser_pen': e.set_tool_laser_pen();   break;
          case 'magic_pen': e.set_tool_magic_pen();   break;
          case 'text':      e.set_tool_text();        break;
        }
        return id;
      });
    }, [readOnly, onToolChange, cycleEraserType]);

    const selectTool = useCallback((id: ToolId) => {
      applyTool(id, true);
    }, [applyTool]);

    // ── Color / width helpers ─────────────────────────────────────────────
    const changeColor = useCallback((color: string) => {
      setStrokeColor(color);
      engineRef.current?.set_stroke_color(color);
    }, []);

    const changeWidth = useCallback((w: number) => {
      setStrokeWidth(w);
      engineRef.current?.set_stroke_width(w);
    }, []);

    const changeSharpness = useCallback((s: number) => {
      setFountainSharpness(s);
      engineRef.current?.set_fountain_sharpness(s);
    }, []);

    // ── Magic Pen Handwriting Recognition Pipeline ────────────────────────
    const convertMagicStrokes = useCallback(async (): Promise<string | null> => {
      const engine = engineRef.current;
      if (!engine) return null;
      const jsonStr = engine.extract_magic_strokes();
      if (!jsonStr) return null;
      try {
        const parsed = JSON.parse(jsonStr);
        const { ink, bounds } = parsed;
        if (!ink || !Array.isArray(ink) || ink.length === 0) return null;

        setIsConvertingMagic(true);
        const itcLang = magicLanguage || 'en';
        const url = `https://inputtools.google.com/request?itc=${itcLang}-t-i0-handwrit&app=translate`;

        const payload = {
          app_version: 0.4,
          api_level: '533.0.0',
          device: typeof navigator !== 'undefined' ? navigator.userAgent : 'AerialCanvas',
          input_type: '0',
          options: 'enable_pre_space',
          requests: [
            {
              writing_guide: {
                writing_area_width: Math.max(800, (bounds?.max_x || 800) - (bounds?.min_x || 0)),
                writing_area_height: Math.max(300, (bounds?.max_y || 300) - (bounds?.min_y || 0)),
              },
              ink: ink,
              language: itcLang,
            },
          ],
        };

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          throw new Error(`Recognition API HTTP error: ${resp.status}`);
        }

        const data = await resp.json();
        if (data && data[0] === 'SUCCESS' && data[1]?.[0]?.[1]?.[0]) {
          const recognized = data[1][0][1][0] as string;
          const targetX = bounds?.min_x ?? 250;
          // Align text with the baseline: 28px font size
          const targetY = bounds?.baseline_y ? bounds.baseline_y - 28.0 : (bounds?.min_y ?? 250);
          const font = magicFont || "'Space Grotesk', sans-serif";
          engine.add_text(recognized, targetX, targetY, 28, font, strokeColor);
          engine.render();
          return recognized;
        }
      } catch (err) {
        logger.warn('Handwriting recognition failed:', err);
      } finally {
        setIsConvertingMagic(false);
        engine.render();
      }
      return null;
    }, [magicLanguage, magicFont, strokeColor]);

    // ── Pointer events ────────────────────────────────────────────────────
    const onPointerDown = useCallback((e: React.PointerEvent) => {
      if (!engineReady || !engineRef.current || readOnly) return;

      // Multi-touch tracking
      if (e.pointerType === 'touch') {
        activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouchesRef.current.size === 2) {
          const touches = Array.from(activeTouchesRef.current.values());
          pinchStartDistRef.current = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
          lastTouchCenterRef.current = {
            x: (touches[0].x + touches[1].x) / 2,
            y: (touches[0].y + touches[1].y) / 2,
          };
          if (activeDrawingPointerTypeRef.current === 'touch') {
            activeDrawingPointerIdRef.current = null;
            activeDrawingPointerTypeRef.current = null;
            isDrawingRef.current = false;
            if (engineRef.current) {
              const rect = canvasRef.current!.getBoundingClientRect();
              engineRef.current.on_mouse_up(e.clientX - rect.left, e.clientY - rect.top);
            }
          }
          return;
        }
      }

      // Palm rejection
      if (palmRejectionRef.current && e.pointerType === 'touch' && activeTool !== 'hand') return;

      // Stylus synthetic mouse filter
      if (e.pointerType === 'mouse' && (e.nativeEvent as unknown as { _isStylusSynthetic?: boolean })._isStylusSynthetic) return;
      if (e.pointerType === 'mouse' && activePenIdRef.current !== null) return;
      if (e.pointerType === 'pen') activePenIdRef.current = e.pointerId;

      if (magicDebounceTimerRef.current) {
        clearTimeout(magicDebounceTimerRef.current);
        magicDebounceTimerRef.current = null;
      }

      // Already drawing with another pointer
      if (activeDrawingPointerIdRef.current !== null) return;

      activeDrawingPointerIdRef.current = e.pointerId;
      activeDrawingPointerTypeRef.current = e.pointerType;

      e.preventDefault();
      if (e.target instanceof Element && e.target.id === canvasId) {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      }

      isDrawingRef.current = true;

      const rect = canvasRef.current!.getBoundingClientRect();

      if (activeTool === 'text') {
        if (typingText) return;
        if (engineRef.current) {
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;

          // Check if an existing text element was clicked
          const elJson = engineRef.current.get_element_at?.(screenX, screenY);
          if (elJson) {
            try {
              const el = JSON.parse(elJson);
              if (el.kind && el.kind.toLowerCase() === 'text') {
                const sx = engineRef.current.world_to_screen_x(el.x);
                const sy = engineRef.current.world_to_screen_y(el.y);
                setTypingText({
                  elementId: BigInt(el.id),
                  screenX: Math.round(sx),
                  screenY: Math.round(sy),
                  worldX: el.x,
                  worldY: el.y,
                  value: el.text || '',
                  fontSize: el.font_size || 28,
                  fontFamily: el.font_family || "'Inter', sans-serif",
                  color: el.stroke_color || strokeColor,
                  width: Math.max(260, Math.round((el.w || 260) * (engineRef.current.get_zoom() || 1))),
                  height: Math.max(100, Math.round((el.h || 100) * (engineRef.current.get_zoom() || 1))),
                });
                setSelectedTextEl(null);
                return;
              }
            } catch (_) {}
          }

          const worldX = engineRef.current.screen_to_world_x(screenX);
          const worldY = engineRef.current.screen_to_world_y(screenY);
          setTypingText({
            elementId: null,
            screenX,
            screenY,
            worldX,
            worldY,
            value: '',
            fontSize: 28,
            fontFamily: "'Inter', sans-serif",
            color: strokeColor,
            width: 320,
            height: 140,
          });
        }
        return;
      }

      engineRef.current?.on_mouse_down(e.clientX - rect.left, e.clientY - rect.top);
    }, [activeTool, typingText, engineReady, readOnly, canvasId, strokeColor, eraserSize]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      if (!engineReady || !engineRef.current) return;

      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Always update custom eraser cursor directly on DOM element - zero lag, never gets stuck
      if (activeTool === 'eraser' && eraserCursorRef.current) {
        eraserCursorRef.current.style.transform = `translate3d(${x - eraserSize / 2}px, ${y - eraserSize / 2}px, 0)`;
        eraserCursorRef.current.style.display = 'block';
      }

      // 2-finger pinch/pan
      if (e.pointerType === 'touch') {
        activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouchesRef.current.size === 2) {
          const touches = Array.from(activeTouchesRef.current.values());
          const newDist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
          const newCenter = {
            x: (touches[0].x + touches[1].x) / 2,
            y: (touches[0].y + touches[1].y) / 2,
          };
          const screenX = newCenter.x - rect.left;
          const screenY = newCenter.y - rect.top;
          if (lastTouchCenterRef.current) {
            const dx = lastTouchCenterRef.current.x - newCenter.x;
            const dy = lastTouchCenterRef.current.y - newCenter.y;
            if (pinchStartDistRef.current && Math.abs(newDist - pinchStartDistRef.current) > 3) {
              const zoomDelta = (pinchStartDistRef.current - newDist) * 1.5;
              const newZoom = engineRef.current.on_wheel(0, zoomDelta, true, screenX, screenY);
              updateZoom(Math.round(newZoom * 100));
              pinchStartDistRef.current = newDist;
            } else if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
              engineRef.current.on_wheel(dx, dy, false, screenX, screenY);
            }
          }
          lastTouchCenterRef.current = newCenter;
          return;
        }
      }

      if (activeDrawingPointerIdRef.current !== e.pointerId) return;
      if (e.pointerType === 'mouse' && activePenIdRef.current !== null) return;

      if (isDrawingRef.current) engineRef.current?.on_mouse_move(x, y);
    }, [activeTool, engineReady, updateZoom, eraserSize]);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
      if (e.pointerType === 'touch') {
        activeTouchesRef.current.delete(e.pointerId);
        if (activeTouchesRef.current.size < 2) {
          pinchStartDistRef.current = null;
          lastTouchCenterRef.current = null;
        }
      }
      if (e.pointerType === 'pen' && e.pointerId === activePenIdRef.current) {
        activePenIdRef.current = null;
      }
      if (activeDrawingPointerIdRef.current !== e.pointerId) return;

      activeDrawingPointerIdRef.current = null;
      activeDrawingPointerTypeRef.current = null;
      if (e.target instanceof Element) {
        try { e.target.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
      }
      isDrawingRef.current = false;
      if (!engineReady || !engineRef.current) return;

      const rect = canvasRef.current!.getBoundingClientRect();
      engineRef.current?.on_mouse_up(e.clientX - rect.left, e.clientY - rect.top);

      if (activeTool === 'select') {
        const elJson = engineRef.current?.get_selected_element_json();
        if (elJson) {
          try {
            const el = JSON.parse(elJson);
            if (el.kind && el.kind.toLowerCase() === 'text') {
              const sx = engineRef.current!.world_to_screen_x(el.x);
              const sy = engineRef.current!.world_to_screen_y(el.y);
              setSelectedTextEl({
                id: BigInt(el.id),
                screenX: Math.round(sx),
                screenY: Math.round(sy),
                worldX: el.x,
                worldY: el.y,
                value: el.text || '',
                fontSize: el.font_size || 28,
                fontFamily: el.font_family || "'Inter', sans-serif",
                color: el.stroke_color || strokeColor,
                width: Math.max(260, Math.round((el.w || 260) * (engineRef.current!.get_zoom() || 1))),
                height: Math.max(100, Math.round((el.h || 100) * (engineRef.current!.get_zoom() || 1))),
              });
            } else {
              setSelectedTextEl(null);
            }
          } catch (_) {
            setSelectedTextEl(null);
          }
        } else {
          setSelectedTextEl(null);
        }
      } else {
        setSelectedTextEl(null);
      }

      if (activeTool === 'magic_pen') {
        if (magicDebounceTimerRef.current) {
          clearTimeout(magicDebounceTimerRef.current);
        }
        magicDebounceTimerRef.current = setTimeout(() => {
          convertMagicStrokes();
        }, 1200);
      }
    }, [engineReady, activeTool, convertMagicStrokes, strokeColor]);

    const onPointerLeave = useCallback((e: React.PointerEvent) => {
      if (isDrawingRef.current && activeDrawingPointerIdRef.current === e.pointerId) {
        onPointerUp(e);
      }
      if (eraserCursorRef.current) {
        eraserCursorRef.current.style.display = 'none';
      }
    }, [onPointerUp]);

    const onPointerEnter = useCallback((e: React.PointerEvent) => {
      if (activeTool === 'eraser' && eraserCursorRef.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        eraserCursorRef.current.style.transform = `translate3d(${x - eraserSize / 2}px, ${y - eraserSize / 2}px, 0)`;
        eraserCursorRef.current.style.display = 'block';
      }
    }, [activeTool, eraserSize]);

    const onDoubleClick = useCallback((e: React.MouseEvent) => {
      if (!engineRef.current || readOnly) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;

      // 1. Direct hit test on element at double-click position
      const atElJson = engineRef.current.get_element_at?.(rawX, rawY);
      if (atElJson) {
        try {
          const el = JSON.parse(atElJson);
          if (el.kind && el.kind.toLowerCase() === 'text') {
            const screenX = engineRef.current.world_to_screen_x(el.x);
            const screenY = engineRef.current.world_to_screen_y(el.y);
            setTypingText({
              elementId: BigInt(el.id),
              screenX: Math.round(screenX),
              screenY: Math.round(screenY),
              worldX: el.x,
              worldY: el.y,
              value: el.text || '',
              fontSize: el.font_size || 28,
              fontFamily: el.font_family || "'Inter', sans-serif",
              color: el.stroke_color || strokeColor,
              width: Math.max(260, Math.round((el.w || 260) * (engineRef.current.get_zoom() || 1))),
              height: Math.max(100, Math.round((el.h || 100) * (engineRef.current.get_zoom() || 1))),
            });
            setSelectedTextEl(null);
            return;
          }
        } catch (_) {}
      }

      // 2. Delegate to on_double_click
      const hitIdStr = engineRef.current.on_double_click(rawX, rawY);
      if (hitIdStr) {
        const parts = hitIdStr.split(',');
        if (parts[1]) {
          if (onNodeDoubleClick && engineRef.current) {
            const elId = BigInt(parts[0]);
            const code = engineRef.current.get_element_code(elId);
            onNodeDoubleClick(elId, parts[1], code);
          }
        } else {
          // Check if hit element is a text element
          const elJson = engineRef.current.get_selected_element_json();
          if (elJson) {
            try {
              const el = JSON.parse(elJson);
              if (el.kind && el.kind.toLowerCase() === 'text') {
                const screenX = engineRef.current.world_to_screen_x(el.x);
                const screenY = engineRef.current.world_to_screen_y(el.y);
                setTypingText({
                  elementId: BigInt(el.id),
                  screenX: Math.round(screenX),
                  screenY: Math.round(screenY),
                  worldX: el.x,
                  worldY: el.y,
                  value: el.text || '',
                  fontSize: el.font_size || 28,
                  fontFamily: el.font_family || "'Inter', sans-serif",
                  color: el.stroke_color || strokeColor,
                  width: Math.max(260, Math.round((el.w || 260) * (engineRef.current.get_zoom() || 1))),
                  height: Math.max(100, Math.round((el.h || 100) * (engineRef.current.get_zoom() || 1))),
                });
                setSelectedTextEl(null);
                return;
              }
            } catch (err) {
              logger.warn('Failed to parse selected element for text edit:', err);
            }
          }
        }
      }
    }, [readOnly, onNodeDoubleClick, strokeColor]);

    const onWheel = useCallback((e: React.WheelEvent) => {
      if (!engineRef.current) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const rect = canvasRef.current!.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const newZoom = engineRef.current.on_wheel(e.deltaX, e.deltaY, ctrl, screenX, screenY);
      if (ctrl) updateZoom(Math.round(newZoom * 100));
    }, [updateZoom]);

    // ── Keyboard shortcuts ────────────────────────────────────────────────
    useEffect(() => {
      if (readOnly) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          engineRef.current?.delete_selected();
          setSelectedTextEl(null);
        }
        if (e.key === 'Enter') {
          if (selectedTextEl) {
            e.preventDefault();
            setTypingText({
              elementId: selectedTextEl.id,
              screenX: selectedTextEl.screenX,
              screenY: selectedTextEl.screenY,
              worldX: selectedTextEl.worldX,
              worldY: selectedTextEl.worldY,
              value: selectedTextEl.value,
              fontSize: selectedTextEl.fontSize,
              fontFamily: selectedTextEl.fontFamily,
              color: selectedTextEl.color,
              width: selectedTextEl.width,
              height: selectedTextEl.height,
            });
            setSelectedTextEl(null);
            return;
          }
          if (activeTool === 'select' && engineRef.current) {
            const elJson = engineRef.current.get_selected_element_json();
            if (elJson) {
              try {
                const el = JSON.parse(elJson);
                if (el.kind && el.kind.toLowerCase() === 'text') {
                  e.preventDefault();
                  const sx = engineRef.current.world_to_screen_x(el.x);
                  const sy = engineRef.current.world_to_screen_y(el.y);
                  setTypingText({
                    elementId: BigInt(el.id),
                    screenX: Math.round(sx),
                    screenY: Math.round(sy),
                    worldX: el.x,
                    worldY: el.y,
                    value: el.text || '',
                    fontSize: el.font_size || 28,
                    fontFamily: el.font_family || "'Inter', sans-serif",
                    color: el.stroke_color || strokeColor,
                    width: Math.max(260, Math.round((el.w || 260) * (engineRef.current.get_zoom() || 1))),
                    height: Math.max(100, Math.round((el.h || 100) * (engineRef.current.get_zoom() || 1))),
                  });
                  setSelectedTextEl(null);
                  return;
                }
              } catch (_) {}
            }
          }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) engineRef.current?.redo();
          else engineRef.current?.undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          engineRef.current?.redo();
        }
        if (e.key === ' ') {
          e.preventDefault();
          if (activeTool !== 'hand') {
            prevToolRef.current = activeTool;
            setActiveTool('hand');
            engineRef.current?.set_tool_hand();
          }
        }
        if (e.key.toLowerCase() === 'e' || e.key === '9') {
          if (activeTool === 'eraser') {
            e.preventDefault();
            cycleEraserType();
          }
        }
        if (e.key === 'Escape') {
          setShowSettings(false);
          setSelectedTextEl(null);
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === ' ') {
          const prev = prevToolRef.current;
          if (prev) {
            setActiveTool(prev);
            applyTool(prev, true);
            prevToolRef.current = null;
          }
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readOnly, activeTool, selectedTextEl, strokeColor, cycleEraserType]);

    // ── Cursor class ──────────────────────────────────────────────────────
    const cursorClass =
      activeTool === 'hand'   ? 'cursor-grab' :
      activeTool === 'select' ? 'cursor-default' :
      activeTool === 'eraser' ? 'cursor-none' :
      'cursor-crosshair';

    // ── Imperative ref API ────────────────────────────────────────────────
    const refApi = useRef<AerialCanvasRef | null>(null);

    const apiInstance: AerialCanvasRef = {
      getSceneJson: () => engineRef.current?.get_scene_json() ?? '{}',
      loadSceneJson: (json: string) => {
        engineRef.current?.load_scene_json(json);
        engineRef.current?.render();
      },
      exportFullState: () => engineRef.current?.export_full_state() ?? new Uint8Array(),
      importFullState: (bytes: Uint8Array) => {
        engineRef.current?.import_full_state(bytes);
        engineRef.current?.render();
      },
      addDiagram: (code: string, svg: string) => {
        if (!engineRef.current) return;
        const svg64 = btoa(unescape(encodeURIComponent(svg)));
        const imgSrc = 'data:image/svg+xml;base64,' + svg64;
        const img = new Image();
        img.onload = () => {
          const scale = 2.0;
          engineRef.current?.add_diagram(img, 100, 100, img.width * scale, img.height * scale, code, imgSrc, '{}');
          engineRef.current?.render();
        };
        img.src = imgSrc;
      },
      addText: (text: string, x = 250, y = 250, size = 28, color?: string, fontFamily?: string) => {
        engineRef.current?.add_text(text, x, y, size, fontFamily || "'Inter', sans-serif", color);
        engineRef.current?.render();
      },
      convertMagicStrokes: () => convertMagicStrokes(),
      exportPngBlob: () => {
        return new Promise<Blob>((resolve, reject) => {
          const canvas = canvasRef.current;
          if (!canvas) return reject(new Error('Canvas not available'));
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to export PNG'));
          }, 'image/png');
        });
      },
      exportSvgString: () => {
        return new Promise<string>((resolve, reject) => {
          const canvas = canvasRef.current;
          if (!canvas) return reject(new Error('Canvas not available'));
          const dataUrl = canvas.toDataURL('image/png');
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
          resolve(svg);
        });
      },
      clearBoard: () => {
        engineRef.current?.clear_board();
        engineRef.current?.render();
      },
      zoomIn: () => {
        if (engineRef.current) updateZoom(Math.round(engineRef.current.zoom_in() * 100));
      },
      zoomOut: () => {
        if (engineRef.current) updateZoom(Math.round(engineRef.current.zoom_out() * 100));
      },
      resetView: () => {
        if (engineRef.current) updateZoom(Math.round(engineRef.current.reset_view() * 100));
      },
      getZoom: () => {
        if (!engineRef.current) return zoomLevel;
        return Math.round(engineRef.current.get_zoom() * 100);
      },
      setTool: (tool: ToolId) => applyTool(tool, false),
      setStrokeColor: (color: string) => changeColor(color),
      setStrokeWidth: (width: number) => changeWidth(width),
      setEraserType: (type: 'stroke' | 'precision' | 'element') => changeEraserType(type),
      setEraserSize: (size: number) => changeEraserSize(size),
      undo: () => { engineRef.current?.undo(); },
      redo: () => { engineRef.current?.redo(); },
      deleteSelected: () => { engineRef.current?.delete_selected(); },
      setDarkMode: (isDark: boolean) => {
        engineRef.current?.set_dark_mode(isDark);
        engineRef.current?.render();
      },
      setBackgroundColor: (color: string) => {
        if (engineRef.current) {
          if (typeof (engineRef.current as any).set_background_color === 'function') {
            (engineRef.current as any).set_background_color(color);
          }
          engineRef.current.render();
        }
      },
      getEngine: () => engineRef.current,
      addImage: (img, x, y, w, h, assetId) => {
        engineRef.current?.add_image(img, x, y, w, h, assetId);
        engineRef.current?.render();
      },
    };

    refApi.current = apiInstance;
    useImperativeHandle(ref, () => apiInstance, [selectTool, changeColor, changeWidth, fontFamily, updateZoom, zoomLevel]);

    // ── Render ────────────────────────────────────────────────────────────
    return (
      <div
        className={`relative w-full h-full overflow-hidden select-none ${isDarkMode ? 'dark' : ''} ${className}`}
        style={{ background: backgroundColor || 'var(--background, #fff)' }}
      >
        {/* Loading overlay */}
        {!engineReady && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-1.5 items-center justify-center h-7">
                <div className="w-2.5 h-2.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#6366f1] animate-bounce" />
              </div>
              <p className="text-[10px] text-muted-foreground font-mono tracking-[0.2em] uppercase">Loading Engine…</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center p-6 max-w-sm">
              <p className="text-sm font-semibold text-foreground mb-2">Engine failed to load</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted p-3 rounded-lg break-all">{loadError}</p>
            </div>
          </div>
        )}

        {/* Canvas */}
        <canvas
          id={canvasId}
          ref={canvasRef}
          style={{ background: backgroundColor || 'transparent' }}
          className={`block w-full h-full touch-none select-none ${cursorClass}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onPointerEnter={onPointerEnter}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
        />

        {/* Eraser cursor */}
        {activeTool === 'eraser' && (
          <div
            ref={eraserCursorRef}
            className="pointer-events-none absolute top-0 left-0 z-30 will-change-transform"
            style={{
              width: eraserSize,
              height: eraserSize,
              display: 'none',
            }}
          >
            <svg viewBox="0 0 40 40" width={eraserSize} height={eraserSize} className="overflow-visible">
              <circle
                cx="20"
                cy="20"
                r="18"
                fill={isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
                stroke={eraserType === 'precision' ? '#e73f07' : isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'}
                strokeWidth={eraserType === 'precision' ? '2' : '1.5'}
                strokeDasharray={eraserType === 'stroke' ? '4 2' : eraserType === 'precision' ? undefined : '2 2'}
              />
              {eraserType === 'precision' ? (
                <>
                  <line x1="15" y1="20" x2="25" y2="20" stroke="#e73f07" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="20" y1="15" x2="20" y2="25" stroke="#e73f07" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="1.5" fill="#e73f07" />
                </>
              ) : eraserType === 'element' ? (
                <>
                  <rect x="14" y="14" width="12" height="12" rx="2" fill="none" stroke={isDarkMode ? '#ffffff' : '#000000'} strokeWidth="1.5" />
                </>
              ) : (
                <>
                  <line x1="14" y1="20" x2="26" y2="20" stroke={isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'} strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="20" y1="14" x2="20" y2="26" stroke={isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'} strokeWidth="1.5" strokeLinecap="round" />
                </>
              )}
            </svg>
          </div>
        )}

        {/* Draggable & Droppable Text Box with Readjustment Features */}
        {typingText && (
          <AerialDraggableTextBox
            initialText={typingText.value}
            screenX={typingText.screenX}
            screenY={typingText.screenY}
            initialFontSize={typingText.fontSize || 28}
            initialFontFamily={typingText.fontFamily || "'Inter', sans-serif"}
            initialColor={typingText.color || strokeColor}
            initialWidth={typingText.width || 320}
            initialHeight={typingText.height || 140}
            isDarkMode={isDarkMode}
            onCommit={(data) => {
              const engine = engineRef.current;
              if (engine) {
                const wx = engine.screen_to_world_x(data.screenX);
                const wy = engine.screen_to_world_y(data.screenY);
                if (typingText.elementId != null) {
                  engine.update_text_element(
                    typingText.elementId,
                    data.text,
                    wx,
                    wy,
                    data.fontSize,
                    data.fontFamily,
                    data.color
                  );
                } else {
                  engine.add_text(data.text, wx, wy, data.fontSize, data.fontFamily, data.color);
                }
                engine.render();
                selectTool('select');
              }
              setTypingText(null);
            }}
            onCancel={() => setTypingText(null)}
            onDragMove={(newSx, newSy) => {
              if (engineRef.current) {
                const wx = engineRef.current.screen_to_world_x(newSx);
                const wy = engineRef.current.screen_to_world_y(newSy);
                setTypingText((prev) =>
                  prev ? { ...prev, screenX: newSx, screenY: newSy, worldX: wx, worldY: wy } : null
                );
              }
            }}
          />
        )}
        {selectedTextEl && !typingText && activeTool === 'select' && (
          <div
            style={{
              position: 'absolute',
              left: `${selectedTextEl.screenX}px`,
              top: `${Math.max(12, selectedTextEl.screenY - 42)}px`,
              zIndex: 45,
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--card)]/95 backdrop-blur-md border border-[#e73f07] shadow-xl text-xs font-mono text-[var(--foreground)] animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              type="button"
              onClick={() => {
                setTypingText({
                  elementId: selectedTextEl.id,
                  screenX: selectedTextEl.screenX,
                  screenY: selectedTextEl.screenY,
                  worldX: selectedTextEl.worldX,
                  worldY: selectedTextEl.worldY,
                  value: selectedTextEl.value,
                  fontSize: selectedTextEl.fontSize,
                  fontFamily: selectedTextEl.fontFamily,
                  color: selectedTextEl.color,
                  width: selectedTextEl.width,
                  height: selectedTextEl.height,
                });
                setSelectedTextEl(null);
              }}
              className="flex items-center gap-1.5 text-xs font-sans font-semibold text-[#e73f07] hover:underline cursor-pointer"
            >
              <Edit3 size={13} />
              <span>EDIT TEXT</span>
            </button>
            <span className="text-[10px] text-brand-gray font-mono pl-1 border-l border-brand-border">Press ↵ Enter</span>
          </div>
        )}

        {/* Magic Pen Guided Baseline & Handwriting HUD */}
        {activeTool === 'magic_pen' && (
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[var(--card)]/90 backdrop-blur-xl border border-[#e73f07]/80 shadow-lg text-[10px] font-mono tracking-wider text-[var(--foreground)] uppercase animate-in fade-in slide-in-from-top-2 duration-300">
            <span className={`w-2 h-2 rounded-full bg-[#e73f07] ${isConvertingMagic ? 'animate-ping' : 'animate-pulse'}`} />
            <span>
              {isConvertingMagic
                ? 'Converting handwriting to text…'
                : `Magic Pen · ${magicLanguage?.toUpperCase() || 'EN'} · Straight-Line Guide`}
            </span>
          </div>
        )}

        {/* Eraser Mode & Size HUD */}
        {activeTool === 'eraser' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-auto">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold px-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#e73f07] animate-pulse" />
              Eraser
            </span>
            <div className="w-px h-4 bg-[var(--border)]" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => changeEraserType('stroke')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase font-bold tracking-wider transition-all cursor-pointer ${
                  eraserType === 'stroke'
                    ? 'bg-[#e73f07] text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]'
                }`}
                title="Whole Stroke: Erases the entire stroke upon touch"
              >
                Stroke
              </button>
              <button
                type="button"
                onClick={() => changeEraserType('precision')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase font-bold tracking-wider transition-all cursor-pointer ${
                  eraserType === 'precision'
                    ? 'bg-[#e73f07] text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]'
                }`}
                title="Precision: Surgically cuts and trims exact points inside the circle"
              >
                Precision
              </button>
              <button
                type="button"
                onClick={() => changeEraserType('element')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase font-bold tracking-wider transition-all cursor-pointer ${
                  eraserType === 'element'
                    ? 'bg-[#e73f07] text-white shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]'
                }`}
                title="Object: Erases entire shapes, text, diagram or images upon touch"
              >
                Object
              </button>
            </div>
            <div className="w-px h-4 bg-[var(--border)]" />
            <div className="flex items-center gap-1">
              {[14, 24, 40, 64].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => changeEraserSize(sz)}
                  className={`w-6 h-6 rounded-md text-[10px] font-mono font-bold flex items-center justify-center transition-all cursor-pointer ${
                    eraserSize === sz
                      ? 'bg-[var(--foreground)] text-[var(--background)] font-black'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]'
                  }`}
                  title={`${sz}px size`}
                >
                  {sz === 14 ? 'S' : sz === 24 ? 'M' : sz === 40 ? 'L' : 'XL'}
                </button>
              ))}
            </div>
            <span className="hidden sm:inline-block text-[9px] font-mono text-[var(--muted-foreground)]/80 pl-1">
              (Tap E to cycle)
            </span>
          </div>
        )}

        {/* Built-in toolbar (optional) */}
        {showToolbar && engineReady && (
          <div className="absolute inset-0 z-50 pointer-events-none">
            <AerialToolbar
              activeTool={activeTool}
              onSelectTool={selectTool}
            />
            <AerialZoomBar
              zoomLevel={zoomLevel}
              onZoomIn={() => apiInstance.zoomIn()}
              onZoomOut={() => apiInstance.zoomOut()}
              onResetView={() => apiInstance.resetView()}
              onUndo={() => engineRef.current?.undo()}
              onRedo={() => engineRef.current?.redo()}
            />
            {showSettings && (
              <AerialSettingsPopover
                activeTool={activeTool}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                eraserSize={eraserSize}
                fountainSharpness={fountainSharpness}
                isRough={isRough}
                isCurved={isCurved}
                onChangeColor={changeColor}
                onChangeWidth={changeWidth}
                onChangeEraserSize={(s) => {
                  setEraserSize(s);
                  engineRef.current?.set_stroke_width(s / 4);
                }}
                onChangeSharpness={changeSharpness}
                onChangeRough={(rough) => {
                  setIsRough(rough);
                  engineRef.current?.set_is_rough(rough);
                }}
                onChangeCurved={(curved) => {
                  setIsCurved(curved);
                  engineRef.current?.set_is_curved(curved);
                }}
                backgroundColor={backgroundColor}
                onChangeBackgroundColor={(color) => {
                  if (onChangeBackgroundColor) {
                    onChangeBackgroundColor(color);
                  } else {
                    apiInstance.setBackgroundColor(color);
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
    );
  },
);
