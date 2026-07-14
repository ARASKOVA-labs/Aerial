import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Menu,
  Users,
  Settings,
  Plus,
  FilePenLine,
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
  Code2,
  X,
  Loader2,
  Wand2,
  Eraser,
  Languages,
  Activity,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
// import mermaid from 'mermaid';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
import './App.css';
import { AerialLogoStack, AerialWordmark, AerialMark } from './AerialLogo';

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
  add_text: (text: string, x: number, y: number, size: number, font_family?: string) => void;
  clear_board: () => void;
  set_stroke_color: (c: string) => void;
  set_fill_color: (c: string) => void;
  set_stroke_width: (w: number) => void;
  set_is_rough: (rough: boolean) => void;
  set_is_curved: (curved: boolean) => void;
  zoom_in: () => void;
  zoom_out: () => void;
  reset_view: () => void;
  on_mouse_down: (e: MouseEvent) => void;
  on_mouse_move: (e: MouseEvent) => void;
  on_mouse_up: (e: MouseEvent) => void;
  on_double_click: (e: MouseEvent) => string | undefined;
  get_element_code: (id: bigint) => string | undefined;
  on_wheel: (dx: number, dy: number, ctrl: boolean, sx: number, sy: number) => void;
  delete_selected: () => void;
  render: () => void;
  tick_animations: () => boolean;
}

// ── Toolbar items ──────────────────────────────────────────────────────────────

const STROKE_COLORS = ['#1a1a2e', '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9'];

