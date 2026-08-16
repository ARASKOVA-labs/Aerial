import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, useAnimate } from "motion/react";
import {
  Menu,
  Plus,
  Pen,
  Square,
  Circle,
  Minus,
  Hand,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Type,
  Code, // For mermaid
  ArrowUpRight, // For arrows
  Highlighter, // For highlighter
  Moon,
  Sun,
  Grid,
  Minimize,
  Sparkles,
  Image as ImageIcon,
  FileText,
  X,
  Wand2,
  Eraser,
  Languages,
  Zap,
  MoreHorizontal,
  Undo,
  Redo,
  MessageSquare,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
// import mermaid from 'mermaid';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
import './App.css';
import { AerialLogoStack, AerialMark } from './AerialLogo';

// ── Types ──────────────────────────────────────────────────────────────────────

type ToolId = 'select' | 'freedraw' | 'fountain' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'hand' | 'highlighter' | 'text' | 'eraser' | 'image' | 'pdf' | 'magic_pen' | 'laser_pen';

interface AerialEngine {
  set_tool_freedraw: () => void;
  set_tool_rectangle: () => void;
  set_tool_ellipse: () => void;
  set_tool_line: () => void;
  set_tool_select: () => void;
  set_tool_hand: () => void;
  set_tool_arrow: () => void;
  set_tool_fountain_pen: () => void;
  set_tool_highlighter: () => void;
  set_tool_text: () => void;
  set_tool_eraser: () => void;
  set_tool_magic_pen: () => void;
  set_tool_laser_pen: () => void;
  get_selected_text: () => string | null;
  update_selected_text: (text: string) => void;
  clear_laser_strokes: () => void;
  extract_magic_strokes: () => string;
  add_image: (img: HTMLImageElement, x: number, y: number, w: number, h: number, assetId: string) => void;
  add_diagram: (img: HTMLImageElement, x: number, y: number, w: number, h: number, code: string, svg: string, hitMapStr: string) => void;
  set_cached_image: (id: bigint | number, img: HTMLImageElement) => void;
  get_scene_json: () => string;
  load_scene_json: (json: string) => void;
  export_full_state: () => Uint8Array;
  import_full_state: (bytes: Uint8Array) => void;
  check_and_clear_dirty: () => boolean;
  get_local_state_vector: () => Uint8Array;
  process_incoming_packet: (packet: Uint8Array) => Uint8Array | undefined;
  export_delta_update: (remote_sv: Uint8Array) => Uint8Array;
  apply_remote_delta: (bytes: Uint8Array) => void;
  set_dark_mode: (isDark: boolean) => void;
  set_grid_type: (gtype: string) => void;
  set_fountain_sharpness: (s: number) => void;
  screen_to_world_x: (sx: number) => number;
  screen_to_world_y: (sy: number) => number;
  add_text: (text: string, x: number, y: number, size: number, font_family?: string, color?: string) => void;
  clear_board: () => void;
  set_stroke_color: (c: string) => void;
  set_fill_color: (c: string) => void;
  set_stroke_width: (w: number) => void;
  set_is_rough: (rough: boolean) => void;
  set_is_curved: (curved: boolean) => void;
  zoom_in: () => number;
  zoom_out: () => number;
  reset_view: () => number;
  on_mouse_down: (raw_x: number, raw_y: number) => void;
  on_mouse_move: (raw_x: number, raw_y: number) => void;
  on_mouse_up: (raw_x: number, raw_y: number) => void;
  on_double_click: (raw_x: number, raw_y: number) => string | undefined;
  get_element_code: (id: bigint) => string | undefined;
  on_wheel: (dx: number, dy: number, ctrl: boolean, sx: number, sy: number) => number;
  delete_selected: () => void;
  render: () => void;
  tick_animations: () => boolean;
  undo: () => boolean;
  redo: () => boolean;
  set_eraser_radius: (r: number) => void;
  set_dpr: (dpr: number) => void;
}

// ── Toolbar items ──────────────────────────────────────────────────────────────

const STROKE_COLORS = ['#000000', '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9'];

// Global flag to prevent double-initialization of Wasm in React StrictMode
let wasmInitPromise: Promise<any> | null = null;

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AerialEngine | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('freedraw');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [fillColor] = useState('transparent');
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [eraserSize, setEraserSize] = useState(24);
  const [eraserMode, setEraserMode] = useState<'stroke' | 'element'>('stroke');
  const [fountainSharpness, setFountainSharpness] = useState(0.5);
  const [magicLanguage, setMagicLanguage] = useState<'en' | 'ml' | 'ta' | 'te'>('en');
  const [magicFont, setMagicFont] = useState("'Space Grotesk', sans-serif");
  const [showSettings, setShowSettings] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const magicTimeoutRef = useRef<number | null>(null);
  // Tracks the active stylus/pen pointer ID so we can reject synthetic mouse
  // events that tablet drivers (Wacom, Gaemon, XP-Pen, etc.) fire alongside pen events.
  const activePenIdRef = useRef<number | null>(null);
  const prevToolRef = useRef<ToolId | null>(null);
  const [showMermaidDialog, setShowMermaidDialog] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [eraserPos, setEraserPos] = useState<{x: number; y: number} | null>(null);
  
  // Collaboration State
  const wsRef = useRef<WebSocket | null>(null);
  
  const connectToCollabRoom = useCallback((roomId: string, premiumToken: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    // Pass the premium cryptographic token safely through query parameters
    const wsUrl = `ws://localhost:4000/ws/room/${roomId}?token=${premiumToken}`;
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      console.log("🔒 Connected securely to premium collaboration server!");
      
      const e = engineRef.current;
      if (e) {
        // Trigger Sync Handshake Step 1: Request room data state vector
        const syncStep1Packet = e.get_local_state_vector();
        socket.send(syncStep1Packet);
      }
    };

    socket.onmessage = (event) => {
      const e = engineRef.current;
      if (!e) return;
      const incomingBytes = new Uint8Array(event.data);
      
      // Process the data packet through our WASM CRDT router
      const replyPacket = e.process_incoming_packet(incomingBytes);
      
      // If the incoming packet was a request for our data, reply back across the wire
      if (replyPacket) {
        socket.send(replyPacket);
      }
    };

    socket.onclose = () => {
      console.warn("🔌 WebSocket disconnected. Attempting to reconnect in 5 seconds...");
      setTimeout(() => {
        // Only reconnect if we haven't manually closed or switched rooms
        if (wsRef.current === socket || wsRef.current?.readyState === WebSocket.CLOSED) {
            connectToCollabRoom(roomId, premiumToken);
        }
      }, 5000);
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
      socket.close();
    };

    wsRef.current = socket;
  }, []);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [typingText, setTypingText] = useState<{screenX: number, screenY: number, worldX: number, worldY: number, value: string} | null>(null);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('aerial_dark_mode') === 'true';
  });
  const [showWelcome, setShowWelcome] = useState(false);
  const [gridType, setGridType] = useState('dots');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontFamily, setFontFamily] = useState('Caveat');
  const [isRough, setIsRough] = useState(true);
  const [isCurved, setIsCurved] = useState(true);
  const initStarted = useRef(false);

  // ── Load Wasm ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    async function loadWasm() {
      try {
        const timestamp = Date.now();
        const glueUrl  = new URL(`/aerial-engine/aerial_engine.js?v=${timestamp}`, import.meta.url).href;
        const wasmUrl  = new URL(`/aerial-engine/aerial_engine_bg.wasm?v=${timestamp}`, import.meta.url).href;

        // @ts-ignore
        const mod = await import(/* @vite-ignore */ glueUrl);
        
        // Ensure wasm is only instantiated ONCE globally
        if (!wasmInitPromise) {
          wasmInitPromise = mod.default({ module_or_path: wasmUrl });
        }
        await wasmInitPromise;
        await wasmInitPromise;
        await document.fonts.ready;

        const canvas = canvasRef.current!;
        const parent = canvas.parentElement!;
        const dpr = window.devicePixelRatio || 1;
        canvas.width  = parent.clientWidth * dpr;
        canvas.height = parent.clientHeight * dpr;

        const engine: AerialEngine = new mod.AerialCanvas('aerial-canvas');
        engine.set_dpr(dpr);
        
        // Try to load from Tauri backend DB
        let loadedDbBoard = false;
        try {
          const dbBytes = await invoke<number[] | null>('load_board');
          if (dbBytes) {
            engine.import_full_state(new Uint8Array(dbBytes));
            
            // Pre-load images from assets after hydration
            const dbJson = engine.get_scene_json();
            try {
              const parsed = JSON.parse(dbJson);
              if (parsed.elements) {
                for (const el of parsed.elements) {
                  if (el.kind === 'Image' && el.asset_id) {
                    try {
                      const dataUrl = await invoke<string>('load_asset', { id: el.asset_id });
                      const img = new Image();
                      img.onload = () => {
                          engine.set_cached_image(BigInt(el.id), img);
                          engine.render();
                      };
                      img.src = dataUrl;
                    } catch(err) {
                      console.error(`Failed to load asset ${el.asset_id}:`, err);
                    }
                  }
                }
              }
            } catch(e) {}
            loadedDbBoard = true;
          }
        } catch (e) {
          console.error("Failed to load from redb DB:", e);
        }

        // ── Sync all initial React state → engine ────────────────────────────
        engine.set_dark_mode(isDarkMode);
        engine.set_grid_type(gridType);
        engine.set_stroke_color(strokeColor);
        engine.set_fill_color(fillColor);
        engine.set_stroke_width(strokeWidth);
        engine.set_is_rough(isRough);
        engine.set_is_curved(isCurved);
        // Sync the active tool (engine defaults to FreeDraw, but keep explicit)
        engine.set_tool_freedraw();


        if (!loadedDbBoard) {
           setShowWelcome(true);
        }

        engine.render();
        engineRef.current = engine;
        setEngineReady(true);
        
        // Handle dynamic resizing with ResizeObserver — single authoritative observer
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
        
        // Store observer for cleanup if needed, but here it's fine tied to DOM
      } catch (e: any) {
        console.error('Aerial engine failed to load:', e);
        setLoadError(String(e?.message ?? e));
      }
    }
    loadWasm();
    
    return () => {
      // Optional cleanup on unmount
      if (engineRef.current) {
        (engineRef.current as any).free?.();
        engineRef.current = null;
      }
    };
  }, []);

  // ── Animation Loop ─────────────────────────────────────────────────────────
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
            console.error('[Aerial] tick_animations threw:', err);
            errorLogged = true;
          }
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [engineReady]);

  // ── Auto-Save Loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!engineReady) return;
    const interval = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      const needsSave = e.check_and_clear_dirty();
      if (needsSave) {
        const stateBytes = e.export_full_state();
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < stateBytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, stateBytes.subarray(i, i + chunkSize) as any);
        }
        const b64 = window.btoa(binary);
        invoke('save_board', { payloadB64: b64 }).catch(err => console.error("Auto-save failed:", err));
        
        // Blast delta updates to the room if connected
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // For now, we broadcast full state vector delta updates or full state byte array
            // In a production environment, you would use export_delta_update with a known peer state vector.
            // As a fallback to demonstrate, we can broadcast the full state on the sync protocol
            const syncStep1Packet = e.get_local_state_vector();
            wsRef.current.send(syncStep1Packet);
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [engineReady]);

  // ── Resize observer (fullscreen change only) ───────────────────────────────
  useEffect(() => {
    if (!engineReady) return;
    // NOTE: Canvas resize is handled by the ResizeObserver set up in loadWasm.
    // This effect only tracks fullscreen state.
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [engineReady]);

  // ── Zoom state sync ────────────────────────────────────────────────────────
  const [zoomLevel, setZoomLevel] = useState(100);

  // ── Environment Controls ───────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('aerial_dark_mode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (engineReady && engineRef.current) {
      engineRef.current.set_dark_mode(isDarkMode);
    }
  }, [isDarkMode, engineReady]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!engineRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const hitIdStr = engineRef.current.on_double_click(e.clientX - rect.left, e.clientY - rect.top);
    if (hitIdStr) {
      const [elementIdStr, nodeId] = hitIdStr.split(',');
      const elementId = BigInt(elementIdStr);
      
      if (nodeId) {
        const dslCode = engineRef.current.get_element_code(elementId);
        if (dslCode) {
          const newLabel = window.prompt(`Rename diagram node [${nodeId}]:`);
          if (newLabel && newLabel.trim().length > 0) {
            import('@tauri-apps/api/tauri').then(({ invoke }) => {
              invoke<string>('update_diagram_node', {
                code: dslCode,
                nodeId,
                newLabel
              }).then(newCode => {
              // Now we need to ask backend for SVG again
              invoke<any>('render_diagram', { code: newCode }).then(res => {
                const blob = new Blob([res.svg], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                  engineRef.current?.add_diagram(
                    img,
                    50, 50, img.width, img.height,
                    newCode,
                    res.svg,
                    JSON.stringify(res.hit_map)
                  );
                  // TODO: the original node remains on canvas.
                  // We should really update the existing element instead of adding a new one, 
                  // or delete the old one. We will just delete it first? 
                  // The engine currently doesn't have delete API, maybe we'll add one.
                };
                img.src = url;
              });
            });
          });
        }
      }
      } else {
        const text = engineRef.current.get_selected_text();
        if (text) {
          const newText = window.prompt("Edit text:", text);
          if (newText !== null) {
             engineRef.current.update_selected_text(newText);
             engineRef.current.render();
          }
        }
      }
    }
  }, [engineReady]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input or textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        engineRef.current?.delete_selected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          engineRef.current?.redo();
        } else {
          engineRef.current?.undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        engineRef.current?.redo();
      }
      // Spacebar → temporarily activate hand/pan tool
      if (e.key === ' ') {
        e.preventDefault();
        if (activeTool !== 'hand') {
          prevToolRef.current = activeTool;
          setActiveTool('hand');
          engineRef.current?.set_tool_hand();
        }
      }
      // Escape key shortcuts
      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowMoreTools(false);
        setIsMenuOpen(false);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        // Restore previous tool on spacebar release
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
  }, []);

  useEffect(() => {
    if (engineReady && engineRef.current) {
      engineRef.current.set_grid_type(gridType);
    }
  }, [gridType, engineReady]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      import('@tauri-apps/api/window')
        .then(({ appWindow }) => {
          appWindow.setFullscreen(next).catch(() => {});
        })
        .catch(() => {
          // Fallback for web
          if (next) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {});
            }
          }
        });
      return next;
    });
  }, []);

  // ── Tool selection ─────────────────────────────────────────────────────────
  const selectTool = useCallback((id: ToolId) => {
    if (activeTool === id) {
      // Toggle settings popover if clicking the already active tool
      if (['freedraw', 'fountain', 'highlighter', 'rectangle', 'ellipse', 'line', 'arrow', 'eraser', 'magic_pen'].includes(id)) {
        setShowSettings(s => !s);
      }
      return;
    }
    setActiveTool(id);
    setShowSettings(false);
    setEraserPos(null);
    const e = engineRef.current;
    if (!e) return;
    switch (id) {
      case 'freedraw':  e.set_tool_freedraw();  break;
      case 'fountain':  e.set_tool_fountain_pen(); break;
      case 'rectangle': e.set_tool_rectangle(); break;
      case 'ellipse':   e.set_tool_ellipse();   break;
      case 'line':      e.set_tool_line();      break;
      case 'arrow':     e.set_tool_arrow();     break;
      case 'select':    e.set_tool_select();    break;
      case 'hand':      e.set_tool_hand();      break;
      case 'highlighter': e.set_tool_highlighter(); break;
      case 'eraser':    e.set_tool_eraser();    break;
      case 'magic_pen': e.set_tool_magic_pen(); break;
      case 'laser_pen': e.set_tool_laser_pen(); break;
    }
  }, [activeTool]);

  // ── Color change ───────────────────────────────────────────────────────────
  const changeColor = useCallback((color: string) => {
    setStrokeColor(color);
    engineRef.current?.set_stroke_color(color);
  }, []);

  // ── Stroke width & Sharpness ───────────────────────────────────────────────
  const changeWidth = useCallback((w: number) => {
    setStrokeWidth(w);
    engineRef.current?.set_stroke_width(w);
  }, []);

  const changeSharpness = useCallback((s: number) => {
    setFountainSharpness(s);
    engineRef.current?.set_fountain_sharpness(s);
  }, []);

  // ── Save & Load removed (Auto-Save only) ──────────────────────────────────

  const handleMermaid = useCallback(() => {
    setShowMermaidDialog(true);
  }, []);

  const submitMermaid = useCallback(async (code: string) => {
    try {
      const res = await invoke<any>('render_diagram', { code });
      
      console.log('[ArasDiagram] SVG length:', res.svg?.length, 'preview:', res.svg?.slice(0, 150));

      if (!res.svg || res.svg.length < 10) {
        alert('Diagram render returned an empty SVG. The diagram may be too complex or empty.');
        return;
      }

      // Validate SVG with DOMParser before trying to load as image
      const parser = new DOMParser();
      const doc = parser.parseFromString(res.svg, 'image/svg+xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        console.error('[ArasDiagram] SVG parse error:', parseError.textContent);
        alert('Diagram produced invalid SVG. Check console for details.');
        return;
      }

      const svg64 = btoa(unescape(encodeURIComponent(res.svg)));
      const image64 = 'data:image/svg+xml;base64,' + svg64;
      
      const img = new Image();
      img.onload = () => {
        const scale = 2.0;
        engineRef.current?.add_diagram(img, 100, 100, img.width * scale, img.height * scale, code, image64, JSON.stringify(res.hit_map));
        setShowMermaidDialog(false);
      };
      img.onerror = () => {
        // Fallback: even if img fails, try rendering with explicit dimensions from SVG
        console.warn('[ArasDiagram] img.onload failed, trying fallback render');
        const svgEl = doc.documentElement;
        const w = parseFloat(svgEl.getAttribute('width') || '800');
        const h = parseFloat(svgEl.getAttribute('height') || '600');
        const fallbackImg = new Image(w, h);
        fallbackImg.onload = () => {
          const scale = 2.0;
          engineRef.current?.add_diagram(fallbackImg, 100, 100, w * scale, h * scale, code, image64, JSON.stringify(res.hit_map));
          setShowMermaidDialog(false);
        };
        fallbackImg.src = image64;
      };
      img.src = image64;
    } catch (e) {
      console.error('[ArasDiagram] render_diagram error:', e);
      alert('Failed to render ArasDiagram chart: ' + e);
    }
  }, []);

  const handleTranslate = useCallback(async (targetLang: string) => {
    if (!engineRef.current) return;
    const text = engineRef.current.get_selected_text();
    if (!text) {
      alert("Please select a text element first!");
      return;
    }
    
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/api/http');
      const res = await tauriFetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
      const data: any = res.data;
      if (data && data[0]) {
        const translated = data[0].map((x: any) => x[0]).join('');
        engineRef.current.update_selected_text(translated);
      }
    } catch (err) {
      console.error("Translation failed:", err);
      alert("Translation failed.");
    }
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !engineRef.current) return;
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const assetId = crypto.randomUUID();
      try {
        await invoke('save_asset', { id: assetId, base64Data: dataUrl });
      } catch (err) {
        console.error("Failed to save asset:", err);
        return;
      }

      const img = new Image();
      img.onload = () => {
        // Place image roughly in center
        let w = img.width;
        let h = img.height;
        const maxW = 800;
        if (w > maxW) {
            h = (maxW / w) * h;
            w = maxW;
        }

        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const wx = engineRef.current!.screen_to_world_x(cx - w / 2);
        const wy = engineRef.current!.screen_to_world_y(cy - h / 2);
        engineRef.current!.add_image(img, wx, wy, w, h, assetId);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    // Reset input
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const handlePdfUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !engineRef.current) return;
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const typedarray = new Uint8Array(ev.target?.result as ArrayBuffer);
      try {
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        
        let startWy = engineRef.current!.screen_to_world_y(100);
        let startWx = engineRef.current!.screen_to_world_x(window.innerWidth / 2 - 300); // assume ~600px width
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          if (context) {
            const renderContext = {
              canvasContext: context,
              viewport: viewport
            } as any;
            await page.render(renderContext).promise;
            const dataUrl = canvas.toDataURL('image/png');
            const assetId = crypto.randomUUID();
            
            try {
              await invoke('save_asset', { id: assetId, base64Data: dataUrl });
            } catch (err) {
              console.error("Failed to save PDF page asset:", err);
              continue;
            }

            const img = new Image();
            img.onload = () => {
              engineRef.current!.add_image(img, startWx, startWy, viewport.width, viewport.height, assetId);
              startWx += viewport.width + 40; // 40px horizontal padding between pages
            };
            img.src = dataUrl;
          }
        }
      } catch (err) {
        console.error('Error rendering PDF:', err);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  }, []);

  // ── Canvas events ──────────────────────────────────────────────────────────
  // Using Pointer events ensures full support for Mouse, Touch, and Stylus/Pen.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!engineReady || !engineRef.current) return; // Bug #4 fix: guard against pre-load clicks

    // ── Stylus / Wacom fix ────────────────────────────────────────────────────
    // Tablet drivers (Wacom, Gaemon, XP-Pen, etc.) fire BOTH a real 'pen' event
    // AND a synthetic 'mouse' event for every physical pen action. Accepting both
    // causes a double-fire: the Rust engine's safety-recovery block then commits
    // the active stroke prematurely, creating erratic connecting lines and phantom
    // selection boxes around each character. We only accept the canonical event.
    if (e.pointerType === 'mouse' && (e.nativeEvent as any)._isStylusSynthetic) return;
    // More reliable: if another pen pointer is already captured, reject mouse events
    if (e.pointerType === 'mouse' && activePenIdRef.current !== null) return;
    if (e.pointerType === 'pen') activePenIdRef.current = e.pointerId;
    // ─────────────────────────────────────────────────────────────────────────

    if (showWelcome) setShowWelcome(false);

    // Prevent default to stop browser generating synthetic touch/mouse events
    e.preventDefault();

    // Capture pointer so move/up fire even if pointer leaves canvas bounds
    if (e.target instanceof Element && e.target.id === 'aerial-canvas') {
      e.target.setPointerCapture(e.pointerId);
    }
    
    if (magicTimeoutRef.current) {
      clearTimeout(magicTimeoutRef.current);
      magicTimeoutRef.current = null;
    }
    
    const rect = canvasRef.current!.getBoundingClientRect();
    
    if (activeTool === 'text') {
      if (typingText) return; // if already typing, let blur handle it
      
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
  }, [activeTool, typingText, showWelcome, engineReady]);
  
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (!engineReady || !engineRef.current) return;

    // Reject synthetic mouse events generated by tablet drivers when pen is in use
    if (e.pointerType === 'mouse' && activePenIdRef.current !== null) return;
    
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'eraser') {
      setEraserPos({ x, y });
    }

    // Only forward to engine when button is held (ignore stylus proximity hover)
    if (e.buttons > 0) {
      engineRef.current?.on_mouse_move(x, y);
    }
  }, [activeTool, engineReady]);
  
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!engineReady || !engineRef.current) return;

    // Reject synthetic mouse events generated by tablet drivers when pen is in use
    if (e.pointerType === 'mouse' && activePenIdRef.current !== null) return;
    // Clear the tracked pen pointer when it lifts
    if (e.pointerType === 'pen' && e.pointerId === activePenIdRef.current) {
      activePenIdRef.current = null;
    }
    
    if (e.target instanceof Element) {
      e.target.releasePointerCapture(e.pointerId);
    }
    
    const rect = canvasRef.current!.getBoundingClientRect();
    engineRef.current?.on_mouse_up(e.clientX - rect.left, e.clientY - rect.top);

    if (activeTool === 'magic_pen') {
      if (magicTimeoutRef.current) clearTimeout(magicTimeoutRef.current);
      magicTimeoutRef.current = window.setTimeout(async () => {
        if (!engineRef.current) return;
        const jsonStr = engineRef.current.extract_magic_strokes();
        if (!jsonStr || jsonStr === '[]') return;
        
        try {
          const strokes = JSON.parse(jsonStr);
          if (strokes.length === 0) return;
          
          // Use the start of the first stroke for text placement
          const startX = strokes[0][0][0];
          let startY = strokes[0][1][0] - 20; // Slight offset upwards to align with baseline
          
          // Snap Y to a grid so that sequentially written words align perfectly on the same baseline
          startY = Math.round(startY / 40) * 40;
          
          const payload = {
            options: "enable_pre_space",
            requests: [{
              writing_guide: { writing_area_width: 2000, writing_area_height: 2000 },
              ink: strokes,
              language: magicLanguage
            }]
          };
          
          // Import Tauri fetch dynamically to bypass CORS
          const { fetch: tauriFetch, Body } = await import('@tauri-apps/api/http');
          
          const res = await tauriFetch("https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: Body.json(payload)
          });
          
          const data: any = res.data;
          if (data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1] && data[1][0][1][0]) {
            const recognized = data[1][0][1][0];
            // Pass the magic purple color explicitly
            engineRef.current.add_text(recognized, startX, startY, 40.0, magicFont, "#a855f7");
            engineRef.current.render();
          }
        } catch (err) {
          console.error("Magic Pen Recognition Error:", err);
        }
      }, 600); // Reduced from 1200ms for faster conversion
    } else if (activeTool === 'laser_pen') {
      // Laser fading is now handled smoothly by tick_animations in the WASM engine.
    }
  }, [activeTool, magicLanguage, magicFont, engineReady]);

  const onPointerLeave = useCallback((e: React.PointerEvent) => {
    // Only end the stroke if the pointer was actually down when leaving (prevents cutting strokes mid-draw)
    if (e.buttons > 0) {
      onPointerUp(e);
    }
    setEraserPos(null);
  }, [onPointerUp]);

  const onPointerEnter = useCallback((e: React.PointerEvent) => {
    if (activeTool === 'eraser') {
      const rect = canvasRef.current!.getBoundingClientRect();
      setEraserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [activeTool, engineReady]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!engineRef.current) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const rect = canvasRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const newZoom = engineRef.current.on_wheel(e.deltaX, e.deltaY, ctrl, screenX, screenY);
    if (ctrl) {
      setZoomLevel(Math.round(newZoom * 100));
    }
  }, []);

  // Prevent browser native elastic scroll on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    canvas.addEventListener('wheel', preventScroll, { passive: false });
    return () => canvas.removeEventListener('wheel', preventScroll);
  }, [engineReady]);

  // ── Cursor class for active tool ───────────────────────────────────────────
  const cursorClass =
    activeTool === 'hand'     ? 'cursor-grab' :
    activeTool === 'select'   ? 'cursor-default' :
    activeTool === 'eraser'   ? 'cursor-none' :
    'cursor-crosshair';

  return (
    <div className="relative h-screen w-full bg-background text-foreground overflow-hidden font-brand select-none">
      
      {/* ── Background Canvas ── */}
      <div className="absolute inset-0 z-0">
        {!engineReady && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-8">
              {/* Aerial logo mark + wordmark */}
              <AerialLogoStack />
              {/* Smooth bouncing ball loader */}
              <div className="flex gap-1.5 items-center justify-center h-7">
                <div className="w-2.5 h-2.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#6366f1] animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#6366f1] animate-bounce" />
              </div>
              <p className="text-[10px] text-muted-foreground font-mono tracking-[0.2em] uppercase -mt-4">Loading Engine…</p>
            </div>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center p-6 max-w-sm">
              <p className="text-sm font-semibold text-foreground mb-2">Engine failed to load</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted p-3 rounded-lg break-all">{loadError}</p>
            </div>
          </div>
        )}
        <canvas
          id="aerial-canvas"
          ref={canvasRef}
          className={`block w-full h-full touch-none select-none ${cursorClass}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onPointerEnter={onPointerEnter}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
        />
        {/* Eraser cursor overlay */}
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
              <circle cx="20" cy="20" r="18" fill={isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'} stroke={isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'} strokeWidth="1.5" strokeDasharray="3 2"/>
              <line x1="12" y1="20" x2="28" y2="20" stroke={isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'} strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="20" y1="12" x2="20" y2="28" stroke={isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        )}
        {showWelcome && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <h1 className="text-[120px] font-brand tracking-tight font-black opacity-10">Aerial</h1>
            <p className="absolute mt-32 font-mono text-muted-foreground animate-pulse text-sm">Pick a tool and start drawing</p>
          </div>
        )}
        {typingText && (
          <textarea
            autoFocus
            style={{
              position: 'absolute',
              left: typingText.screenX,
              top: typingText.screenY,
              transform: 'translateY(-14px)',
              fontFamily: 'Caveat',
              fontSize: '28px',
              color: isDarkMode ? '#fff' : '#000000',
              background: 'transparent',
              border: '1px dashed #6366f1',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              minWidth: '40px',
              minHeight: '40px',
              zIndex: 40,
              padding: 0,
              margin: 0,
              lineHeight: 1
            }}
            value={typingText.value}
            onChange={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
              e.target.style.width = 'auto';
              e.target.style.width = Math.max(40, e.target.scrollWidth) + 'px';
              setTypingText({ ...typingText, value: e.target.value });
            }}
            onBlur={() => {
              if (typingText.value.trim() && engineRef.current) {
                engineRef.current.add_text(typingText.value, typingText.worldX, typingText.worldY, 28, fontFamily, undefined);
                selectTool('select');
              }
              setTypingText(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        )}
      </div>

      {/* ── Floating UI Layer ── */}
      <div className="absolute inset-0 z-50 pointer-events-none flex">
        
        {/* Top-Left Hamburger Menu */}
        <div className={`absolute top-4 left-4 z-50 transition-all duration-500 ease-in-out ${isFullscreen ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-background/40 backdrop-blur-xl border border-foreground/10 shadow-lg rounded-xl hover:bg-foreground/5 transition-colors"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          
          {isMenuOpen && (
            <div className="pointer-events-auto absolute top-12 left-0 w-60 bg-background/60 backdrop-blur-2xl border border-foreground/10 shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
              <div className="px-4 py-4 flex items-center gap-3 border-b border-border">
                {/* Aerial logo mark */}
                <div className="w-8 h-8 shrink-0 rounded-lg bg-foreground/8 border border-border flex items-center justify-center">
                  <AerialMark size={18} />
                </div>
                <div className="shrink-0">
                  <h1 className="font-rephen text-xl tracking-widest leading-none text-foreground" style={{ letterSpacing: '0.15em' }}>AERIAL</h1>
                </div>
              </div>
              <div className="p-3 flex flex-col gap-3">
                {/* Environment Controls */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-muted-foreground">Appearance</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className="flex items-center justify-center w-7 h-7 hover:bg-muted rounded-full transition-colors"
                      title="Toggle Dark Mode"
                    >
                      {isDarkMode ? <Moon className="w-4 h-4 text-foreground" /> : <Sun className="w-4 h-4 text-foreground" />}
                    </button>
                    <div className="flex items-center gap-1.5 bg-background/50 px-2 py-1 rounded-md border border-foreground/10">
                      <Grid className="w-3.5 h-3.5 text-muted-foreground" />
                      <select
                        value={gridType}
                        onChange={(e) => setGridType(e.target.value)}
                        className="bg-transparent text-[11px] font-semibold outline-none cursor-pointer text-foreground border-0 p-0"
                      >
                        <option value="dots">Dots</option>
                        <option value="lines">Lines</option>
                        <option value="blank">Blank</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="h-px w-full bg-border" />

                {/* New Board */}
                <button
                  className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-lg py-2 px-3 flex justify-center items-center gap-2 text-sm font-semibold transition-all mb-2"
                  onClick={() => {
                    setShowClearConfirm(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  New Board
                </button>

                {/* Beta Feedback */}
                <button
                  className="w-full bg-muted/60 text-foreground hover:bg-muted border border-foreground/10 rounded-lg py-2 px-3 flex justify-center items-center gap-2 text-xs font-semibold transition-all"
                  onClick={() => {
                    setShowFeedbackModal(true);
                    setIsMenuOpen(false);
                  }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Beta Feedback & Bug Report
                </button>
              </div>
            </div>
          )}
        </div>


        {/* Center Area */}
        <div className="flex-1 relative">
           
           {/* Top Center: Main Drawing Tools */}
           <div className={`pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/40 backdrop-blur-xl border border-foreground/10 shadow-lg rounded-2xl px-2 py-2 w-max max-w-[calc(100vw-2rem)] transition-all duration-500 ease-in-out ${isFullscreen ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
             <ToolBtn icon={MousePointer2} title="Select" active={activeTool === 'select'}   onClick={() => selectTool('select')} />
             <ToolBtn icon={Hand}     title="Pan (Hand)"  active={activeTool === 'hand'}     onClick={() => selectTool('hand')} />
             <div className="w-px h-5 bg-foreground/15 mx-1 hidden sm:block" />
             <div className="hidden sm:flex items-center gap-1">
               <ToolBtn icon={Square}   title="Rectangle"   active={activeTool === 'rectangle'} onClick={() => selectTool('rectangle')} />
               <ToolBtn icon={Circle}   title="Ellipse"     active={activeTool === 'ellipse'}   onClick={() => selectTool('ellipse')} />
               <ToolBtn icon={Minus}    title="Line"        active={activeTool === 'line'}      onClick={() => selectTool('line')} />
               <ToolBtn icon={ArrowUpRight} title="Arrow"   active={activeTool === 'arrow'}     onClick={() => selectTool('arrow')} />
             </div>
             <div className="w-px h-5 bg-foreground/15 mx-1 hidden sm:block" />
             <ToolBtn icon={Pen}      title="Draw (Pen)"  active={activeTool === 'freedraw'}  onClick={() => selectTool('freedraw')} />
             <ToolBtn icon={Type}     title="Text"        active={activeTool === 'text'}      onClick={() => selectTool('text')} />
             <ToolBtn icon={Eraser}   title="Eraser"      active={activeTool === 'eraser'}    onClick={() => selectTool('eraser')} />
             <div className="hidden sm:block">
               <ToolBtn icon={ImageIcon} title="Insert Image" onClick={() => imageInputRef.current?.click()} />
             </div>
             <div className="w-px h-5 bg-foreground/15 mx-1" />
             <div className="relative">
               <ToolBtn 
                 icon={MoreHorizontal} 
                 title="More Tools" 
                 active={showMoreTools || ['fountain', 'magic_pen', 'laser_pen', 'highlighter'].includes(activeTool)} 
                 onClick={() => setShowMoreTools(!showMoreTools)} 
               />
               {showMoreTools && (
                 <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-2xl border border-foreground/10 shadow-2xl rounded-xl p-2 w-48 flex flex-col gap-1 z-50">
                   <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-2 py-1">Special Pens</p>
                   <DropdownToolBtn icon={Pen} title="Calligraphy Pen" active={activeTool === 'fountain'} onClick={() => { selectTool('fountain'); setShowMoreTools(false); }} />
                   <DropdownToolBtn icon={Highlighter} title="Highlighter" active={activeTool === 'highlighter'} onClick={() => { selectTool('highlighter'); setShowMoreTools(false); }} />
                   <DropdownToolBtn icon={Wand2} title="Magic Pen" active={activeTool === 'magic_pen'} className="text-purple-500" onClick={() => { setShowMermaidDialog(true); setShowMoreTools(false); }} />
                   <DropdownToolBtn icon={Zap} title="Laser Pen" active={activeTool === 'laser_pen'} className="text-red-500" onClick={() => { selectTool('laser_pen'); setShowMoreTools(false); }} />
                   
                   <div className="h-px bg-foreground/10 my-1" />
                   <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-2 py-1">Insert & Actions</p>
                   <DropdownToolBtn icon={FileText} title="Insert PDF" onClick={() => { pdfInputRef.current?.click(); setShowMoreTools(false); }} />
                   <DropdownToolBtn icon={ImageIcon} title="Insert Image" className="sm:hidden" onClick={() => { imageInputRef.current?.click(); setShowMoreTools(false); }} />
                   <DropdownToolBtn icon={Code} title="Mermaid Chart" onClick={() => { handleMermaid(); setShowMoreTools(false); }} />
                   <DropdownToolBtn icon={Languages} title="Translate Text" onClick={() => { setShowMermaidDialog(true); setShowMoreTools(false); }} />
                   <DropdownToolBtn icon={Trash2} title="Clear Board" className="text-red-500 hover:text-red-600" onClick={() => { setShowClearConfirm(true); setShowMoreTools(false); }} />
                 </div>
               )}
             </div>
           </div>

           {/* Top Right: Fullscreen Toggle */}
           <div className={`pointer-events-auto absolute top-4 right-4 flex items-center gap-1 bg-background/40 backdrop-blur-xl border border-foreground/10 shadow-lg rounded-2xl px-2 py-2 transition-opacity duration-300 ${isFullscreen ? 'opacity-20 hover:opacity-100' : 'opacity-100'}`}>
             <ToolBtn icon={isFullscreen ? Minimize : Maximize} title="Toggle Fullscreen" onClick={toggleFullscreen} />
           </div>

           {/* Bottom Left: Zoom & History */}
           <div className={`pointer-events-auto absolute bottom-6 left-4 flex items-center gap-1 bg-background/40 backdrop-blur-xl border border-foreground/10 shadow-lg rounded-2xl px-2 py-2 transition-all duration-500 ease-in-out ${isFullscreen ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
             <ToolBtn icon={ZoomOut}  title="Zoom Out"    onClick={() => {
               if (engineRef.current) setZoomLevel(Math.round(engineRef.current.zoom_out() * 100));
             }} />
             <button 
               onClick={() => { if (engineRef.current) setZoomLevel(Math.round(engineRef.current.reset_view() * 100)); }}
               title="Reset View"
               className="text-center font-bold text-[10px] select-none text-muted-foreground hover:text-foreground transition-colors w-10 px-1 rounded-sm cursor-pointer hover:bg-muted"
             >
               {zoomLevel}%
             </button>
             <ToolBtn icon={ZoomIn}   title="Zoom In"     onClick={() => {
               if (engineRef.current) setZoomLevel(Math.round(engineRef.current.zoom_in() * 100));
             }} />
             <div className="w-px h-5 bg-foreground/15 mx-1" />
             <ToolBtn icon={Undo} title="Undo (Cmd+Z)" onClick={() => engineRef.current?.undo()} />
             <ToolBtn icon={Redo} title="Redo (Cmd+Shift+Z)" onClick={() => engineRef.current?.redo()} />
           </div>
           
           <input type="file" accept="image/*" className="hidden" ref={imageInputRef} onChange={handleImageUpload} />
           <input type="file" accept="application/pdf" className="hidden" ref={pdfInputRef} onChange={handlePdfUpload} />

           {/* Settings Popover */}
           {showSettings && (
             <div className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 bg-background/60 backdrop-blur-2xl border border-foreground/10 shadow-2xl rounded-xl p-4 w-64 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                {activeTool === 'magic_pen' ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Handwriting Language</p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setMagicLanguage('en')}
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                            magicLanguage === 'en' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          English
                        </button>
                        <button
                          onClick={() => setMagicLanguage('ml')}
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                            magicLanguage === 'ml' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Malayalam
                        </button>
                        <button
                          onClick={() => setMagicLanguage('ta')}
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                            magicLanguage === 'ta' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Tamil
                        </button>
                        <button
                          onClick={() => setMagicLanguage('te')}
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                            magicLanguage === 'te' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Telugu
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Text Font</p>
                      <select
                        value={magicFont}
                        onChange={(e) => setMagicFont(e.target.value)}
                        className="w-full bg-muted text-foreground text-[11px] font-semibold rounded-md px-2 py-1.5 outline-none border-0"
                      >
                        <option value="'Space Grotesk', sans-serif">Space Grotesk (Modern)</option>
                        <option value="'Caveat', cursive">Caveat (Cursive)</option>
                        <option value="'Inter', sans-serif">Inter (Clean)</option>
                        <option value="'Rephen', sans-serif">Rephen (Brand)</option>
                      </select>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      Write on the canvas and pause for 1 second. The strokes will instantly convert to text.
                    </p>
                  </div>
                ) : activeTool === 'eraser' ? (
                 <>
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Eraser Type</p>
                     <div className="flex gap-1">
                       {(['stroke', 'element'] as const).map(mode => (
                         <button
                           key={mode}
                           onClick={() => setEraserMode(mode)}
                           className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md capitalize transition-all ${
                             eraserMode === mode
                               ? 'bg-foreground text-background'
                               : 'bg-muted text-muted-foreground hover:text-foreground'
                           }`}
                         >
                           {mode === 'stroke' ? 'Stroke' : 'Element'}
                         </button>
                       ))}
                     </div>
                     <p className="text-[9px] text-muted-foreground mt-2">
                       {eraserMode === 'stroke' ? 'Erases individual strokes you touch' : 'Erases entire elements you touch (faster)'}
                     </p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 flex justify-between">
                       <span>Eraser Size</span>
                       <span className="text-foreground">{eraserSize}px</span>
                     </p>
                     <input
                       type="range" min="8" max="80" step="2"
                       value={eraserSize}
                       onChange={e => {
                         const s = parseInt(e.target.value);
                         setEraserSize(s);
                         engineRef.current?.set_stroke_width(s / 4);
                       }}
                       className="w-full accent-foreground"
                     />
                   </div>
                 </>
               ) : (
                 <>
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Color Palette</p>
                     <div className="flex items-center gap-2 flex-wrap">
                       {STROKE_COLORS.map(c => (
                         <button
                           key={c}
                           onClick={() => changeColor(c)}
                           className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${strokeColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                           style={{ backgroundColor: c }}
                         />
                       ))}
                       <div className="relative w-6 h-6 rounded-full border-2 border-border overflow-hidden cursor-pointer hover:scale-110 transition-transform">
                         <input
                           type="color"
                           value={strokeColor}
                           onChange={(e) => changeColor(e.target.value)}
                           className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer"
                           title="Custom Color"
                         />
                       </div>
                     </div>
                   </div>
                   
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 flex justify-between">
                       <span>Stroke Size</span>
                       <span className="text-foreground">{strokeWidth}px</span>
                     </p>
                     <input
                       type="range" min="1" max="24" step="0.5"
                       value={strokeWidth}
                       onChange={e => changeWidth(parseFloat(e.target.value))}
                       className="w-full accent-foreground"
                     />
                   </div>

                   {activeTool === 'fountain' && (
                     <div>
                       <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2 flex justify-between">
                         <span>Nib Sharpness</span>
                         <span className="text-foreground">{fountainSharpness}</span>
                       </p>
                       <input
                         type="range" min="0.1" max="2.0" step="0.1"
                         value={fountainSharpness}
                         onChange={e => changeSharpness(parseFloat(e.target.value))}
                         className="w-full accent-foreground"
                       />
                     </div>
                   )}
                   {(activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'line') && (
                      <div className="flex items-center gap-2 mt-2">
                        <input 
                          type="checkbox" 
                          id="roughShapeToggle"
                          className="accent-foreground"
                          checked={isRough} 
                          onChange={(e) => {
                            setIsRough(e.target.checked);
                            engineRef.current?.set_is_rough(e.target.checked);
                          }} 
                        />
                        <label htmlFor="roughShapeToggle" className="text-[11px] font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground">Scribble Style</label>
                      </div>
                   )}
                   {activeTool === 'arrow' && (
                     <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="curvedArrowToggle"
                          className="accent-foreground"
                          checked={isCurved} 
                          onChange={(e) => {
                            setIsCurved(e.target.checked);
                            engineRef.current?.set_is_curved(e.target.checked);
                          }} 
                        />
                        <label htmlFor="curvedArrowToggle" className="text-[11px] font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground">Curved Arrow</label>
                      </div>
                     </div>
                   )}
                   </>
                 )}

                 {/* Translation Settings */}
                 <div className="flex flex-col gap-3 pt-4 border-t border-border">
                   <div>
                     <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Translate Selected Text To</p>
                     <div className="flex gap-1 flex-wrap">
                       {['en', 'ml', 'ta', 'te', 'hi', 'es', 'fr'].map(lang => (
                         <button
                           key={lang}
                           onClick={() => {
                              setMagicLanguage(lang as any);
                              handleTranslate(lang);
                           }}
                           className="flex-1 min-w-[30px] py-1.5 text-[11px] font-semibold rounded-md transition-all bg-muted text-muted-foreground hover:bg-foreground hover:text-background"
                         >
                           {lang.toUpperCase()}
                         </button>
                       ))}
                     </div>
                   </div>

                  {/* Text Settings */}
                  {activeTool === 'text' && (
                    <div className="flex flex-col gap-3 pt-4 border-t border-border">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Handwriting Font</p>
                        <div className="flex flex-col gap-2">
                          {['Caveat', 'Kalam', 'Space Grotesk'].map(font => (
                            <button
                              key={font}
                              onClick={() => { setFontFamily(font); setActiveTool('select'); }}
                              className={`px-3 py-2 text-sm font-semibold rounded-md transition-all text-left ${fontFamily === font ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'}`}
                              style={{ fontFamily: font === 'Space Grotesk' ? "'Space Grotesk', sans-serif" : font }}
                            >
                              {font}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                 </div>

             </div>
           )}

        </div>
      </div>
      
      {showMermaidDialog && (
        <MermaidDialog onClose={() => setShowMermaidDialog(false)} onSubmit={submitMermaid} />
      )}

      {/* Clear Board Confirmation Modal */}
      {showClearConfirm && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-auto">
          <div className="bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2 tracking-tight">Clear the board?</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              This will permanently delete all your drawings, text, and images. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground hover:bg-foreground/5 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  engineRef.current?.clear_board();
                  setShowClearConfirm(false);
                  setIsMenuOpen(false);
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
              >
                Yes, Clear Board
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Beta Feedback Modal */}
      {showFeedbackModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-auto">
          <div className="bg-background/90 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground tracking-tight">Beta Feedback</h2>
                  <p className="text-xs text-muted-foreground">Help us improve Aerial for public launch</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowFeedbackModal(false); setFeedbackSent(false); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/10 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {feedbackSent ? (
              <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 text-xl font-bold">
                  ✓
                </div>
                <h3 className="font-semibold text-foreground">Thank you for your feedback!</h3>
                <p className="text-xs text-muted-foreground max-w-xs">Your input has been recorded and will help make Aerial better.</p>
                <button
                  onClick={() => { setShowFeedbackModal(false); setFeedbackSent(false); }}
                  className="mt-4 px-4 py-2 bg-foreground text-background rounded-xl text-xs font-semibold hover:opacity-90 transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Describe any bugs you encountered or suggestions you have..."
                  className="w-full h-32 bg-background border border-border rounded-xl p-3 text-sm focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground resize-none"
                />
                <div className="flex items-center justify-between">
                  <a
                    href="https://github.com/ARASKOVA-labs/Aerial/issues/new"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-purple-500 hover:underline flex items-center gap-1 font-medium"
                  >
                    Open GitHub Issue →
                  </a>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowFeedbackModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!feedbackText.trim()}
                      onClick={() => {
                        console.log('[Beta Feedback Submitted]:', feedbackText);
                        setFeedbackSent(true);
                        setFeedbackText('');
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-all shadow-sm"
                    >
                      Submit Feedback
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AnimatedToolIcon({ icon: Icon, title, className, isHovered }: { icon: any, title: string, className?: string, isHovered?: boolean }) {
  const [scope, animate] = useAnimate();
  const MotionIcon = useMemo(() => motion.create(Icon), [Icon]);

  const handleHover = useCallback(async () => {
    if (!scope.current) return;
    const t = title.toLowerCase();
    
    if (scope.current?.startAnimation) {
       scope.current.startAnimation();
       return;
    }

    if (t.includes("pen") || t.includes("draw")) {
      await animate(scope.current, { rotate: [0, -20, 10, -10, 0], x: [0, -2, 2, -1, 0] }, { duration: 0.5 });
    } else if (t.includes("select")) {
      await animate(scope.current, { scale: [1, 0.7, 1.2, 1], y: [0, -3, 0] }, { duration: 0.4 });
    } else if (t.includes("hand") || t.includes("pan")) {
      await animate(scope.current, { x: [0, -4, 4, -2, 2, 0], y: [0, 2, 0] }, { duration: 0.5 });
    } else if (t.includes("eraser")) {
      await animate(scope.current, { rotate: [0, 30, -30, 0], x: [0, 4, -4, 0] }, { duration: 0.4 });
    } else if (t.includes("rectangle") || t.includes("square")) {
      await animate(scope.current, { scale: [1, 1.1, 0.9, 1], rotate: [0, 5, -5, 0] }, { duration: 0.4 });
    } else if (t.includes("circle") || t.includes("ellipse")) {
      await animate(scope.current, { scale: [1, 1.1, 0.9, 1], rotate: [0, 180, 360] }, { duration: 0.6 });
    } else if (t.includes("arrow") || t.includes("line")) {
      await animate(scope.current, { x: [0, 5, 0], y: [0, -5, 0] }, { duration: 0.4 });
    } else if (t.includes("text") || t.includes("type")) {
      await animate(scope.current, { y: [0, -4, 0], scale: [1, 1.1, 1] }, { duration: 0.4 });
    } else if (t.includes("image")) {
      await animate(scope.current, { scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }, { duration: 0.4 });
    } else if (t.includes("trash") || t.includes("clear")) {
      await animate(scope.current, { rotate: [0, -10, 10, -10, 0], y: [0, -2, 0] }, { duration: 0.4 });
    } else if (t.includes("zoom")) {
      await animate(scope.current, { scale: [1, 1.3, 1] }, { duration: 0.4 });
    } else if (t.includes("undo")) {
      await animate(scope.current, { rotate: [0, -45, 0], x: [0, -3, 0] }, { duration: 0.4 });
    } else if (t.includes("redo")) {
      await animate(scope.current, { rotate: [0, 45, 0], x: [0, 3, 0] }, { duration: 0.4 });
    } else {
      await animate(scope.current, { scale: [1, 1.2, 0.9, 1] }, { duration: 0.4 });
    }
  }, [animate, scope, title]);

  const handleLeave = useCallback(async () => {
    if (scope.current?.stopAnimation) {
      scope.current.stopAnimation();
    } else if (scope.current) {
      await animate(scope.current, { rotate: 0, x: 0, y: 0, scale: 1 }, { duration: 0.2 });
    }
  }, [animate, scope]);

  useEffect(() => {
    if (isHovered) handleHover();
    else handleLeave();
  }, [isHovered, handleHover, handleLeave]);

  return <MotionIcon ref={scope} className={className} />;
}

function DropdownToolBtn({ icon, title, onClick, active, className }: any) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-foreground/5 transition-all duration-200 hover:scale-105 active:scale-95 ${active ? 'bg-foreground/10 text-primary' : ''} ${className || ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatedToolIcon icon={icon} title={title} isHovered={isHovered} className="w-4 h-4" />
      {title}
    </button>
  );
}

function ToolBtn({ icon, title, onClick, active }: { icon: any; title: string; onClick: () => void; active?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
        active
          ? 'bg-foreground text-background shadow-sm scale-110'
          : 'text-foreground hover:bg-foreground/10'
      }`}
    >
      <AnimatedToolIcon icon={icon} title={title} isHovered={isHovered} className="w-4 h-4" />
    </button>
  );
}

// ... The new MermaidDialog component will go here ...
function MermaidDialog({ onClose }: { onClose: () => void; onSubmit?: (code: string) => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-bold">Aerial AI Studio</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 text-center">
          <Wand2 className="w-12 h-12 text-primary mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-bold mb-2">Coming Soon</h3>
          <p className="text-sm text-muted-foreground">
            AI features will be enabled in future patches. Stay tuned!
          </p>
          <button
            onClick={onClose}
            className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-sm font-bold w-full transition-all shadow-md"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
