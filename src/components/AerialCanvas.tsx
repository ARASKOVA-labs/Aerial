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
      onNodeDoubleClick,
    } = props;

    // ── Refs ──────────────────────────────────────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<AerialEngine | null>(null);
    const initStarted = useRef(false);
    const [canvasId] = useState(() => `aerial-canvas-${canvasIdCounter++}`);

    // ── Canvas state ──────────────────────────────────────────────────────
    const [engineReady, setEngineReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<ToolId>('freedraw');
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [fillColor] = useState('transparent');
    const [strokeWidth, setStrokeWidth] = useState(2.5);
    const [eraserSize, setEraserSize] = useState(24);
    const [fountainSharpness, setFountainSharpness] = useState(0.5);
    const [isRough, setIsRough] = useState(true);
    const [isCurved, setIsCurved] = useState(true);
    const [zoomLevel, setZoomLevel] = useState(100);
    const [showSettings, setShowSettings] = useState(false);
    const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
    const [typingText, setTypingText] = useState<{
      screenX: number; screenY: number;
      worldX: number; worldY: number;
      value: string;
    } | null>(null);
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

    // ── Tool selection ────────────────────────────────────────────────────
    const selectTool = useCallback((id: ToolId) => {
      if (readOnly) return;
      setActiveTool((prev) => {
        if (prev === id) {
          if (['freedraw', 'fountain', 'highlighter', 'rectangle', 'ellipse', 'line', 'arrow', 'eraser'].includes(id)) {
            setShowSettings(s => !s);
          }
          return prev;
        }
        setShowSettings(false);
        setEraserPos(null);
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
    }, [readOnly]);

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
          const worldX = engineRef.current.screen_to_world_x(screenX);
          const worldY = engineRef.current.screen_to_world_y(screenY);
          setTypingText({ screenX, screenY, worldX, worldY, value: '' });
        }
        return;
      }

      engineRef.current?.on_mouse_down(e.clientX - rect.left, e.clientY - rect.top);
    }, [activeTool, typingText, engineReady, readOnly, canvasId]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      if (!engineReady || !engineRef.current) return;

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
          const rect = canvasRef.current!.getBoundingClientRect();
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

      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (activeTool === 'eraser') setEraserPos({ x, y });
      if (isDrawingRef.current) engineRef.current?.on_mouse_move(x, y);
    }, [activeTool, engineReady, updateZoom]);

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
    }, [engineReady]);

    const onPointerLeave = useCallback((e: React.PointerEvent) => {
      if (isDrawingRef.current && activeDrawingPointerIdRef.current === e.pointerId) {
        onPointerUp(e);
      }
      setEraserPos(null);
    }, [onPointerUp]);

    const onPointerEnter = useCallback((e: React.PointerEvent) => {
      if (activeTool === 'eraser') {
        const rect = canvasRef.current!.getBoundingClientRect();
        setEraserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }, [activeTool]);

    const onDoubleClick = useCallback((e: React.MouseEvent) => {
      if (!engineRef.current || readOnly) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const hitIdStr = engineRef.current.on_double_click(e.clientX - rect.left, e.clientY - rect.top);
      if (hitIdStr) {
        const parts = hitIdStr.split(',');
        if (parts[1]) {
          if (onNodeDoubleClick && engineRef.current) {
            const elId = BigInt(parts[0]);
            const code = engineRef.current.get_element_code(elId);
            onNodeDoubleClick(elId, parts[1], code);
          }
        } else {
          // Text edit
          const text = engineRef.current.get_selected_text();
          if (text) {
            const newText = window.prompt('Edit text:', text);
            if (newText !== null) {
              engineRef.current.update_selected_text(newText);
              engineRef.current.render();
            }
          }
        }
      }
    }, [readOnly, onNodeDoubleClick]);

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
        if (e.key === 'Escape') setShowSettings(false);
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === ' ') {
          const prev = prevToolRef.current;
          if (prev) {
            setActiveTool(prev);
            selectTool(prev);
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
    }, [readOnly, activeTool]);

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
      addText: (text: string, x = 250, y = 250, size = 28, color?: string) => {
        engineRef.current?.add_text(text, x, y, size, fontFamily, color);
        engineRef.current?.render();
      },
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
      setTool: (tool: ToolId) => selectTool(tool),
      setStrokeColor: (color: string) => changeColor(color),
      setStrokeWidth: (width: number) => changeWidth(width),
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
        {activeTool === 'eraser' && eraserPos && (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: eraserPos.x - eraserSize / 2,
              top: eraserPos.y - eraserSize / 2,
              width: eraserSize,
              height: eraserSize,
            }}
          >
            <svg viewBox="0 0 40 40" width={eraserSize} height={eraserSize}>
              <circle cx="20" cy="20" r="18" fill={isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'} stroke={isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'} strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="12" y1="20" x2="28" y2="20" stroke={isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'} strokeWidth="1.5" strokeLinecap="round" />
              <line x1="20" y1="12" x2="20" y2="28" stroke={isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {/* Text input overlay */}
        {typingText && (
          <textarea
            autoFocus
            style={{
              position: 'absolute',
              left: typingText.screenX,
              top: typingText.screenY,
              transform: 'translateY(-14px)',
              fontFamily: 'Inter, Roboto, -apple-system, sans-serif',
              fontSize: '28px',
              fontWeight: 600,
              color: strokeColor || (isDarkMode ? '#ffffff' : '#0a0a0a'),
              background: 'transparent',
              border: '1.5px dashed #e73f07',
              borderRadius: '6px',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              minWidth: '60px',
              minHeight: '36px',
              zIndex: 40,
              padding: '2px 6px',
              margin: 0,
              lineHeight: 1.2,
            }}
            value={typingText.value}
            onChange={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
              e.target.style.width = 'auto';
              e.target.style.width = Math.max(60, e.target.scrollWidth) + 'px';
              setTypingText({ ...typingText, value: e.target.value });
            }}
            onBlur={() => {
              if (typingText.value.trim() && engineRef.current) {
                engineRef.current.add_text(typingText.value, typingText.worldX, typingText.worldY, 28, 'Inter, Roboto, sans-serif', strokeColor);
                engineRef.current.render();
                selectTool('select');
              }
              setTypingText(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setTypingText(null);
              }
            }}
          />
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