// Global flag to prevent double-initialization of Wasm in React StrictMode
let wasmInitPromise: Promise<any> | null = null;

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AerialEngine | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('freedraw');
  const [strokeColor, setStrokeColor] = useState('#1a1a2e');
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [eraserSize, setEraserSize] = useState(24);
  const [eraserMode, setEraserMode] = useState<'stroke' | 'element' | 'area'>('stroke');
  const [fountainSharpness, setFountainSharpness] = useState(0.5);
  const [magicLanguage, setMagicLanguage] = useState<'en' | 'ml' | 'ta' | 'te'>('en');
  const [magicFont, setMagicFont] = useState("'Space Grotesk', sans-serif");
  const [showSettings, setShowSettings] = useState(false);
  const magicTimeoutRef = useRef<number | null>(null);
  const [showMermaidDialog, setShowMermaidDialog] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

  // ── Load Wasm ──────────────────────────────────────────────────────────────
  useEffect(() => {
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
        await document.fonts.ready;

        // Clean up previous engine instance if it exists (StrictMode)
        if (engineRef.current) {
          (engineRef.current as any).free?.();
        }

        const canvas = canvasRef.current!;
        const parent = canvas.parentElement!;
        canvas.width  = parent.clientWidth;
        canvas.height = parent.clientHeight;

        const engine: AerialEngine = new mod.AerialCanvas('aerial-canvas');
        
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

        // Apply initial UI states to the engine
        engine.set_is_rough(isRough);
        engine.set_is_curved(isCurved);

        if (!loadedDbBoard) {
           setShowWelcome(true);
        }

        engine.render();
        engineRef.current = engine;
        setEngineReady(true);
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
    const loop = () => {
      const e = engineRef.current;
      if (e && e.tick_animations) {
         e.tick_animations();
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
        invoke('save_board', { payload: Array.from(stateBytes) }).catch(err => console.error("Auto-save failed:", err));
        
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

  // ── Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!engineReady) return;
    const obs = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width  = canvas.parentElement!.clientWidth;
      canvas.height = canvas.parentElement!.clientHeight;
      engineRef.current?.render();
    });
    obs.observe(canvasRef.current!.parentElement!);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      obs.disconnect();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [engineReady]);

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
    const hitIdStr = engineRef.current.on_double_click(e.nativeEvent);
    if (hitIdStr) {
      const [elementIdStr, nodeId] = hitIdStr.split(',');
      const elementId = BigInt(elementIdStr);
      
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
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input or textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        engineRef.current?.delete_selected();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (engineReady && engineRef.current) {
      engineRef.current.set_grid_type(gridType);
    }
  }, [gridType, engineReady]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
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
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
      const data = await res.json();
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
    if (showWelcome) setShowWelcome(false);
    
    // Prevent default browser behavior (like text selection or dragging the window)
    if (e.target instanceof Element && e.target.id === 'aerial-canvas') {
      e.target.setPointerCapture(e.pointerId);
    }
    
    if (magicTimeoutRef.current) {
      clearTimeout(magicTimeoutRef.current);
      magicTimeoutRef.current = null;
    }
    
    if (activeTool === 'text') {
      if (typingText) return; // if already typing, let blur handle it
      if (engineRef.current) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = engineRef.current.screen_to_world_x(screenX);
        const worldY = engineRef.current.screen_to_world_y(screenY);
        setTypingText({ screenX, screenY, worldX, worldY, value: '' });
      }
      return;
    }
    
    engineRef.current?.on_mouse_down(e.nativeEvent as unknown as MouseEvent);
  }, [activeTool, typingText, showWelcome]);
  
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (activeTool === 'eraser') {
      const rect = canvasRef.current!.getBoundingClientRect();
      setEraserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    engineRef.current?.on_mouse_move(e.nativeEvent as unknown as MouseEvent);
  }, [activeTool]);
  
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.target instanceof Element) {
      e.target.releasePointerCapture(e.pointerId);
    }
    engineRef.current?.on_mouse_up(e.nativeEvent as unknown as MouseEvent);

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
          
          const res = await fetch("https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          if (data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1] && data[1][0][1][0]) {
            const recognized = data[1][0][1][0];
            engineRef.current.add_text(recognized, startX, startY, 40.0, magicFont);
            engineRef.current.render();
          }
        } catch (err) {
          console.error("Magic Pen Recognition Error:", err);
        }
      }, 600); // Reduced from 1200ms for faster conversion
    } else if (activeTool === 'laser_pen') {
      // Laser fading is now handled smoothly by tick_animations in the WASM engine.
    }
  }, [activeTool, magicLanguage, magicFont]);

  const onPointerLeave = useCallback((e: React.PointerEvent) => {
    onPointerUp(e);
    setEraserPos(null);
  }, [onPointerUp]);

  const onPointerEnter = useCallback((e: React.PointerEvent) => {
    if (activeTool === 'eraser') {
      const rect = canvasRef.current!.getBoundingClientRect();
      setEraserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [activeTool]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!engineRef.current) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const rect = canvasRef.current!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    engineRef.current.on_wheel(e.deltaX, e.deltaY, ctrl, screenX, screenY);
  }, []);

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
              {/* Indigo orbit spinner */}
              <div className="relative w-7 h-7">
                <div className="absolute inset-0 rounded-full border border-foreground/10" />
                <div className="absolute inset-0 rounded-full border border-t-[#6366f1] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
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
              color: isDarkMode ? '#fff' : '#1a1a2e',
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
                engineRef.current.add_text(typingText.value, typingText.worldX, typingText.worldY, 28, fontFamily);
                setActiveTool('select');
              }
              setTypingText(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
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
        <div className={`absolute top-4 left-4 z-50 ${isFullscreen ? 'hidden' : ''}`}>
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
                  <h1 className="font-rephen text-xl tracking-widest leading-none text-foreground" style={{ letterSpacing: '0.15em' }}>AERIAL PREMIUM</h1>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">Premium Edition</p>
                </div>
              </div>
              <div className="p-2">
                <button className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-lg py-2 px-3 flex justify-center items-center gap-2 text-sm font-semibold transition-all">
                  <Plus className="w-4 h-4" />
                  New Board
                </button>
              </div>
              <nav className="px-2 pb-2 space-y-1">
                <NavItem icon={FilePenLine} label="Recent Boards" active />
                <NavItem icon={Users} label="Intern Meetings" />
                <NavItem icon={Settings} label="Settings" />
              </nav>
            </div>
          )}
        </div>

        {/* Bottom-Left Brand Widget */}
        <div className={`absolute bottom-4 left-4 z-50 pointer-events-auto flex items-center gap-2 bg-background/40 backdrop-blur-xl border border-foreground/10 shadow-lg rounded-full px-3 py-2 ${isFullscreen ? 'hidden' : ''}`}>
          {/* AERIAL Wordmark with icon mark */}
          <AerialWordmark size="sm" showMark={true} />

          <div className="w-px h-4 bg-border mx-1" />

          {/* Environment Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="flex items-center justify-center w-7 h-7 hover:bg-muted rounded-full transition-colors"
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Moon className="w-4 h-4 text-foreground" /> : <Sun className="w-4 h-4 text-foreground" />}
            </button>
            <div className="flex items-center gap-1.5">
              <Grid className="w-4 h-4 text-muted-foreground" />
              <select
                value={gridType}
                onChange={(e) => setGridType(e.target.value)}
                className="bg-background text-xs font-semibold outline-none cursor-pointer text-foreground border-0 rounded-sm"
                style={{ backgroundColor: isDarkMode ? '#0a0a0f' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#1a1a2e' }}
              >
                <option value="dots">Dots</option>
                <option value="lines">Lines</option>
                <option value="blank">Blank</option>
              </select>
            </div>
          </div>
        </div>

        {/* Center Area */}
        <div className="flex-1 relative">
           
           {/* Top Floating Toolbar */}
           <div className={`pointer-events-auto absolute top-4 left-16 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 max-w-[calc(100vw-5rem)] overflow-x-auto flex-nowrap [&::-webkit-scrollbar]:hidden bg-background/40 backdrop-blur-xl border border-foreground/10 shadow-lg rounded-2xl px-4 py-2 flex items-center gap-2 ${isFullscreen ? 'hidden' : ''}`}>
             
             {/* Zoom controls */}
             <div className="flex items-center gap-1">
               <ToolBtn icon={ZoomOut}  title="Zoom Out"    onClick={() => engineRef.current?.zoom_out()} />
               <ToolBtn icon={Maximize} title="Reset View"  onClick={() => engineRef.current?.reset_view()} />
               <ToolBtn icon={ZoomIn}   title="Zoom In"     onClick={() => engineRef.current?.zoom_in()} />
             </div>

             <div className="w-px h-6 bg-foreground/15 mx-1" />



             {/* Drawing Tools */}
             <div className="flex items-center gap-1">
               {/* Selection & Navigation */}
               <ToolBtn icon={MousePointer2} title="Select" active={activeTool === 'select'}   onClick={() => selectTool('select')} />
               <ToolBtn icon={Hand}     title="Pan (Hand)"  active={activeTool === 'hand'}     onClick={() => selectTool('hand')} />
               
               {/* Drawing & Erasing */}
               <ToolBtn icon={Pen}      title="Draw (Round Pen)"   active={activeTool === 'freedraw'} onClick={() => selectTool('freedraw')} />
               <ToolBtn icon={Pen}      title="Calligraphy (Broad Pen)" active={activeTool === 'fountain'} onClick={() => selectTool('fountain')} />
               <ToolBtn icon={Wand2}    title="Magic Pen (Smart Ink)" active={activeTool === 'magic_pen'} onClick={() => selectTool('magic_pen')} />
               <ToolBtn icon={Activity} title="Laser Pen (Fading Glow)" active={activeTool === 'laser_pen'} onClick={() => selectTool('laser_pen')} />
               <ToolBtn icon={Highlighter} title="Highlighter" active={activeTool === 'highlighter'} onClick={() => selectTool('highlighter')} />
               <ToolBtn icon={Eraser}   title="Eraser"      active={activeTool === 'eraser'}    onClick={() => selectTool('eraser')} />
               
               {/* Shapes & Text */}
               <ToolBtn icon={Square}   title="Rectangle"   active={activeTool === 'rectangle'} onClick={() => selectTool('rectangle')} />
               <ToolBtn icon={Circle}   title="Ellipse"     active={activeTool === 'ellipse'}   onClick={() => selectTool('ellipse')} />
               <ToolBtn icon={Minus}    title="Line"        active={activeTool === 'line'}      onClick={() => selectTool('line')} />
               <ToolBtn icon={ArrowUpRight} title="Arrow"   active={activeTool === 'arrow'}     onClick={() => selectTool('arrow')} />
               <ToolBtn icon={Type}     title="Text"        active={activeTool === 'text'}      onClick={() => selectTool('text')} />
             </div>

             <div className="w-px h-6 bg-foreground/15 mx-1" />

             {/* Special Tools */}
             <div className="flex items-center gap-1">
               <ToolBtn icon={ImageIcon} title="Insert Image" onClick={() => imageInputRef.current?.click()} />
               <ToolBtn icon={FileText} title="Insert PDF" onClick={() => pdfInputRef.current?.click()} />
               <ToolBtn icon={Code} title="Insert Mermaid Chart" onClick={handleMermaid} />
             </div>
             
             <input type="file" accept="image/*" className="hidden" ref={imageInputRef} onChange={handleImageUpload} />
             <input type="file" accept="application/pdf" className="hidden" ref={pdfInputRef} onChange={handlePdfUpload} />

             <div className="w-px h-6 bg-foreground/15 mx-1" />

             {/* Clear & Fullscreen */}
             <ToolBtn icon={Languages} title={`Translate Selected Text to ${magicLanguage.toUpperCase()}`} onClick={() => handleTranslate(magicLanguage)} />
             <ToolBtn icon={Trash2} title="Clear Board" onClick={() => engineRef.current?.clear_board()} />
             <ToolBtn icon={isFullscreen ? Minimize : Maximize} title="Toggle Fullscreen" onClick={toggleFullscreen} />
           </div>

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
                       {eraserMode === 'stroke' ? 'Erases individual strokes you touch' : 'Erases entire elements at once'}
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
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function NavItem({ icon: Icon, label, active = false, collapsed = false }: { icon: React.FC<{className?: string}>; label: string; active?: boolean; collapsed?: boolean }) {
  return (
    <a href="#" title={collapsed ? label : undefined} className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2 rounded-lg text-sm transition-colors overflow-hidden
      ${active
        ? 'bg-muted/60 text-foreground font-semibold'
        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
      }`}>
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="whitespace-nowrap">{label}</span>}
    </a>
  );
}

function ToolBtn({ icon: Icon, title, onClick, active }: { icon: React.FC<{className?: string}>; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
        active
          ? 'bg-foreground text-background shadow-sm'
          : 'text-foreground hover:bg-foreground/10'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// ... The new MermaidDialog component will go here ...
type FeaturedModel = { alias: string, display_name: string, description: string, default_quant: string, size_gb: number };
type ModelEntry = { name: string, size_bytes: number };

function MermaidDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (code: string) => void }) {
  const [tab, setTab] = useState<'generate' | 'library' | 'code'>('generate');
  const [input, setInput] = useState('');
  
  // Model State
  const [featuredModels, setFeaturedModels] = useState<FeaturedModel[]>([]);
  const [installedModels, setInstalledModels] = useState<ModelEntry[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  
  // OpenRouter state
  const OR_API_KEY = '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';
  const OPENROUTER_MODELS = [
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 550B (Free)' },
    { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (Free)' },
  ];
  const isOpenRouter = selectedModel.startsWith('openrouter:');
  const openRouterModelId = selectedModel.replace('openrouter:', '');
  
  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedOutput, setGeneratedOutput] = useState('');
  
  // Download State
  const [downloadingAlias, setDownloadingAlias] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState(0);

  useEffect(() => {
    import('@tauri-apps/api/tauri').then(({ invoke }) => {
      invoke<FeaturedModel[]>('rustama_get_featured_models').then(setFeaturedModels);
      refreshInstalledModels();
    });
    
    let isMounted = true;
    let unlistenProgress: any;
    let unlistenToken: any;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ downloaded: number, total: number, pct: number }>('rustama://pull-progress', (e) => {
        setDownloadPct(e.payload.pct);
      }).then(u => {
        if (!isMounted) u();
        else unlistenProgress = u;
      });
      
      listen<string>('rustama://token', (e) => {
        setGeneratedOutput(prev => prev + e.payload);
      }).then(u => {
        if (!isMounted) u();
        else unlistenToken = u;
      });
    });
    
    return () => { 
      isMounted = false;
      if (unlistenProgress) unlistenProgress(); 
      if (unlistenToken) unlistenToken(); 
    };
  }, []);

  const refreshInstalledModels = () => {
    import('@tauri-apps/api/tauri').then(({ invoke }) => {
      invoke<ModelEntry[]>('rustama_list_models').then(models => {
        setInstalledModels(models);
        if (models.length > 0 && !selectedModel) {
          setSelectedModel(models[0].name);
        } else if (models.length === 0 && !selectedModel) {
          // Default to first OpenRouter model for testing
          setSelectedModel('openrouter:nvidia/nemotron-3-ultra-550b-a55b:free');
        }
      });
    });
  };

  const handleDownload = async (m: FeaturedModel) => {
    setDownloadingAlias(m.alias);
    setDownloadPct(0);
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      await invoke('rustama_pull_model', { name: m.alias, quant: m.default_quant });
      refreshInstalledModels();
    } catch (e) {
      alert("Failed to download model: " + e);
    }
    setDownloadingAlias(null);
  };

  const handleGenerate = async () => {
    if (!input || !selectedModel) return;
    setIsGenerating(true);
    setGeneratedOutput('');
    
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      let finalCode: string;

      if (isOpenRouter) {
        finalCode = await invoke<string>('openrouter_generate', {
          model: openRouterModelId,
          prompt: input,
          apiKey: OR_API_KEY,
        });
      } else {
        finalCode = await invoke<string>('rustama_generate', { model: selectedModel, prompt: input });
      }
      
      // ── Deep clean-up of AI output (6-pass robust sanitizer) ────────────────
      let cleanCode = finalCode;

      // Pass 1: Strip AI reasoning blocks, markdown fences and stop tokens
      cleanCode = cleanCode.replace(/<think>[\s\S]*?<\/think>/g, '');
      cleanCode = cleanCode.replace(/```(?:aras|mermaid|diagram)?/gi, '').replace(/```/g, '');
      cleanCode = cleanCode.replace(/<\|im_end\|>/g, '').replace(/<\/s>/g, '').replace(/<\|eot_id\|>/g, '');
      // Strip leading prose like "Here is the diagram:"
      cleanCode = cleanCode.replace(/^[\s\S]*?(?=@type\s*:)/m, '');

      // Pass 2: Normalize quoted label contents (collapse newlines inside quotes)
      cleanCode = cleanCode.replace(/"([^"]*)"/g, (_, inner) =>
        '"' + inner.replace(/\\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() + '"'
      );

      // Pass 3: Fix malformed DSL syntax from AI
      // Fix: group"Name" → group "Name"
      cleanCode = cleanCode.replace(/\bgroup"([^"]+)"/g, 'group "$1"');
      // Fix: "Name"{ → "Name" {
      cleanCode = cleanCode.replace(/("[^"]+")\{/g, '$1 {');
      // Fix: } immediately followed by a new statement on same line
      cleanCode = cleanCode.replace(/\}\s*(group|style|@[a-z]|\[)/g, '\n}\n$1');
      // Fix: statement ending then [ on same line (but not arrow targets)
      cleanCode = cleanCode.replace(/([^-<>\s])\s+\[/g, '$1\n[');

      // Pass 4: Merge multi-line labels (lines not starting a new statement are continuations)
      const rawLines = cleanCode.split('\n');
      const mergedLines: string[] = [];
      for (const line of rawLines) {
        const t = line.trim();
        if (t === '') continue;
        const isNewStmt =
          t.startsWith('@') ||
          t.startsWith('[') ||
          t.startsWith('//') ||
          t.startsWith('group') ||
          t.startsWith('style') ||
          t === '}';
        if (isNewStmt) {
          mergedLines.push(t);
        } else if (mergedLines.length > 0) {
          mergedLines[mergedLines.length - 1] = mergedLines[mergedLines.length - 1].trimEnd() + ' ' + t;
        }
      }
      cleanCode = mergedLines.join('\n').trim();

      // Pass 5: Remove lines that are just lone punctuation artifacts from the AI
      cleanCode = cleanCode.split('\n')
        .filter(l => !/^[|,;:.\-]+$/.test(l.trim()))
        .join('\n');

      console.log('[ArasDiagram] Code to render:\n', cleanCode);
      setGeneratedOutput(cleanCode);

      onSubmit(cleanCode);
    } catch (e) {
      console.error('[ArasDiagram] Generation error:', e);
      alert("Generation failed: " + e);
    }
    setIsGenerating(false);
  };

  const isInstalled = (alias: string) => installedModels.some(m => m.name === alias);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-bold">Aerial AI Studio</h2>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Powered by Rustama Engine</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex px-4 pt-4 border-b border-border bg-muted/10 gap-6">
          <button
            onClick={() => setTab('generate')}
            className={`pb-3 text-xs font-bold uppercase tracking-widest transition-colors ${tab === 'generate' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Generate
          </button>
          <button
            onClick={() => setTab('library')}
            className={`pb-3 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 ${tab === 'library' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Model Library
            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{installedModels.length}</span>
          </button>
          <button
            onClick={() => setTab('code')}
            className={`pb-3 text-xs font-bold uppercase tracking-widest transition-colors ${tab === 'code' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Raw Code
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {tab === 'generate' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Engine:</span>
                <select 
                  value={selectedModel} 
                  onChange={e => setSelectedModel(e.target.value)}
                  className="bg-muted text-sm rounded-md px-3 py-1.5 border border-border focus:outline-none flex-1"
                >
                  {installedModels.length === 0 && OPENROUTER_MODELS.length === 0 && <option value="">No models available</option>}
                  {installedModels.length > 0 && (
                    <optgroup label="🖥️ Local (Rustama Engine)">
                      {installedModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="☁️ OpenRouter (Cloud)">
                    {OPENROUTER_MODELS.map(m => (
                      <option key={m.id} value={`openrouter:${m.id}`}>{m.label}</option>
                    ))}
                  </optgroup>
                </select>
                {installedModels.length === 0 && !isOpenRouter && (
                  <button onClick={() => setTab('library')} className="text-xs text-primary font-bold hover:underline">
                    Download local model
                  </button>
                )}
              </div>

              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="e.g., Create a sequence diagram of OAuth2 login flow..."
                className="w-full h-24 bg-background border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground"
              />
              
              <div className="flex justify-end">
                <button
                  onClick={handleGenerate}
                  disabled={!input || isGenerating || !selectedModel}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {isGenerating ? 'Generating...' : 'Generate Flowchart'}
                </button>
              </div>

              {(isGenerating || generatedOutput) && (
                <div className="mt-2 bg-muted/30 border border-border rounded-lg p-4 font-mono text-sm whitespace-pre-wrap text-foreground/80 min-h-[100px]">
                  {(generatedOutput
                      .replace(/<\|im_end\|>/g, '')
                      .replace(/<\/s>/g, '')
                      .replace(/<\|eot_id\|>/g, '')
                      .replace(/```(?:aras|mermaid)?/gi, '')
                      .replace(/```/g, '')
                      .trim()) || "Connecting to engine..."}
                  {isGenerating && <span className="animate-pulse inline-block w-2 h-4 bg-primary ml-1" />}
                </div>
              )}
            </div>
          )}

          {tab === 'library' && (
            <div className="grid grid-cols-2 gap-4">
              {featuredModels.map(m => {
                const installed = isInstalled(m.alias);
                const downloading = downloadingAlias === m.alias;
                return (
                  <div key={m.alias} className="border border-border rounded-lg p-4 bg-muted/10 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-sm">{m.display_name}</h3>
                      <span className="text-[10px] uppercase font-bold bg-muted px-2 py-1 rounded tracking-widest">{m.size_gb} GB</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">{m.description}</p>
                    <div className="flex gap-2 mt-1">
                      {(m as any).tags?.map((t: string) => <span key={t} className="text-[9px] uppercase border border-border px-1.5 py-0.5 rounded text-muted-foreground">{t}</span>)}
                    </div>
                    
                    <div className="mt-2 pt-3 border-t border-border">
                      {installed ? (
                        <div className="flex justify-between items-center text-xs font-bold text-green-600 dark:text-green-400">
                          <span>Installed</span>
                          <button 
                            className="text-red-500 hover:underline"
                            onClick={async () => {
                              const { invoke } = await import('@tauri-apps/api/tauri');
                              await invoke('rustama_delete_model', { name: m.alias });
                              refreshInstalledModels();
                            }}
                          >Delete</button>
                        </div>
                      ) : downloading ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                            <span>Downloading...</span>
                            <span>{downloadPct}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${downloadPct}%` }} />
                          </div>
                        </div>
                      ) : (
                        <button
                          disabled={downloadingAlias !== null}
                          onClick={() => handleDownload(m)}
                          className="w-full text-xs font-bold bg-foreground text-background py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-30"
                        >
                          Download Model
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {tab === 'code' && (
            <div className="flex flex-col gap-4">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="graph TD;&#10;  A-->B;&#10;  A-->C;"
                className="w-full h-48 bg-background border border-border rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => { if (input) onSubmit(input); }}
                  disabled={!input}
                  className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                >
                  <Code2 className="w-4 h-4" />
                  Render Diagram
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
