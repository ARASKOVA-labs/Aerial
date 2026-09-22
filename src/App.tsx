import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Menu,
  Plus,
  Pen,
  Square,
  Circle,
  Minus,
  Hand,
  MousePointer2,
  Maximize,
  Trash2,
  Type,
  Code,
  ArrowUpRight,
  Highlighter,
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
  MessageSquare,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
import './App.css';
import { AerialMark } from './AerialLogo';
import { AerialCanvas } from './components/AerialCanvas';
import {
  ToolBtn,
  DropdownToolBtn,
  AerialZoomBar,
  STROKE_COLORS,
} from './components/AerialToolbar';
import type {
  AerialCanvasRef,
  DesktopToolId,
  ToolId,
} from './lib/types';
import { createLogger } from './lib/logger';

const logger = createLogger('App');

export default function App() {
  const canvasRef = useRef<AerialCanvasRef>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<DesktopToolId>('freedraw');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [eraserSize, setEraserSize] = useState(24);
  const [eraserMode, setEraserMode] = useState<'stroke' | 'element'>('stroke');
  const [fountainSharpness, setFountainSharpness] = useState(0.5);
  const [magicLanguage, setMagicLanguage] = useState<'en' | 'ml' | 'ta' | 'te'>('en');
  const [magicFont, setMagicFont] = useState("'Space Grotesk', sans-serif");
  const [fontFamily, setFontFamily] = useState('Caveat');
  const [isRough, setIsRough] = useState(true);
  const [isCurved, setIsCurved] = useState(true);
  const [gridType, setGridType] = useState('dots');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [palmRejection, setPalmRejection] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);

  // UI Panels / Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showMermaidDialog, setShowMermaidDialog] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Collaboration State
  const wsRef = useRef<WebSocket | null>(null);

  // Dark mode (persisted to localStorage)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('aerial_dark_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('aerial_dark_mode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    canvasRef.current?.setDarkMode(isDarkMode);
  }, [isDarkMode]);

  // ── Canvas onReady: Hydrate board and pre-load assets ───────────────────────
  const handleCanvasReady = useCallback(async (api: AerialCanvasRef) => {
    const engine = api.getEngine();
    if (!engine) return;

    // Load persisted board from Tauri backend
    let loadedDbBoard = false;
    try {
      const dbBytes = await invoke<number[] | null>('load_board');
      if (dbBytes) {
        api.importFullState(new Uint8Array(dbBytes));

        // Pre-load images from assets after hydration
        const dbJson = api.getSceneJson();
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
                } catch (err) {
                  logger.error(`Failed to load asset ${el.asset_id}:`, err);
                }
              }
            }
          }
        } catch (_) { /* invalid json */ }
        loadedDbBoard = true;
      }
    } catch (e) {
      logger.error('Failed to load from redb DB:', e);
    }

    if (!loadedDbBoard) {
      setShowWelcome(true);
    }

    engine.set_grid_type(gridType);
    engine.set_dark_mode(isDarkMode);
    engine.render();
    setCanvasReady(true);
  }, [gridType, isDarkMode]);

  // ── Auto-Save Loop: Persist to Tauri backend & broadcast delta ─────────────
  useEffect(() => {
    if (!canvasReady) return;
    const interval = setInterval(() => {
      const engine = canvasRef.current?.getEngine();
      if (!engine) return;
      const needsSave = engine.check_and_clear_dirty();
      if (needsSave) {
        const stateBytes = engine.export_full_state();
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < stateBytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, stateBytes.subarray(i, i + chunkSize) as unknown as number[]);
        }
        const b64 = window.btoa(binary);
        invoke('save_board', { payloadB64: b64 }).catch(err => logger.error('Auto-save failed:', err));

        // Broadcast to WebSocket collaboration room if connected
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const syncStep1Packet = engine.get_local_state_vector();
          wsRef.current.send(syncStep1Packet);
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [canvasReady]);

  // ── Grid Type Sync ────────────────────────────────────────────────────────
  useEffect(() => {
    const engine = canvasRef.current?.getEngine();
    if (engine && canvasReady) {
      engine.set_grid_type(gridType);
      engine.render();
    }
  }, [gridType, canvasReady]);

  // ── Tool Selection ────────────────────────────────────────────────────────
  const selectTool = useCallback((id: DesktopToolId) => {
    if (activeTool === id) {
      if (['freedraw', 'fountain', 'highlighter', 'rectangle', 'ellipse', 'line', 'arrow', 'eraser', 'magic_pen'].includes(id)) {
        setShowSettings(s => !s);
      }
      return;
    }
    setActiveTool(id);
    setShowSettings(false);

    if (id === 'image' || id === 'pdf' || id === 'magic_pen') {
      const engine = canvasRef.current?.getEngine();
      if (id === 'magic_pen') {
        engine?.set_tool_magic_pen();
      }
      return;
    }

    canvasRef.current?.setTool(id as ToolId);
  }, [activeTool]);

  // ── Color & Stroke Changes ────────────────────────────────────────────────
  const changeColor = useCallback((color: string) => {
    setStrokeColor(color);
    canvasRef.current?.setStrokeColor(color);
  }, []);

  const changeWidth = useCallback((w: number) => {
    setStrokeWidth(w);
    canvasRef.current?.setStrokeWidth(w);
  }, []);

  const changeSharpness = useCallback((s: number) => {
    setFountainSharpness(s);
    canvasRef.current?.getEngine()?.set_fountain_sharpness(s);
  }, []);

  // ── Diagram Node Double-Click (Tauri DSL update) ───────────────────────────
  const handleNodeDoubleClick = useCallback((_elementId: bigint, nodeId: string, code?: string) => {
    if (!code) return;
    const newLabel = window.prompt(`Rename diagram node [${nodeId}]:`);
    if (newLabel && newLabel.trim().length > 0) {
      invoke<string>('update_diagram_node', {
        code,
        nodeId,
        newLabel,
      }).then(newCode => {
        invoke<{ svg: string; hit_map: unknown }>('render_diagram', { code: newCode }).then(res => {
          canvasRef.current?.addDiagram(newCode, res.svg);
        });
      }).catch(err => {
        logger.error('Failed to update diagram node:', err);
      });
    }
  }, []);

  // ── Image Upload ──────────────────────────────────────────────────────────
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const engine = canvasRef.current?.getEngine();
    if (!file || !engine) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const assetId = crypto.randomUUID();
      try {
        await invoke('save_asset', { id: assetId, base64Data: dataUrl });
      } catch (err) {
        logger.error('Failed to save asset:', err);
        return;
      }

      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const maxW = 800;
        if (w > maxW) {
          h = (maxW / w) * h;
          w = maxW;
        }
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const wx = engine.screen_to_world_x(cx - w / 2);
        const wy = engine.screen_to_world_y(cy - h / 2);
        canvasRef.current?.addImage(img, wx, wy, w, h, assetId);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  // ── PDF Upload ────────────────────────────────────────────────────────────
  const handlePdfUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const engine = canvasRef.current?.getEngine();
    if (!file || !engine) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const typedarray = new Uint8Array(ev.target?.result as ArrayBuffer);
      try {
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;

        const startWy = engine.screen_to_world_y(100);
        let startWx = engine.screen_to_world_x(window.innerWidth / 2 - 300);

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await page.render({ canvasContext: context, viewport } as any).promise;
            const dataUrl = canvas.toDataURL('image/png');
            const assetId = crypto.randomUUID();

            try {
              await invoke('save_asset', { id: assetId, base64Data: dataUrl });
            } catch (err) {
              logger.error('Failed to save PDF page asset:', err);
              continue;
            }

            const img = new Image();
            img.onload = () => {
              canvasRef.current?.addImage(img, startWx, startWy, viewport.width, viewport.height, assetId);
              startWx += viewport.width + 40;
            };
            img.src = dataUrl;
          }
        }
      } catch (err) {
        logger.error('Error rendering PDF:', err);
      }
    };
    reader.readAsArrayBuffer(file);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  }, []);

  // ── Text Translation via Tauri HTTP ───────────────────────────────────────
  const handleTranslate = useCallback(async (targetLang: string) => {
    const engine = canvasRef.current?.getEngine();
    if (!engine) return;
    const text = engine.get_selected_text();
    if (!text) {
      alert('Please select a text element first!');
      return;
    }

    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      const res = await tauriFetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (data && data[0]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const translated = data[0].map((x: any) => x[0]).join('');
        engine.update_selected_text(translated);
        engine.render();
      }
    } catch (err) {
      logger.error('Translation failed:', err);
      alert('Translation failed.');
    }
  }, []);

  // ── Fullscreen Toggle ─────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => {
          getCurrentWindow().setFullscreen(next).catch(() => {});
        })
        .catch(() => {
          if (next) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
        });
      return next;
    });
  }, []);

  // ── Keyboard Shortcuts (Escape to close overlays) ──────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowMoreTools(false);
        setIsMenuOpen(false);
        setShowClearConfirm(false);
        setShowFeedbackModal(false);
        setShowMermaidDialog(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-background text-foreground overflow-hidden font-brand select-none"
      onPointerDown={() => {
        if (showWelcome) setShowWelcome(false);
      }}
    >
      {/* ── Background Canvas Component (Core Library) ── */}
      <div className="absolute inset-0 z-0">
        <AerialCanvas
          ref={canvasRef}
          theme={isDarkMode ? 'dark' : 'light'}
          palmRejection={palmRejection}
          showToolbar={false}
          onReady={handleCanvasReady}
          onZoomChange={setZoomLevel}
          onNodeDoubleClick={handleNodeDoubleClick}
          className="w-full h-full"
        />

        {/* Welcome watermark overlay */}
        {showWelcome && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <h1 className="text-[120px] font-brand tracking-tight font-black opacity-10">Aerial</h1>
            <p className="absolute mt-32 font-mono text-muted-foreground animate-pulse text-sm">Pick a tool and start drawing</p>
          </div>
        )}
      </div>

      {/* ── Desktop Floating UI Layer ── */}
      <div className="absolute inset-0 z-50 pointer-events-none flex">

        {/* Top-Left Hamburger Menu */}
        <div className={`absolute top-4 left-4 z-50 transition-all duration-500 ease-in-out ${isFullscreen ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-background/40 backdrop-blur-xl border border-foreground/10 shadow-lg rounded-xl hover:bg-foreground/5 transition-colors"
            title="Menu"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          {isMenuOpen && (
            <div className="pointer-events-auto absolute top-12 left-0 w-60 bg-background/60 backdrop-blur-2xl border border-foreground/10 shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
              <div className="px-4 py-4 flex items-center gap-3 border-b border-border">
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

                <div className="flex items-center justify-between px-1 mt-1">
                  <span className="text-xs font-semibold text-muted-foreground">Pencil Only (Palm Rejection)</span>
                  <button
                    onClick={() => setPalmRejection(!palmRejection)}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${palmRejection ? 'bg-[#6366f1]' : 'bg-muted'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${palmRejection ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div className="h-px w-full bg-border" />

                {/* New Board */}
                <button
                  className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-lg py-2 px-3 flex justify-center items-center gap-2 text-sm font-semibold transition-all mb-2"
                  onClick={() => setShowClearConfirm(true)}
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
            <ToolBtn icon={MousePointer2} title="Select" active={activeTool === 'select'} onClick={() => selectTool('select')} />
            <ToolBtn icon={Hand} title="Pan (Hand)" active={activeTool === 'hand'} onClick={() => selectTool('hand')} />
            <div className="w-px h-5 bg-foreground/15 mx-1 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1">
              <ToolBtn icon={Square} title="Rectangle" active={activeTool === 'rectangle'} onClick={() => selectTool('rectangle')} />
              <ToolBtn icon={Circle} title="Ellipse" active={activeTool === 'ellipse'} onClick={() => selectTool('ellipse')} />
              <ToolBtn icon={Minus} title="Line" active={activeTool === 'line'} onClick={() => selectTool('line')} />
              <ToolBtn icon={ArrowUpRight} title="Arrow" active={activeTool === 'arrow'} onClick={() => selectTool('arrow')} />
            </div>
            <div className="w-px h-5 bg-foreground/15 mx-1 hidden sm:block" />
            <ToolBtn icon={Pen} title="Draw (Pen)" active={activeTool === 'freedraw'} onClick={() => selectTool('freedraw')} />
            <ToolBtn icon={Type} title="Text" active={activeTool === 'text'} onClick={() => selectTool('text')} />
            <ToolBtn icon={Eraser} title="Eraser" active={activeTool === 'eraser'} onClick={() => selectTool('eraser')} />
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
                  <DropdownToolBtn icon={Code} title="Mermaid Chart" onClick={() => { setShowMermaidDialog(true); setShowMoreTools(false); }} />
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

          {/* Bottom Left: Zoom & History (AerialZoomBar) */}
          <AerialZoomBar
            zoomLevel={zoomLevel}
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            onResetView={() => canvasRef.current?.resetView()}
            onUndo={() => canvasRef.current?.undo()}
            onRedo={() => canvasRef.current?.redo()}
            isHidden={isFullscreen}
          />

          {/* Hidden File Inputs */}
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
                      {(['en', 'ml', 'ta', 'te'] as const).map(lang => (
                        <button
                          key={lang}
                          onClick={() => setMagicLanguage(lang)}
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                            magicLanguage === lang ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {lang === 'en' ? 'English' : lang === 'ml' ? 'Malayalam' : lang === 'ta' ? 'Tamil' : 'Telugu'}
                        </button>
                      ))}
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
                            eraserMode === mode ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
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
                        canvasRef.current?.getEngine()?.set_stroke_width(s / 4);
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
                          canvasRef.current?.getEngine()?.set_is_rough(e.target.checked);
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
                            canvasRef.current?.getEngine()?.set_is_curved(e.target.checked);
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
                          setMagicLanguage(lang as 'en' | 'ml' | 'ta' | 'te');
                          handleTranslate(lang);
                        }}
                        className="flex-1 min-w-[30px] py-1.5 text-[11px] font-semibold rounded-md transition-all bg-muted text-muted-foreground hover:bg-foreground hover:text-background"
                      >
                        {lang.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Font Settings */}
                {activeTool === 'text' && (
                  <div className="flex flex-col gap-3 pt-4 border-t border-border">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Handwriting Font</p>
                      <div className="flex flex-col gap-2">
                        {['Caveat', 'Kalam', 'Space Grotesk'].map(font => (
                          <button
                            key={font}
                            onClick={() => { setFontFamily(font); selectTool('select'); }}
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

      {/* ── Mermaid / AI Studio Dialog ── */}
      {showMermaidDialog && (
        <MermaidDialog onClose={() => setShowMermaidDialog(false)} />
      )}

      {/* ── Clear Board Confirmation Modal ── */}
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
                  canvasRef.current?.clearBoard();
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

      {/* ── Beta Feedback Modal ── */}
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

// ── Mermaid / AI Studio Dialog ───────────────────────────────────────────────

function MermaidDialog({ onClose }: { onClose: () => void }) {
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
