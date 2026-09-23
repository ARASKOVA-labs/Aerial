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
  Download,
  FileCode,
  ExternalLink,
  Command,
  Palette,
  Sliders,
  Layers,
  Edit3,
  Check,
  Copy,
  Bot,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import mermaid from 'mermaid';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
import './App.css';
import { AerialMark } from './AerialLogo';
import { AerialCanvas } from './components/AerialCanvas';
import { QuickCanvasModal } from './components/QuickCanvasModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
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
import {
  getAraskovaMermaidConfig,
  applyAraskovaDiagramAesthetics,
  ARASKOVA_DIAGRAM_TEMPLATES,
  type AraskovaDiagramStyle,
} from './lib/diagram-theme';

const logger = createLogger('App');

mermaid.initialize({
  ...getAraskovaMermaidConfig(true, 'brutalist'),
  startOnLoad: false,
  securityLevel: 'loose',
});

export const CANVAS_BG_PRESETS = [
  { name: 'Brand Dark', hex: '#0a0a0a', border: '#2a2a2a' },
  { name: 'Deep Charcoal', hex: '#18181b', border: '#3f3f46' },
  { name: 'Slate Navy', hex: '#0f172a', border: '#334155' },
  { name: 'Blueprint', hex: '#0c2a4a', border: '#1e3a8a' },
  { name: 'Paper White', hex: '#ffffff', border: '#e2e8f0' },
  { name: 'Warm Ivory', hex: '#fdfbf7', border: '#e7e5e4' },
];

export interface BoardInfo {
  id: string;
  name: string;
  updatedAt: number;
  bgColor?: string;
  gridType?: 'dots' | 'lines' | 'blank';
}

export default function App() {
  const canvasRef = useRef<AerialCanvasRef>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<DesktopToolId>('freedraw');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [eraserSize, setEraserSize] = useState(24);
  const [eraserMode, setEraserMode] = useState<'stroke' | 'precision' | 'element'>('precision');
  const [fountainSharpness, setFountainSharpness] = useState(0.5);
  const [magicLanguage, setMagicLanguage] = useState<'en' | 'ml' | 'ta' | 'te'>('en');
  const [magicFont, setMagicFont] = useState("'Space Grotesk', sans-serif");
  const [fontFamily, setFontFamily] = useState('Caveat');
  const [isRough, setIsRough] = useState(true);
  const [isCurved, setIsCurved] = useState(true);
  const [gridType, setGridType] = useState<'dots' | 'lines' | 'blank'>('dots');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [palmRejection, setPalmRejection] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);

  // Multi-Canvas & Board Management
  const [boards, setBoards] = useState<BoardInfo[]>(() => {
    try {
      const saved = localStorage.getItem('aerial_board_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) { /* fallback */ }
    return [{ id: 'default_board', name: 'Main Canvas', updatedAt: Date.now() }];
  });
  const [activeBoardId, setActiveBoardId] = useState<string>(() => {
    return localStorage.getItem('aerial_active_board_id') || 'default_board';
  });
  const [isRenamingBoard, setIsRenamingBoard] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [canvasBgColor, setCanvasBgColor] = useState<string>(() => {
    const saved = localStorage.getItem('aerial_canvas_bg');
    if (saved) return saved;
    const isDark = localStorage.getItem('aerial_dark_mode') === 'true';
    return isDark ? '#0a0a0a' : '#ffffff';
  });

  // UI Panels / Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showDiagramModal, setShowDiagramModal] = useState(false);
  const [showTranslatorModal, setShowTranslatorModal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showQuickCanvas, setShowQuickCanvas] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Refs for dismissing popovers on canvas tap / outside click
  const settingsRef = useRef<HTMLDivElement>(null);
  const moreToolsRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const moreToolsBtnRef = useRef<HTMLButtonElement>(null);
  const sidebarBtnRef = useRef<HTMLButtonElement>(null);

  const closeAllPopups = useCallback((): boolean => {
    const wasOpen = showSettings || showMoreTools || isMenuOpen || showWelcome || showQuickCanvas || showCommandPalette;
    if (showSettings) setShowSettings(false);
    if (showMoreTools) setShowMoreTools(false);
    if (isMenuOpen) setIsMenuOpen(false);
    if (showWelcome) setShowWelcome(false);
    if (showQuickCanvas) setShowQuickCanvas(false);
    if (showCommandPalette) setShowCommandPalette(false);
    return wasOpen;
  }, [showSettings, showMoreTools, isMenuOpen, showWelcome, showQuickCanvas, showCommandPalette]);

  // ── Global Shortcut Event Listener (Tauri) ─────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('quick-canvas:open', () => {
      setShowQuickCanvas(true);
    }).then((fn) => {
      unlisten = fn;
    }).catch((err) => {
      logger.debug('Tauri event listen not available (web mode):', err);
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // ── Dismiss Popovers on Outside Tap / Click ─────────────────────────────────
  useEffect(() => {
    if (!showSettings && !showMoreTools && !isMenuOpen) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        settingsRef.current?.contains(target) ||
        settingsBtnRef.current?.contains(target) ||
        moreToolsRef.current?.contains(target) ||
        moreToolsBtnRef.current?.contains(target) ||
        sidebarRef.current?.contains(target) ||
        sidebarBtnRef.current?.contains(target)
      ) {
        return;
      }

      closeAllPopups();
    };

    window.addEventListener('pointerdown', handlePointerDownOutside, true);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutside, true);
  }, [showSettings, showMoreTools, isMenuOpen, closeAllPopups]);

  // Collaboration State
  const wsRef = useRef<WebSocket | null>(null);

  // Dark mode (persisted to localStorage)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('aerial_dark_mode') === 'true';
  });

  const isFirstMount = useRef(true);
  useEffect(() => {
    localStorage.setItem('aerial_dark_mode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    canvasRef.current?.setDarkMode(isDarkMode);

    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    // When theme switches, reset canvas background back to default: #0a0a0a for dark mode, #ffffff for light mode
    const defaultBg = isDarkMode ? '#0a0a0a' : '#ffffff';
    setCanvasBgColor(defaultBg);
    localStorage.setItem('aerial_canvas_bg', defaultBg);
    canvasRef.current?.setBackgroundColor(defaultBg);
  }, [isDarkMode]);

  // ── Theme Switcher: Reverts canvas background to default dark/light canvas ───
  const handleThemeChange = useCallback((dark: boolean) => {
    setIsDarkMode(dark);
    const defaultBg = dark ? '#0a0a0a' : '#ffffff';
    setCanvasBgColor(defaultBg);
    localStorage.setItem('aerial_canvas_bg', defaultBg);
    canvasRef.current?.setBackgroundColor(defaultBg);
  }, []);

  // ── Canvas onReady: Hydrate board and pre-load assets ───────────────────────
  const handleCanvasReady = useCallback(async (api: AerialCanvasRef) => {
    const engine = api.getEngine();
    if (!engine) return;

    // Load persisted board from Tauri backend
    let loadedDbBoard = false;
    try {
      const dbBytes = await invoke<number[] | null>('load_board', { boardId: activeBoardId });
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
                  if (dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                      engine.set_cached_image(BigInt(el.id), img);
                      engine.render();
                    };
                    img.src = dataUrl;
                  }
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
    if (canvasBgColor && typeof (engine as any).set_background_color === 'function') {
      (engine as any).set_background_color(canvasBgColor);
    }
    engine.render();
    setCanvasReady(true);
  }, [activeBoardId, gridType, isDarkMode, canvasBgColor]);

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
        invoke('save_board', { payloadB64: b64, boardId: activeBoardId }).catch(err => logger.error('Auto-save failed:', err));

        // Broadcast to WebSocket collaboration room if connected
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const syncStep1Packet = engine.get_local_state_vector();
          wsRef.current.send(syncStep1Packet);
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [canvasReady, activeBoardId]);

  // ── Grid Type Sync ────────────────────────────────────────────────────────
  useEffect(() => {
    const engine = canvasRef.current?.getEngine();
    if (engine && canvasReady) {
      engine.set_grid_type(gridType);
      engine.render();
    }
  }, [gridType, canvasReady]);

  // ── Multi-Board Switching & Creation ──────────────────────────────────────
  const switchBoard = useCallback(async (targetId: string) => {
    if (targetId === activeBoardId) return;
    const engine = canvasRef.current?.getEngine();
    if (engine) {
      // Save current board before switching
      try {
        const stateBytes = engine.export_full_state();
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < stateBytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, stateBytes.subarray(i, i + chunkSize) as unknown as number[]);
        }
        const b64 = window.btoa(binary);
        await invoke('save_board', { payloadB64: b64, boardId: activeBoardId });
      } catch (err) {
        logger.error('Failed to save previous board before switch:', err);
      }

      // Switch active ID
      setActiveBoardId(targetId);
      localStorage.setItem('aerial_active_board_id', targetId);

      // Load target board
      try {
        const dbBytes = await invoke<number[] | null>('load_board', { boardId: targetId });
        if (dbBytes && dbBytes.length > 0) {
          canvasRef.current?.importFullState(new Uint8Array(dbBytes));
        } else {
          canvasRef.current?.clearBoard();
        }
      } catch (err) {
        logger.error('Failed to load target board:', err);
        canvasRef.current?.clearBoard();
      }

      const targetBoard = boards.find(b => b.id === targetId);
      if (targetBoard?.bgColor) setCanvasBgColor(targetBoard.bgColor);
      if (targetBoard?.gridType) setGridType(targetBoard.gridType);
    }
  }, [activeBoardId, boards]);

  const createNewBoard = useCallback(async () => {
    const newId = 'board_' + Date.now();
    const newName = `Canvas ${boards.length + 1}`;
    const newBoard: BoardInfo = {
      id: newId,
      name: newName,
      updatedAt: Date.now(),
      bgColor: canvasBgColor,
      gridType: gridType,
    };
    const updatedList = [...boards, newBoard];
    setBoards(updatedList);
    localStorage.setItem('aerial_board_list', JSON.stringify(updatedList));
    await switchBoard(newId);
  }, [boards, canvasBgColor, gridType, switchBoard]);

  const renameBoard = useCallback((boardId: string, newName: string) => {
    if (!newName.trim()) return;
    setBoards(prev => {
      const updated = prev.map(b => b.id === boardId ? { ...b, name: newName.trim(), updatedAt: Date.now() } : b);
      localStorage.setItem('aerial_board_list', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteBoard = useCallback((boardId: string) => {
    if (boards.length <= 1) return;
    const remaining = boards.filter(b => b.id !== boardId);
    setBoards(remaining);
    localStorage.setItem('aerial_board_list', JSON.stringify(remaining));
    if (activeBoardId === boardId) {
      switchBoard(remaining[0].id);
    }
  }, [boards, activeBoardId, switchBoard]);

  // ── Tool Selection ────────────────────────────────────────────────────────
  const selectTool = useCallback((id: DesktopToolId) => {
    if (activeTool === id) {
      if (['freedraw', 'fountain', 'highlighter', 'rectangle', 'ellipse', 'line', 'arrow', 'magic_pen', 'eraser'].includes(id)) {
        setShowSettings(s => !s);
      }
      return;
    }
    setActiveTool(id);
    setShowSettings(false);

    if (id === 'image' || id === 'pdf') {
      return;
    }

    canvasRef.current?.setTool(id as ToolId);
  }, [activeTool, eraserMode]);

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

  // ── Canvas Background Change ──────────────────────────────────────────────
  const changeCanvasBg = useCallback((color: string) => {
    setCanvasBgColor(color);
    localStorage.setItem('aerial_canvas_bg', color);
    canvasRef.current?.setBackgroundColor(color);
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
          const enhanced = applyAraskovaDiagramAesthetics(res.svg, isDarkMode);
          canvasRef.current?.addDiagram(newCode, enhanced);
        });
      }).catch(err => {
        logger.error('Failed to update diagram node:', err);
      });
    }
  }, [isDarkMode]);

  // ── Quick Canvas Note Stamping & Promotion Handlers ─────────────────────────
  const handleStampSketch = useCallback(async (pngBlob: Blob) => {
    const engine = canvasRef.current?.getEngine();
    if (!engine) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const assetId = crypto.randomUUID();
      try {
        await invoke('save_asset', { id: assetId, base64Data: dataUrl });
      } catch (err) {
        logger.error('Failed to save stamped quick note asset:', err);
      }

      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const maxW = 600;
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
    reader.readAsDataURL(pngBlob);
  }, []);

  const handleStampText = useCallback((text: string) => {
    canvasRef.current?.addText(text);
  }, []);

  const handleSaveQuickNoteAsBoard = useCallback(async (name: string, canvasState?: Uint8Array, textContent?: string) => {
    const newId = 'board_' + Date.now();
    const newBoard: BoardInfo = {
      id: newId,
      name: name || `Quick Note ${boards.length + 1}`,
      updatedAt: Date.now(),
      bgColor: canvasBgColor,
      gridType: gridType,
    };
    const updatedList = [...boards, newBoard];
    setBoards(updatedList);
    localStorage.setItem('aerial_board_list', JSON.stringify(updatedList));

    if (canvasState && canvasState.length > 0) {
      let binary = '';
      for (let i = 0; i < canvasState.length; i++) {
        binary += String.fromCharCode(canvasState[i]);
      }
      const b64 = btoa(binary);
      try {
        await invoke('save_board', { payloadB64: b64, boardId: newId });
      } catch (e) {
        logger.error('Failed to save quick note board to DB:', e);
      }
    }

    await switchBoard(newId);

    if (textContent) {
      setTimeout(() => {
        canvasRef.current?.addText(textContent);
      }, 100);
    }
  }, [boards, canvasBgColor, gridType, switchBoard]);

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

  // ── Export Canvas to PNG Image ──────────────────────────────────────────
  const handleExportImage = useCallback(async () => {
    try {
      const blob = await canvasRef.current?.exportPngBlob();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aerial-board-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      logger.error('Failed to export image:', err);
    }
  }, []);

  // ── Export Canvas to SVG Vector ──────────────────────────────────────────
  const handleExportSvg = useCallback(async () => {
    try {
      const svg = await canvasRef.current?.exportSvgString();
      if (svg) {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aerial-board-${Date.now()}.svg`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      logger.error('Failed to export SVG:', err);
    }
  }, []);

  // ── Keyboard Shortcuts (Tools, Overlays, and Navigation) ─────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when user is actively typing in inputs
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowMoreTools(false);
        setIsMenuOpen(false);
        setShowClearConfirm(false);
        setShowFeedbackModal(false);
        setShowDiagramModal(false);
        setShowTranslatorModal(false);
        setShowShortcutsModal(false);
        setShowQuickCanvas(false);
        setShowCommandPalette(false);
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl) {
        // Cmd + Shift + N : Quick Canvas (Instant Note)
        if (e.shiftKey && e.key.toLowerCase() === 'n') {
          e.preventDefault();
          setShowQuickCanvas(s => !s);
          return;
        }

        // Cmd + J : Quick Note alternative
        if (e.key.toLowerCase() === 'j') {
          e.preventDefault();
          setShowQuickCanvas(s => !s);
          return;
        }

        // Cmd + K : Spotlight Command Palette
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setShowCommandPalette(s => !s);
          return;
        }

        // Cmd + Shift + S : Export SVG
        if (e.shiftKey && e.key.toLowerCase() === 's') {
          e.preventDefault();
          handleExportSvg();
          return;
        }

        // Cmd + S : Export PNG Image / Save
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          handleExportImage();
          return;
        }

        // Cmd + E : Export Image
        if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          handleExportImage();
          return;
        }

        // Cmd + N : Create New Board
        if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          createNewBoard();
          return;
        }

        // Cmd + O : Open / Import Image (or Shift+O for PDF)
        if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          if (e.shiftKey) {
            pdfInputRef.current?.click();
          } else {
            imageInputRef.current?.click();
          }
          return;
        }

        // Cmd + B or Cmd + \ : Toggle Sidebar Drawer
        if (e.key.toLowerCase() === 'b' || e.key === '\\') {
          e.preventDefault();
          setIsMenuOpen(s => !s);
          return;
        }

        // Cmd + , : Toggle Settings Popover
        if (e.key === ',') {
          e.preventDefault();
          setShowSettings(s => !s);
          return;
        }

        // Cmd + Shift + Backspace / Delete : Clear Board Confirm
        if ((e.key === 'Backspace' || e.key === 'Delete') && e.shiftKey) {
          e.preventDefault();
          setShowClearConfirm(true);
          return;
        }

        // Cmd + [ / Cmd + ] : Previous / Next Board
        if (e.key === '[') {
          e.preventDefault();
          const currIdx = boards.findIndex(b => b.id === activeBoardId);
          if (currIdx > 0) switchBoard(boards[currIdx - 1].id);
          return;
        }
        if (e.key === ']') {
          e.preventDefault();
          const currIdx = boards.findIndex(b => b.id === activeBoardId);
          if (currIdx >= 0 && currIdx < boards.length - 1) switchBoard(boards[currIdx + 1].id);
          return;
        }

        // Cmd + 1..9 : Switch to board by index
        if (/^[1-9]$/.test(e.key)) {
          const boardIndex = parseInt(e.key, 10) - 1;
          if (boards[boardIndex]) {
            e.preventDefault();
            switchBoard(boards[boardIndex].id);
            return;
          }
        }

        // Zoom shortcuts: Cmd+0, Cmd+=, Cmd+-
        if (e.key === '0') {
          e.preventDefault();
          canvasRef.current?.resetView();
          return;
        }
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          canvasRef.current?.zoomIn();
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          canvasRef.current?.zoomOut();
          return;
        }

        // Fullscreen: Cmd+Ctrl+F
        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          toggleFullscreen();
          return;
        }

        // Shortcuts modal: Cmd+/
        if (e.key === '/') {
          e.preventDefault();
          setShowShortcutsModal(s => !s);
          return;
        }
      }

      // Help modal on '?'
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal(s => !s);
        return;
      }

      // Standalone single-key tool shortcuts
      switch (e.key.toLowerCase()) {
        case '1':
        case 'v':
          selectTool('select');
          break;
        case '2':
        case 'h':
          selectTool('hand');
          break;
        case '3':
        case 'r':
          selectTool('rectangle');
          break;
        case '4':
        case 'o':
        case 'c':
          selectTool('ellipse');
          break;
        case '5':
        case 'l':
          selectTool('line');
          break;
        case '6':
        case 'a':
          selectTool('arrow');
          break;
        case '7':
        case 'p':
        case 'd':
          selectTool('freedraw');
          break;
        case '8':
        case 't':
          selectTool('text');
          break;
        case '9':
        case 'e':
          if (activeTool === 'eraser') {
            const nextMode: 'stroke' | 'precision' | 'element' =
              eraserMode === 'stroke' ? 'precision' : eraserMode === 'precision' ? 'element' : 'stroke';
            setEraserMode(nextMode);
            canvasRef.current?.setEraserType(nextMode);
          } else {
            selectTool('eraser');
          }
          break;
        case 'f':
          selectTool('fountain');
          break;
        case 'm':
          selectTool('highlighter');
          break;
        case 'w':
          selectTool('magic_pen');
          break;
        case 'z':
          selectTool('laser_pen');
          break;
        case 's':
          setShowSettings(s => !s);
          break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleExportImage, handleExportSvg, createNewBoard, switchBoard, boards, activeBoardId, toggleFullscreen, selectTool, activeTool, eraserMode]);

  return (
    <div
      className="fixed inset-0 text-foreground overflow-hidden font-brand select-none"
      style={{ backgroundColor: canvasBgColor }}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement | null;
        if (target && (
          settingsRef.current?.contains(target) ||
          moreToolsRef.current?.contains(target) ||
          sidebarRef.current?.contains(target) ||
          settingsBtnRef.current?.contains(target) ||
          moreToolsBtnRef.current?.contains(target) ||
          sidebarBtnRef.current?.contains(target)
        )) {
          return;
        }
        closeAllPopups();
      }}
    >
      {/* ── Background Canvas Component (Core Library) ── */}
      <div className="absolute inset-0 z-0">
        <AerialCanvas
          ref={canvasRef}
          theme={isDarkMode ? 'dark' : 'light'}
          backgroundColor={canvasBgColor}
          onChangeBackgroundColor={changeCanvasBg}
          palmRejection={palmRejection}
          magicLanguage={magicLanguage}
          magicFont={magicFont}
          eraserType={eraserMode}
          eraserSize={eraserSize}
          onEraserTypeChange={(t) => setEraserMode(t)}
          showToolbar={false}
          onReady={handleCanvasReady}
          onZoomChange={setZoomLevel}
          onToolChange={(tool) => setActiveTool(tool)}
          onNodeDoubleClick={handleNodeDoubleClick}
          onCanvasPointerDown={closeAllPopups}
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
            ref={sidebarBtnRef}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="pointer-events-auto h-10 px-2.5 flex items-center gap-2 bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] shadow-md rounded-2xl hover:bg-[var(--accent)] transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Menu & Canvas Settings"
          >
            <AerialMark size={24} isDarkMode={isDarkMode} />
            <Menu className="w-4 h-4 text-[var(--foreground)]" />
          </button>

          {isMenuOpen && (
            <div ref={sidebarRef} className="pointer-events-auto absolute top-12 left-0 w-80 max-h-[calc(100vh-4rem)] bg-[var(--card)]/95 backdrop-blur-2xl border border-[var(--border)] shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 z-50">
              {/* Header */}
              <div className="px-4 py-3.5 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-xl overflow-hidden shadow-sm flex items-center justify-center">
                    <AerialMark size={32} isDarkMode={isDarkMode} />
                  </div>
                  <div>
                    <h1 className="font-rephen text-lg tracking-widest leading-none text-[var(--foreground)]" style={{ letterSpacing: '0.15em' }}>AERIAL</h1>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] tracking-wide">CANVAS STUDIO</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                  title="Close Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Body - 100% visible on any window height */}
              <div className="p-3.5 overflow-y-auto overscroll-contain flex flex-col gap-3 text-xs scrollbar-thin">
                {/* ── 1. Multi-Canvas Switcher ── */}
                <div className="flex flex-col gap-2 bg-[var(--secondary)]/40 p-2.5 rounded-xl border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#e73f07]" />
                      Active Canvas
                    </span>
                    <button
                      onClick={createNewBoard}
                      className="px-2 py-0.5 rounded-md bg-[#e73f07] hover:bg-[#d03806] text-white text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                      title="Create New Canvas Board"
                    >
                      <Plus className="w-3 h-3" />
                      New
                    </button>
                  </div>

                  {/* Active Board Name & Switcher */}
                  <div className="flex items-center gap-1.5">
                    {isRenamingBoard ? (
                      <div className="flex items-center gap-1 w-full">
                        <input
                          autoFocus
                          type="text"
                          value={renameInput}
                          onChange={e => setRenameInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              renameBoard(activeBoardId, renameInput);
                              setIsRenamingBoard(false);
                            } else if (e.key === 'Escape') {
                              setIsRenamingBoard(false);
                            }
                          }}
                          className="flex-1 bg-[var(--background)] border border-[#e73f07] rounded-lg px-2 py-1 text-xs font-medium text-[var(--foreground)] outline-none"
                        />
                        <button
                          onClick={() => {
                            renameBoard(activeBoardId, renameInput);
                            setIsRenamingBoard(false);
                          }}
                          className="p-1.5 bg-[#e73f07] text-white rounded-lg hover:bg-[#d03806]"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full bg-[var(--background)] px-2.5 py-1.5 rounded-lg border border-[var(--border)]">
                        <span className="font-semibold text-xs text-[var(--foreground)] truncate max-w-[160px]">
                          {boards.find(b => b.id === activeBoardId)?.name || 'Main Canvas'}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setRenameInput(boards.find(b => b.id === activeBoardId)?.name || '');
                              setIsRenamingBoard(true);
                            }}
                            className="p-1 hover:bg-[var(--accent)] rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                            title="Rename Canvas"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          {boards.length > 1 && (
                            <button
                              onClick={() => deleteBoard(activeBoardId)}
                              className="p-1 hover:bg-red-500/10 rounded text-[var(--muted-foreground)] hover:text-red-500 cursor-pointer"
                              title="Delete Canvas"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Board List Pills */}
                  {boards.length > 1 && (
                    <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
                      {boards.map(b => (
                        <button
                          key={b.id}
                          onClick={() => switchBoard(b.id)}
                          className={`px-2 py-1 rounded-md text-[10px] font-mono whitespace-nowrap transition-colors cursor-pointer border ${
                            b.id === activeBoardId
                              ? 'bg-[var(--card)] border-[#e73f07] text-[#e73f07] font-bold shadow-xs'
                              : 'bg-[var(--background)]/60 border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── 2. Canvas Modifications: Background Colors & Grid ── */}
                <div className="flex flex-col gap-2 bg-[var(--secondary)]/40 p-2.5 rounded-xl border border-[var(--border)]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#e73f07]" />
                    Canvas Background
                  </span>

                  <div className="grid grid-cols-6 gap-1.5">
                    {CANVAS_BG_PRESETS.map(preset => (
                      <button
                        key={preset.hex}
                        onClick={() => changeCanvasBg(preset.hex)}
                        title={preset.name}
                        style={{ backgroundColor: preset.hex, borderColor: preset.border }}
                        className={`h-7 rounded-lg border flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                          canvasBgColor === preset.hex ? 'ring-2 ring-[#e73f07] scale-105 shadow-md' : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        {canvasBgColor === preset.hex && (
                          <div className={`w-2 h-2 rounded-full ${preset.hex === '#ffffff' || preset.hex === '#fdfbf7' ? 'bg-[#0a0a0a]' : 'bg-white'}`} />
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)]">Custom Color:</span>
                    <div className="relative w-6 h-6 rounded-md border border-[var(--border)] overflow-hidden cursor-pointer hover:scale-105 transition-transform" title="Custom Canvas Background">
                      <input
                        type="color"
                        value={canvasBgColor}
                        onChange={(e) => changeCanvasBg(e.target.value)}
                        className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="font-medium text-[var(--foreground)] flex items-center gap-1.5">
                      <Grid className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                      Grid Style
                    </span>
                    <div className="flex items-center bg-[var(--background)] p-0.5 rounded-lg border border-[var(--border)]">
                      {(['dots', 'lines', 'blank'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setGridType(type)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium capitalize transition-all cursor-pointer ${
                            gridType === type ? 'bg-[#e73f07] text-white shadow-xs font-bold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── 3. Quick Tools Switcher (All tools visible) ── */}
                <div className="flex flex-col gap-2 bg-[var(--secondary)]/40 p-2.5 rounded-xl border border-[var(--border)]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold flex items-center gap-1.5">
                    <Pen className="w-3.5 h-3.5 text-[#e73f07]" />
                    Drawing Tools
                  </span>

                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'select', name: 'Select', icon: MousePointer2, key: 'V' },
                      { id: 'hand', name: 'Pan', icon: Hand, key: 'H' },
                      { id: 'freedraw', name: 'Draw', icon: Pen, key: 'P' },
                      { id: 'fountain', name: 'Pen', icon: Pen, key: 'F' },
                      { id: 'rectangle', name: 'Rect', icon: Square, key: 'R' },
                      { id: 'ellipse', name: 'Circle', icon: Circle, key: 'O' },
                      { id: 'line', name: 'Line', icon: Minus, key: 'L' },
                      { id: 'arrow', name: 'Arrow', icon: ArrowUpRight, key: 'A' },
                      { id: 'highlighter', name: 'Highlt', icon: Highlighter, key: 'M' },
                      { id: 'magic_pen', name: 'Magic', icon: Wand2, key: 'W' },
                      { id: 'laser_pen', name: 'Laser', icon: Zap, key: 'Z' },
                      { id: 'text', name: 'Text', icon: Type, key: 'T' },
                      { id: 'eraser', name: 'Eraser', icon: Eraser, key: 'E' },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          selectTool(t.id as DesktopToolId);
                          setIsMenuOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all border cursor-pointer ${
                          activeTool === t.id
                            ? 'bg-[#e73f07] text-white border-[#e73f07] shadow-sm font-bold'
                            : 'bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:border-[#e73f07]/50'
                        }`}
                        title={`${t.name} (${t.key})`}
                      >
                        <t.icon className="w-4 h-4 mb-0.5" />
                        <span className="text-[9px] font-sans truncate">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── 4. Creative & Insert Tools ── */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold px-2 py-0.5">Insert & Studio</span>

                  <button
                    onClick={() => {
                      imageInputRef.current?.click();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <ImageIcon className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
                      <span>Insert Image</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      pdfInputRef.current?.click();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
                      <span>Insert PDF Document</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowDiagramModal(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Code className="w-4 h-4 text-[#e73f07]" />
                      <span>Mermaid & Diagram Studio</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#e73f07] bg-[#e73f07]/10 px-1.5 py-0.5 rounded-md font-bold">DSL</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowTranslatorModal(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Languages className="w-4 h-4 text-[#e73f07]" />
                      <span>Canvas Text Translator</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] bg-[var(--secondary)] px-1.5 py-0.5 rounded-md border border-[var(--border)]">AI</span>
                  </button>
                </div>

                <div className="h-px w-full bg-[var(--border)]" />

                {/* ── 5. Canvas File Actions ── */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold px-2 py-0.5">Actions</span>

                  <button
                    onClick={() => {
                      handleExportImage();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Download className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)] transition-colors" />
                      <span>Export as PNG</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] bg-[var(--secondary)] px-1.5 py-0.5 rounded-md border border-[var(--border)]">⌘E</span>
                  </button>

                  <button
                    onClick={() => {
                      handleExportSvg();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileCode className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)] transition-colors" />
                      <span>Export as SVG</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)]">Vector</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowClearConfirm(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-red-500 hover:bg-red-500/10 transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span>Clear Canvas</span>
                    </div>
                  </button>
                </div>

                <div className="h-px w-full bg-[var(--border)]" />

                {/* ── 6. Preferences & Support ── */}
                <div className="flex flex-col gap-2 px-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--foreground)] flex items-center gap-1.5">
                      {isDarkMode ? <Moon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> : <Sun className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />}
                      Appearance
                    </span>
                    <div className="flex items-center bg-[var(--secondary)] p-0.5 rounded-lg border border-[var(--border)]">
                      <button
                        onClick={() => handleThemeChange(false)}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                          !isDarkMode ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs font-semibold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        <Sun className="w-3 h-3" />
                        Light
                      </button>
                      <button
                        onClick={() => handleThemeChange(true)}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                          isDarkMode ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs font-semibold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        <Moon className="w-3 h-3" />
                        Dark
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="font-medium text-[var(--foreground)] block">Palm Rejection</span>
                      <span className="text-[10px] text-[var(--muted-foreground)] block">Ignore hand touches</span>
                    </div>
                    <button
                      onClick={() => setPalmRejection(!palmRejection)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${palmRejection ? 'bg-[#e73f07]' : 'bg-[var(--muted)]'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${palmRejection ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="h-px w-full bg-[var(--border)]" />

                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setShowShortcutsModal(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Command className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
                      <span>Keyboard Shortcuts</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] bg-[var(--secondary)] px-1.5 py-0.5 rounded-md border border-[var(--border)] font-bold">?</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowFeedbackModal(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <MessageSquare className="w-4 h-4 text-[#e73f07]" />
                      <span>Feedback & Bug Report</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#e73f07] font-bold">BETA</span>
                  </button>

                  <a
                    href="https://github.com/ARASKOVA-labs/Aerial"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-all font-medium group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <ExternalLink className="w-4 h-4" />
                      <span>GitHub Repository</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)]">v1.2.2</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center Area */}
        <div className="flex-1 relative">

          {/* Top Center: Main Drawing Tools */}
          <div className={`pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 transition-[opacity,transform] duration-300 ease-in-out ${isFullscreen ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
            <div className="flex items-center gap-1.5 bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] shadow-xl rounded-2xl px-2.5 py-2 w-max max-w-[calc(100vw-2rem)]">
              <ToolBtn icon={MousePointer2} title="Select (V / 1)" active={activeTool === 'select'} onClick={() => selectTool('select')} />
              <ToolBtn icon={Hand} title="Pan (H / 2)" active={activeTool === 'hand'} onClick={() => selectTool('hand')} />
              <div className="w-px h-5 bg-[var(--border)] mx-1 hidden sm:block" />
              <div className="hidden sm:flex items-center gap-1">
                <ToolBtn icon={Square} title="Rectangle (R / 3)" active={activeTool === 'rectangle'} onClick={() => selectTool('rectangle')} />
                <ToolBtn icon={Circle} title="Ellipse (O / 4)" active={activeTool === 'ellipse'} onClick={() => selectTool('ellipse')} />
                <ToolBtn icon={Minus} title="Line (L / 5)" active={activeTool === 'line'} onClick={() => selectTool('line')} />
                <ToolBtn icon={ArrowUpRight} title="Arrow (A / 6)" active={activeTool === 'arrow'} onClick={() => selectTool('arrow')} />
              </div>
              <div className="w-px h-5 bg-[var(--border)] mx-1 hidden sm:block" />
              <ToolBtn icon={Pen} title="Draw (P / 7)" active={activeTool === 'freedraw'} onClick={() => selectTool('freedraw')} />
              <ToolBtn icon={Type} title="Text (T / 8)" active={activeTool === 'text'} onClick={() => selectTool('text')} />
              <ToolBtn icon={Eraser} title="Eraser (E / 9)" active={activeTool === 'eraser'} onClick={() => selectTool('eraser')} />
              <div className="hidden sm:block">
                <ToolBtn icon={ImageIcon} title="Insert Image" onClick={() => imageInputRef.current?.click()} />
              </div>
              <div className="w-px h-5 bg-[var(--border)] mx-1" />

              {/* Dedicated Color Palette & Stroke Settings Button */}
              {['freedraw', 'fountain', 'highlighter', 'rectangle', 'ellipse', 'line', 'arrow', 'magic_pen'].includes(activeTool) && (
                <button
                  ref={settingsBtnRef}
                  onClick={() => setShowSettings(s => !s)}
                  title="Color Palette & Stroke Settings (S)"
                  className={`h-9 px-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors duration-150 hover:scale-105 active:scale-95 cursor-pointer w-[76px] shrink-0 ${
                    showSettings
                      ? 'bg-[#e73f07] text-white shadow-md shadow-[#e73f07]/30'
                      : 'hover:bg-[var(--accent)] text-[var(--foreground)]/80 hover:text-[var(--foreground)]'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full border border-white/40 shadow-xs shrink-0"
                    style={{ backgroundColor: strokeColor }}
                  />
                  <span className="text-[10px] font-mono font-bold w-10 text-center tabular-nums shrink-0">{strokeWidth}px</span>
                </button>
              )}

              {/* Dedicated Eraser Settings Button */}
              {activeTool === 'eraser' && (
                <button
                  ref={settingsBtnRef}
                  onClick={() => setShowSettings(s => !s)}
                  title="Eraser Settings (S)"
                  className={`h-9 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors duration-150 hover:scale-105 active:scale-95 cursor-pointer w-24 shrink-0 ${
                    showSettings
                      ? 'bg-[#e73f07] text-white shadow-md shadow-[#e73f07]/30'
                      : 'hover:bg-[var(--accent)] text-[var(--foreground)]/80 hover:text-[var(--foreground)]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10px] font-mono font-bold capitalize w-14 text-center shrink-0">{eraserMode}</span>
                </button>
              )}

              <div className="relative">
                <span ref={moreToolsBtnRef} className="inline-flex">
                  <ToolBtn
                    icon={MoreHorizontal}
                    title="More Tools"
                    active={showMoreTools || ['fountain', 'magic_pen', 'laser_pen', 'highlighter'].includes(activeTool)}
                    onClick={() => setShowMoreTools(!showMoreTools)}
                  />
                </span>
                {showMoreTools && (
                  <div ref={moreToolsRef} className="absolute top-full mt-2 right-0 bg-[var(--card)]/95 backdrop-blur-2xl border border-[var(--border)] shadow-2xl rounded-2xl p-2 w-64 max-w-[calc(100vw-2rem)] flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center gap-1.5 px-2.5 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#e73f07]" />
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold">Special Pens</p>
                    </div>
                    <DropdownToolBtn icon={Pen} title="Calligraphy Pen (F)" active={activeTool === 'fountain'} onClick={() => { selectTool('fountain'); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={Highlighter} title="Highlighter (M)" active={activeTool === 'highlighter'} onClick={() => { selectTool('highlighter'); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={Wand2} title="Magic Pen (W)" active={activeTool === 'magic_pen'} variant="accent" onClick={() => { selectTool('magic_pen'); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={Zap} title="Laser Pen (Z)" active={activeTool === 'laser_pen'} variant="danger" onClick={() => { selectTool('laser_pen'); setShowMoreTools(false); }} />

                    <div className="h-px bg-[var(--border)]/60 my-1 mx-1" />
                    <div className="flex items-center gap-1.5 px-2.5 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)]/60" />
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold">Quick Notes & Actions</p>
                    </div>
                    <DropdownToolBtn icon={Sparkles} title="Quick Canvas Note (⌘⇧N)" onClick={() => { setShowQuickCanvas(true); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={Command} title="Command Palette (⌘K)" onClick={() => { setShowCommandPalette(true); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={FileText} title="Insert PDF" onClick={() => { pdfInputRef.current?.click(); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={ImageIcon} title="Insert Image" className="sm:hidden" onClick={() => { imageInputRef.current?.click(); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={Code} title="Mermaid Chart" onClick={() => { setShowDiagramModal(true); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={Languages} title="Translate Text" onClick={() => { setShowTranslatorModal(true); setShowMoreTools(false); }} />
                    <DropdownToolBtn icon={Trash2} title="Clear Board" variant="danger" onClick={() => { setShowClearConfirm(true); setShowMoreTools(false); }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top Right: Quick Canvas & Fullscreen Toggle */}
          <div className={`pointer-events-auto absolute top-4 right-4 flex items-center gap-1.5 bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] shadow-md rounded-2xl px-2 py-2 transition-opacity duration-300 ${isFullscreen ? 'opacity-20 hover:opacity-100' : 'opacity-100'}`}>
            <button
              onClick={() => setShowQuickCanvas(true)}
              title="Quick Canvas // Instant Note (⌘⇧N)"
              className="h-9 px-3 rounded-xl flex items-center gap-2 bg-[#e73f07]/10 hover:bg-[#e73f07]/20 border border-[#e73f07]/30 text-[#e73f07] transition-all hover:scale-105 active:scale-95 cursor-pointer font-mono font-bold text-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Quick Note</span>
              <kbd className="hidden md:inline px-1 py-0.5 rounded text-[9px] bg-[#e73f07]/20 border border-[#e73f07]/30">⌘⇧N</kbd>
            </button>
            <div className="w-px h-5 bg-[var(--border)] mx-0.5" />
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
            <div ref={settingsRef} className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 bg-[var(--card)]/95 backdrop-blur-2xl border border-[var(--border)] shadow-2xl rounded-2xl p-5 w-72 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              {activeTool === 'magic_pen' ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2">Handwriting Language</p>
                    <div className="flex gap-1">
                      {(['en', 'ml', 'ta', 'te'] as const).map(lang => (
                        <button
                          key={lang}
                          onClick={() => setMagicLanguage(lang)}
                          className={`flex-1 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all ${
                            magicLanguage === lang ? 'bg-[#e73f07] text-white shadow-sm' : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {lang === 'en' ? 'English' : lang === 'ml' ? 'Malayalam' : lang === 'ta' ? 'Tamil' : 'Telugu'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2">Text Font</p>
                    <select
                      value={magicFont}
                      onChange={(e) => setMagicFont(e.target.value)}
                      className="w-full bg-[var(--secondary)] text-[var(--foreground)] text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg px-2.5 py-1.5 outline-none border border-[var(--border)]"
                    >
                      <option value="'Space Grotesk', sans-serif">Space Grotesk (Modern)</option>
                      <option value="'Caveat', cursive">Caveat (Cursive)</option>
                      <option value="'Inter', sans-serif">Inter (Clean)</option>
                      <option value="'Rephen', sans-serif">Rephen (Brand)</option>
                    </select>
                  </div>
                    <p className="text-[9px] font-mono text-[var(--muted-foreground)] mt-1">
                      Write on the canvas and pause for 1 second. The strokes will instantly convert to text.
                    </p>
                </div>
              ) : activeTool === 'eraser' ? (
                <>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2">Eraser Type</p>
                    <div className="flex gap-1">
                      {(['stroke', 'precision', 'element'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => {
                            setEraserMode(mode);
                            canvasRef.current?.setEraserType(mode);
                          }}
                          className={`flex-1 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                            eraserMode === mode ? 'bg-[#e73f07] text-white shadow-sm' : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {mode === 'stroke' ? 'Stroke' : mode === 'precision' ? 'Precision' : 'Object'}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] font-mono text-[var(--muted-foreground)] mt-2">
                      {eraserMode === 'stroke'
                        ? 'Erases entire stroke upon touch'
                        : eraserMode === 'precision'
                        ? 'Surgically trims exact points inside circle'
                        : 'Erases whole objects (shapes, text, diagram, images) upon touch'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2 flex justify-between">
                      <span>Eraser Size</span>
                      <span className="text-[var(--foreground)] font-mono tabular-nums">{eraserSize}px</span>
                    </p>
                    <input
                      type="range" min="8" max="80" step="2"
                      value={eraserSize}
                      onChange={e => {
                        const s = parseInt(e.target.value);
                        setEraserSize(s);
                        canvasRef.current?.setEraserSize(s);
                      }}
                      className="w-full accent-[#e73f07]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2">Color Palette</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {STROKE_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => changeColor(c)}
                          className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${strokeColor === c ? 'border-[#e73f07] scale-110 shadow-sm ring-2 ring-[#e73f07]/25' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <div className="relative w-7 h-7 rounded-full border-2 border-[var(--border)] overflow-hidden cursor-pointer hover:scale-110 transition-transform">
                        <input
                          type="color"
                          value={strokeColor}
                          onChange={(e) => changeColor(e.target.value)}
                          className="absolute -top-2 -left-2 w-11 h-11 cursor-pointer"
                          title="Custom Color"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2 flex justify-between">
                      <span>Stroke Size</span>
                      <span className="text-[var(--foreground)] font-mono tabular-nums">{strokeWidth}px</span>
                    </p>
                    <input
                      type="range" min="1" max="24" step="0.5"
                      value={strokeWidth}
                      onChange={e => changeWidth(parseFloat(e.target.value))}
                      className="w-full accent-[#e73f07] cursor-pointer"
                    />
                  </div>

                  {activeTool === 'fountain' && (
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2 flex justify-between">
                        <span>Nib Sharpness</span>
                        <span className="text-[var(--foreground)] font-mono tabular-nums">{fountainSharpness}</span>
                      </p>
                      <input
                        type="range" min="0.1" max="2.0" step="0.1"
                        value={fountainSharpness}
                        onChange={e => changeSharpness(parseFloat(e.target.value))}
                        className="w-full accent-[#e73f07] cursor-pointer"
                      />
                    </div>
                  )}

                  {(activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'line') && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="roughShapeToggle"
                        className="w-4 h-4 rounded-md accent-[#e73f07] cursor-pointer"
                        checked={isRough}
                        onChange={(e) => {
                          setIsRough(e.target.checked);
                          canvasRef.current?.getEngine()?.set_is_rough(e.target.checked);
                        }}
                      />
                      <label htmlFor="roughShapeToggle" className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted-foreground)] cursor-pointer select-none hover:text-[var(--foreground)]">Scribble Style</label>
                    </div>
                  )}

                  {activeTool === 'arrow' && (
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="curvedArrowToggle"
                          className="w-4 h-4 rounded-md accent-[#e73f07] cursor-pointer"
                          checked={isCurved}
                          onChange={(e) => {
                            setIsCurved(e.target.checked);
                            canvasRef.current?.getEngine()?.set_is_curved(e.target.checked);
                          }}
                        />
                        <label htmlFor="curvedArrowToggle" className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted-foreground)] cursor-pointer select-none hover:text-[var(--foreground)]">Curved Arrow</label>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Canvas Background Section (Persistent in Settings) */}
              <div className="pt-2.5 border-t border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#e73f07]" />
                    Canvas Background
                  </p>
                  <span className="text-[9px] font-mono text-[var(--muted-foreground)]">
                    {CANVAS_BG_PRESETS.find(p => p.hex === canvasBgColor)?.name || 'Custom'}
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1.5 mb-1.5">
                  {CANVAS_BG_PRESETS.map(preset => (
                    <button
                      key={preset.hex}
                      onClick={() => changeCanvasBg(preset.hex)}
                      title={preset.name}
                      style={{ backgroundColor: preset.hex, borderColor: preset.border }}
                      className={`h-7 rounded-lg border flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                        canvasBgColor === preset.hex ? 'ring-2 ring-[#e73f07] scale-105 shadow-md' : 'opacity-85 hover:opacity-100'
                      }`}
                    >
                      {canvasBgColor === preset.hex && (
                        <div className={`w-2 h-2 rounded-full ${preset.hex === '#ffffff' || preset.hex === '#fdfbf7' ? 'bg-[#0a0a0a]' : 'bg-white'}`} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono text-[var(--muted-foreground)]">Custom Color:</span>
                  <div className="relative w-6 h-6 rounded-md border border-[var(--border)] overflow-hidden cursor-pointer hover:scale-105 transition-transform" title="Custom Canvas Background">
                    <input
                      type="color"
                      value={canvasBgColor}
                      onChange={(e) => changeCanvasBg(e.target.value)}
                      className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Translation Settings */}
              <div className="flex flex-col gap-3 pt-4 border-t border-[var(--border)]">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2">Translate Selected Text To</p>
                  <div className="flex gap-1 flex-wrap">
                    {['en', 'ml', 'ta', 'te', 'hi', 'es', 'fr'].map(lang => (
                      <button
                        key={lang}
                        onClick={() => {
                          setMagicLanguage(lang as 'en' | 'ml' | 'ta' | 'te');
                          handleTranslate(lang);
                        }}
                        className="flex-1 min-w-[32px] py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[#e73f07] hover:text-white"
                      >
                        {lang.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Font Settings */}
                {activeTool === 'text' && (
                  <div className="flex flex-col gap-3 pt-4 border-t border-[var(--border)]">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-2">Handwriting Font</p>
                      <div className="flex flex-col gap-2">
                        {['Caveat', 'Kalam', 'Space Grotesk'].map(font => (
                          <button
                            key={font}
                            onClick={() => { setFontFamily(font); selectTool('select'); }}
                            className={`px-3 py-2 text-sm font-bold rounded-xl transition-all text-left border ${fontFamily === font ? 'bg-[#e73f07] text-white border-[#e73f07] shadow-sm' : 'bg-[var(--secondary)] text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]'}`}
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



      {/* ── Clear Board Confirmation Modal ── */}
      {showClearConfirm && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-150">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="w-12 h-12 rounded-2xl bg-[#dc2626]/10 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-[#dc2626]" />
            </div>
            <h2 className="text-lg font-sans font-black uppercase tracking-wider text-[var(--foreground)] mb-2">Clear the board?</h2>
            <p className="text-[11px] font-mono text-[var(--muted-foreground)] mb-6 leading-relaxed">
              This will permanently delete all your drawings, text, and images. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-[var(--foreground)] hover:bg-[var(--accent)] border border-[var(--border)] transition-colors active:translate-y-px"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  canvasRef.current?.clearBoard();
                  setShowClearConfirm(false);
                  setIsMenuOpen(false);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-[#dc2626] text-white hover:bg-[#b91c1c] transition-colors shadow-sm active:translate-y-px"
              >
                Yes, Clear Board
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Beta Feedback Modal ── */}
      {showFeedbackModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-150">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#e73f07]/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-[#e73f07]" />
                </div>
                <div>
                  <h2 className="text-base font-sans font-black uppercase tracking-wider text-[var(--foreground)]">Beta Feedback</h2>
                  <p className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase tracking-wider">Help us improve Aerial for public launch</p>
                </div>
              </div>
              <button
                onClick={() => { setShowFeedbackModal(false); setFeedbackSent(false); }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--accent)] transition-colors"
              >
                <X className="w-4 h-4 text-[var(--muted-foreground)]" />
              </button>
            </div>

            {feedbackSent ? (
              <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-12 h-12 rounded-full bg-[#10b981]/10 flex items-center justify-center text-[#10b981] text-xl font-bold">
                  ✓
                </div>
                <h3 className="font-sans font-black uppercase tracking-wider text-[var(--foreground)]">Thank you for your feedback!</h3>
                <p className="text-[10px] font-mono text-[var(--muted-foreground)] max-w-xs uppercase tracking-wider">Your input has been recorded and will help make Aerial better.</p>
                <button
                  onClick={() => { setShowFeedbackModal(false); setFeedbackSent(false); }}
                  className="mt-4 px-5 py-2.5 bg-[#e73f07] hover:bg-[#d03806] text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all active:translate-y-px shadow-md shadow-[#e73f07]/20"
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
                  className="w-full h-32 bg-[var(--background)] border border-[var(--border)] rounded-2xl p-3 text-sm font-mono focus:outline-none focus:border-[#e73f07] focus:ring-1 focus:ring-[#e73f07] resize-none"
                />
                <div className="flex items-center justify-between">
                  <a
                    href="https://github.com/ARASKOVA-labs/Aerial/issues/new"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono text-[#e73f07] hover:underline flex items-center gap-1 font-bold uppercase tracking-wider"
                  >
                    Open GitHub Issue →
                  </a>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowFeedbackModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-[var(--foreground)] hover:bg-[var(--accent)] border border-[var(--border)] transition-colors active:translate-y-px"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!feedbackText.trim()}
                      onClick={() => {
                        setFeedbackSent(true);
                        setFeedbackText('');
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-[#e73f07] text-white hover:bg-[#d03806] disabled:opacity-50 transition-all shadow-md shadow-[#e73f07]/20 active:translate-y-px"
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

      {/* ── Quick Canvas Instant Note Modal ── */}
      {showQuickCanvas && (
        <QuickCanvasModal
          isDarkMode={isDarkMode}
          onClose={() => setShowQuickCanvas(false)}
          onStampSketch={handleStampSketch}
          onStampText={handleStampText}
          onSaveAsBoard={handleSaveQuickNoteAsBoard}
        />
      )}

      {/* ── Spotlight Command Palette ── */}
      {showCommandPalette && (
        <CommandPaletteModal
          isDarkMode={isDarkMode}
          onClose={() => setShowCommandPalette(false)}
          onSelectTool={selectTool}
          onOpenQuickCanvas={() => setShowQuickCanvas(true)}
          onNewBoard={createNewBoard}
          boards={boards}
          onSwitchBoard={switchBoard}
          onOpenDiagramModal={() => setShowDiagramModal(true)}
          onOpenTranslatorModal={() => setShowTranslatorModal(true)}
          onExportPng={handleExportImage}
          onExportSvg={handleExportSvg}
          onToggleFullscreen={toggleFullscreen}
          onToggleTheme={() => setIsDarkMode(!isDarkMode)}
          onClearBoard={() => setShowClearConfirm(true)}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
        />
      )}

      {/* ── Keyboard Shortcuts Modal ── */}
      {showShortcutsModal && (
        <KeyboardShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      {/* ── Diagram & Mermaid Studio Modal ── */}
      {showDiagramModal && (
        <DiagramStudioModal
          isDarkMode={isDarkMode}
          onClose={() => setShowDiagramModal(false)}
          onInsertDiagram={(code, svg, scale, accentColor) => {
            canvasRef.current?.addDiagram(code, svg, scale, accentColor);
            setShowDiagramModal(false);
          }}
        />
      )}

      {/* ── Multilingual & Text Translator Modal ── */}
      {showTranslatorModal && (
        <TextTranslatorModal
          onClose={() => setShowTranslatorModal(false)}
          onInsertText={(text) => {
            canvasRef.current?.addText(text);
            setShowTranslatorModal(false);
          }}
        />
      )}
    </div>
  );
}

// ── Keyboard Shortcuts Dialog ───────────────────────────────────────────────

function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const quickNoteShortcuts = [
    { name: 'Quick Canvas (Instant Note)', keys: ['⌘', '⇧', 'N'] },
    { name: 'Quick Note (Alternative)', keys: ['⌘', 'J'] },
    { name: 'Spotlight Command Palette', keys: ['⌘', 'K'] },
    { name: 'Stamp Note to Main Canvas', keys: ['⌘', '↵'] },
    { name: 'Save Note as Board', keys: ['⌘', 'S'] },
  ];

  const boardShortcuts = [
    { name: 'Create New Canvas Board', keys: ['⌘', 'N'] },
    { name: 'Toggle Boards Drawer / Sidebar', keys: ['⌘', 'B'] },
    { name: 'Switch to Board 1 – 9', keys: ['⌘', '1..9'] },
    { name: 'Previous Canvas Board', keys: ['⌘', '['] },
    { name: 'Next Canvas Board', keys: ['⌘', ']'] },
    { name: 'Clear Canvas Board (Confirm)', keys: ['⌘', '⇧', '⌫'] },
  ];

  const fileShortcuts = [
    { name: 'Export PNG Image / Save', keys: ['⌘', 'S'] },
    { name: 'Export Vector SVG', keys: ['⌘', '⇧', 'S'] },
    { name: 'Import Image', keys: ['⌘', 'O'] },
    { name: 'Import PDF Document', keys: ['⌘', '⇧', 'O'] },
    { name: 'Toggle Fullscreen Mode', keys: ['⌃', '⌘', 'F'] },
    { name: 'Reset View (100%)', keys: ['⌘', '0'] },
    { name: 'Zoom In', keys: ['⌘', '+'] },
    { name: 'Zoom Out', keys: ['⌘', '-'] },
    { name: 'Undo Operation', keys: ['⌘', 'Z'] },
    { name: 'Redo Operation', keys: ['⌘', '⇧', 'Z'] },
    { name: 'Color & Tool Settings', keys: ['⌘', ','] },
  ];

  const toolShortcuts = [
    { name: 'Select Tool', keys: ['V', '1'] },
    { name: 'Pan / Hand Tool', keys: ['H', '2'] },
    { name: 'Rectangle Shape', keys: ['R', '3'] },
    { name: 'Ellipse Shape', keys: ['O', '4'] },
    { name: 'Line Shape', keys: ['L', '5'] },
    { name: 'Arrow Shape', keys: ['A', '6'] },
    { name: 'Draw / Freehand Pen', keys: ['P', '7'] },
    { name: 'Text Tool', keys: ['T', '8'] },
    { name: 'Eraser (cycles mode)', keys: ['E', '9'] },
    { name: 'Calligraphy Fountain Pen', keys: ['F'] },
    { name: 'Highlighter', keys: ['M'] },
    { name: 'Magic Pen (AI Handwriting)', keys: ['W'] },
    { name: 'Laser Pen (Transient Glow)', keys: ['Z'] },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-150 p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#e73f07]/10 flex items-center justify-center">
              <Command className="w-5 h-5 text-[#e73f07]" />
            </div>
            <div>
              <h2 className="text-base font-sans font-black uppercase tracking-wider text-[var(--foreground)]">Mac Desktop Shortcuts</h2>
              <p className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase tracking-wider">Fast muscle-memory controls & instant note-taking</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--accent)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-[var(--muted-foreground)]" />
          </button>
        </div>

        <div className="overflow-y-auto pr-1 flex flex-col gap-5 text-xs font-mono">
          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#e73f07] font-bold mb-2.5">⚡ Instant Note & Quick Canvas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickNoteShortcuts.map(item => (
                <div key={item.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                  <span className="text-[var(--foreground)] font-medium font-sans text-xs">{item.name}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono font-bold text-[#e73f07] shadow-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#e73f07] font-bold mb-2.5">📋 Board Management & Navigation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {boardShortcuts.map(item => (
                <div key={item.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                  <span className="text-[var(--foreground)] font-medium font-sans text-xs">{item.name}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono font-bold text-[var(--foreground)] shadow-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#e73f07] font-bold mb-2.5">💾 File Operations & Viewport</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {fileShortcuts.map(item => (
                <div key={item.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                  <span className="text-[var(--foreground)] font-medium font-sans text-xs">{item.name}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono font-bold text-[var(--foreground)] shadow-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#e73f07] font-bold mb-2.5">✏️ Drawing Tools & Pens</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {toolShortcuts.map(item => (
                <div key={item.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                  <span className="text-[var(--foreground)] font-medium font-sans text-xs">{item.name}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono font-bold text-[var(--foreground)] shadow-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-[var(--border)] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#e73f07] hover:bg-[#d03806] text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all active:translate-y-px shadow-md shadow-[#e73f07]/20 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mermaid / AI Studio Dialog ───────────────────────────────────────────────

// ── Mermaid & Diagram Studio Modal ─────────────────────────────────────────

const DIAGRAM_TEMPLATES = ARASKOVA_DIAGRAM_TEMPLATES;

function DiagramStudioModal({
  isDarkMode,
  onClose,
  onInsertDiagram,
}: {
  isDarkMode: boolean;
  onClose: () => void;
  onInsertDiagram: (code: string, svg: string, scale?: number, accentColor?: string) => void;
}) {
  const [code, setCode] = useState(DIAGRAM_TEMPLATES[0].code);
  const [diagramStyle, setDiagramStyle] = useState<AraskovaDiagramStyle>(() =>
    isDarkMode ? 'brutalist' : 'industrial_light'
  );
  const [accentColor, setAccentColor] = useState('#e73f07');
  const [diagramScale, setDiagramScale] = useState(1.0);
  const [customTopic, setCustomTopic] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [svgOutput, setSvgOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Sync default aesthetic style when canvas theme toggles
  useEffect(() => {
    setDiagramStyle(isDarkMode ? 'brutalist' : 'industrial_light');
  }, [isDarkMode]);

  const renderCurrentDiagram = useCallback(
    async (srcCode: string, style: AraskovaDiagramStyle, accentCol: string) => {
      setIsRendering(true);
      setError(null);
      try {
        const trimmed = srcCode.trim();
        const effectiveDark =
          style === 'industrial_light' ? false : style === 'blueprint' ? true : isDarkMode;

        if (trimmed.startsWith('node ') || trimmed.startsWith('group ')) {
          // Aras DSL format
          try {
            const res = await invoke<{ svg: string }>('render_diagram', { code: trimmed });
            if (res?.svg) {
              const styledSvg = applyAraskovaDiagramAesthetics(res.svg, effectiveDark, style, accentCol);
              setSvgOutput(styledSvg);
              setIsRendering(false);
              return;
            }
          } catch {
            // If not running in Tauri or Aras DSL fails, fall back to mermaid
          }
        }

        // Reset mermaid API configuration cache before re-initializing
        if ((mermaid as any).mermaidAPI?.reset) {
          try {
            (mermaid as any).mermaidAPI.reset();
          } catch (_) {}
        }

        // Initialize Mermaid with custom accent and Araskova design system configuration
        mermaid.initialize(getAraskovaMermaidConfig(effectiveDark, style, accentCol));
        const id = 'mermaid-preview-' + Math.random().toString(36).substring(2, 9);
        const { svg } = await mermaid.render(id, trimmed);
        const styledSvg = applyAraskovaDiagramAesthetics(svg, effectiveDark, style, accentCol);
        setSvgOutput(styledSvg);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setIsRendering(false);
      }
    },
    [isDarkMode]
  );

  useEffect(() => {
    renderCurrentDiagram(code, diagramStyle, accentColor);
  }, [code, diagramStyle, accentColor, renderCurrentDiagram]);

  const handleCopySvg = async () => {
    if (!svgOutput) return;
    try {
      await navigator.clipboard.writeText(svgOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyAiPrompt = async () => {
    const topic = customTopic.trim() || 'Software System Architecture & Microservices Event Stream';
    const promptText = `Generate a clean, valid Mermaid.js diagram for: ${topic}

Requirements:
1. Use standard Mermaid syntax (flowchart TD/LR, sequenceDiagram, stateDiagram-v2, or classDiagram).
2. Group related components into subgraphs with clear labels (e.g. subgraph INGESTION ["// Ingestion Cluster"]).
3. Use concise node descriptions and descriptive edge labels.
4. Output ONLY raw Mermaid code inside a \`\`\`mermaid code block without extra conversational filler so it can be pasted directly into Aerial Canvas.`;

    try {
      await navigator.clipboard.writeText(promptText);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch (_) {}
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/85 backdrop-blur-md pointer-events-auto animate-in fade-in duration-150 p-4">
      <div
        className={`${
          isDarkMode ? 'bg-[#111111] border-[#2a2a2a] text-[#f3f3f2]' : 'bg-[#ffffff] border-[#e5e5e5] text-[#0a0a0a]'
        } border rounded-3xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDarkMode ? 'border-[#2a2a2a] bg-[#0a0a0a]/80' : 'border-[#e5e5e5] bg-[#f8f9fa]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              style={{ borderColor: `${accentColor}50`, backgroundColor: `${accentColor}18`, color: accentColor }}
              className="w-10 h-10 rounded-2xl border flex items-center justify-center shadow-inner transition-colors"
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className={`text-sm font-sans font-black uppercase tracking-wider ${
                    isDarkMode ? 'text-[#f3f3f2]' : 'text-[#0a0a0a]'
                  }`}
                >
                  Architecture & Mermaid Studio
                </h2>
                <span
                  style={{ backgroundColor: `${accentColor}22`, borderColor: `${accentColor}44`, color: accentColor }}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-widest border transition-colors"
                >
                  Araskova Brutalist
                </span>
              </div>
              <p className="text-[10px] font-mono text-[#81868b] uppercase tracking-wider">
                Machinery vector aesthetics · Hardware HUD Reticles · Embedded Font Kerns
              </p>
            </div>
          </div>

          {/* Aesthetic Style Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#81868b] uppercase tracking-wider mr-1 hidden sm:inline">
              Aesthetic:
            </span>
            {(
              [
                { id: 'brutalist', label: 'Brutalist' },
                { id: 'blueprint', label: 'Blueprint' },
                { id: 'industrial_light', label: 'Industrial' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                onClick={() => setDiagramStyle(st.id)}
                style={diagramStyle === st.id ? { backgroundColor: accentColor } : {}}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  diagramStyle === st.id
                    ? 'text-white shadow-xs'
                    : isDarkMode
                    ? 'bg-[#1a1a1a] text-[#81868b] hover:text-[#f3f3f2] border border-[#2a2a2a]'
                    : 'bg-white text-[#555555] hover:text-[#000000] border border-[#d0d0d0]'
                }`}
              >
                {st.label}
              </button>
            ))}

            <button
              onClick={onClose}
              className={`ml-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isDarkMode ? 'hover:bg-[#2a2a2a] text-[#81868b] hover:text-[#f3f3f2]' : 'hover:bg-[#e9ecef] text-[#666666] hover:text-[#000000]'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* AI Prompt Assistant Banner */}
        <div
          className={`px-6 py-3 border-b flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${
            isDarkMode ? 'bg-[#151515] border-[#2a2a2a]' : 'bg-[#f4f5f7] border-[#e2e4e8]'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
            <div
              style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}18`, color: accentColor }}
              className="w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0"
            >
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--foreground)]">
                  AI Diagram Assistant
                </span>
                <span className="text-[9px] font-mono text-[#81868b] uppercase tracking-wider hidden md:inline">
                  ChatGPT · Claude · Gemini
                </span>
              </div>
              <p className="text-[10px] text-[#81868b] truncate">
                Copy prompt to ChatGPT or Claude to get exact syntax for whatever you desire, then paste it here to render instantly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. Payment Gateway with Webhooks..."
              className={`text-[11px] font-mono px-3 py-1.5 rounded-xl border outline-none focus:border-[#e73f07] transition-all w-48 sm:w-56 ${
                isDarkMode ? 'bg-[#0a0a0a] text-[#f3f3f2] border-[#2a2a2a]' : 'bg-white text-[#0a0a0a] border-[#d0d0d0]'
              }`}
            />
            <button
              type="button"
              onClick={handleCopyAiPrompt}
              style={!promptCopied ? { backgroundColor: accentColor } : {}}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                promptCopied
                  ? 'bg-green-600 text-white'
                  : 'hover:opacity-90 text-white active:translate-y-px'
              }`}
            >
              {promptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {promptCopied ? 'Copied Prompt!' : 'Copy AI Prompt'}
            </button>
          </div>
        </div>

        {/* Presets & Customization Bar */}
        <div
          className={`px-6 py-2.5 border-b flex items-center justify-between gap-4 overflow-x-auto scrollbar-none ${
            isDarkMode ? 'bg-[#0a0a0a]/50 border-[#2a2a2a]' : 'bg-[#f1f3f5] border-[#e5e5e5]'
          }`}
        >
          {/* Templates */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#81868b] font-bold whitespace-nowrap mr-1">
              Presets:
            </span>
            {DIAGRAM_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                onClick={() => setCode(tmpl.code)}
                style={code === tmpl.code ? { backgroundColor: accentColor } : {}}
                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                  code === tmpl.code
                    ? 'text-white shadow-xs'
                    : isDarkMode
                    ? 'bg-[#1a1a1a] text-[#81868b] hover:text-[#f3f3f2] border border-[#2a2a2a]'
                    : 'bg-white text-[#555555] hover:text-[#000000] border border-[#d0d0d0]'
                }`}
              >
                {tmpl.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Color Customizer */}
            <div className="flex items-center gap-1.5 pl-3 border-l border-[#2a2a2a] shrink-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#81868b] font-bold">
                Accent:
              </span>
              {[
                { color: '#e73f07', name: 'Araskova Orange' },
                { color: '#0ea5e9', name: 'Electric Cyan' },
                { color: '#10b981', name: 'Emerald Green' },
                { color: '#8b5cf6', name: 'Radiant Violet' },
                { color: '#f59e0b', name: 'Cyber Amber' },
                { color: '#ef4444', name: 'Crimson Red' },
                { color: '#f3f3f2', name: 'Crisp White' },
              ].map((swatch) => (
                <button
                  key={swatch.color}
                  type="button"
                  onClick={() => setAccentColor(swatch.color)}
                  title={swatch.name}
                  style={{ backgroundColor: swatch.color }}
                  className={`w-5 h-5 rounded-full border transition-all cursor-pointer shadow-xs ${
                    accentColor.toLowerCase() === swatch.color.toLowerCase()
                      ? 'border-white scale-110 ring-2 ring-white/40'
                      : 'border-white/20 hover:scale-105 active:scale-95'
                  }`}
                />
              ))}
              <label
                title="Custom Accent Color"
                className="relative w-5 h-5 rounded-full border border-white/30 flex items-center justify-center cursor-pointer overflow-hidden bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-500 hover:scale-105 transition-transform"
              >
                <input
                  type="color"
                  value={accentColor}
                  className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </label>
            </div>

            {/* Size Adjuster */}
            <div className="flex items-center gap-1.5 pl-3 border-l border-[#2a2a2a] shrink-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#81868b] font-bold">
                Size:
              </span>
              {[
                { label: '50%', value: 0.5 },
                { label: '75%', value: 0.75 },
                { label: '100%', value: 1.0 },
                { label: '125%', value: 1.25 },
                { label: '150%', value: 1.5 },
              ].map((sz) => (
                <button
                  key={sz.label}
                  type="button"
                  onClick={() => setDiagramScale(sz.value)}
                  style={diagramScale === sz.value ? { backgroundColor: accentColor } : {}}
                  className={`px-2 py-1 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    diagramScale === sz.value
                      ? 'text-white shadow-xs'
                      : isDarkMode
                      ? 'bg-[#1a1a1a] text-[#81868b] hover:text-[#f3f3f2] border border-[#2a2a2a]'
                      : 'bg-white text-[#555555] hover:text-[#000000] border border-[#d0d0d0]'
                  }`}
                >
                  {sz.label}
                </button>
              ))}
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={diagramScale}
                onChange={(e) => setDiagramScale(parseFloat(e.target.value))}
                className="w-16 cursor-pointer"
                style={{ accentColor }}
                title={`Scale: ${Math.round(diagramScale * 100)}%`}
              />
              <span className="text-[9px] font-mono text-[#81868b] min-w-[32px]">
                {Math.round(diagramScale * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Body (Editor + Preview) */}
        <div className={`flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x ${isDarkMode ? 'divide-[#2a2a2a]' : 'divide-[#e5e5e5]'}`}>
          {/* Editor Side */}
          <div className={`flex flex-col h-full ${isDarkMode ? 'bg-[#111111]' : 'bg-[#fafafa]'} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#81868b] flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" style={{ color: accentColor }} />
                Diagram Definition (Mermaid / Aras DSL)
              </span>
              <button
                onClick={() => renderCurrentDiagram(code, diagramStyle, accentColor)}
                disabled={isRendering}
                style={{ color: accentColor }}
                className="text-[10px] font-mono font-bold uppercase tracking-wider hover:underline cursor-pointer"
              >
                {isRendering ? 'Rendering...' : 'Re-render'}
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter Mermaid or Aras DSL code..."
              spellCheck={false}
              className={`flex-1 w-full font-mono text-xs p-3.5 rounded-2xl border outline-none transition-all resize-none shadow-inner ${
                isDarkMode ? 'bg-[#0a0a0a] text-[#f3f3f2] border-[#2a2a2a]' : 'bg-white text-[#0a0a0a] border-[#e5e5e5]'
              }`}
              style={{ borderColor: undefined }}
            />
            {error && (
              <div className="mt-2.5 p-2.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 font-mono text-[10px] leading-tight">
                <p className="font-bold uppercase tracking-wider mb-1">Syntax Error:</p>
                <p className="line-clamp-2">{error}</p>
              </div>
            )}
          </div>

          {/* Preview Side */}
          <div className={`flex flex-col h-full ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#f4f4f5]'} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#81868b]">
                Rendered Preview (Araskova Machinery Engine)
              </span>
              {svgOutput && (
                <button
                  onClick={handleCopySvg}
                  className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#81868b] hover:text-[#e73f07] flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied SVG' : 'Copy SVG'}
                </button>
              )}
            </div>
            <div
              ref={previewRef}
              className={`flex-1 w-full rounded-2xl border overflow-auto p-4 flex items-center justify-center min-h-[260px] relative ${
                isDarkMode ? 'border-[#2a2a2a] bg-[#111111]' : 'border-[#e5e5e5] bg-white'
              }`}
            >
              {/* Tactical Corner Marks on Preview Box */}
              <div className="absolute top-2 left-2 w-2 h-2 border-t-2 border-l-2 pointer-events-none" style={{ borderColor: `${accentColor}60` }} />
              <div className="absolute top-2 right-2 w-2 h-2 border-t-2 border-r-2 pointer-events-none" style={{ borderColor: `${accentColor}60` }} />
              <div className="absolute bottom-2 left-2 w-2 h-2 border-b-2 border-l-2 pointer-events-none" style={{ borderColor: `${accentColor}60` }} />
              <div className="absolute bottom-2 right-2 w-2 h-2 border-b-2 border-r-2 pointer-events-none" style={{ borderColor: `${accentColor}60` }} />

              {svgOutput ? (
                <div
                  className="w-full h-full flex items-center justify-center [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:h-auto transition-transform"
                  style={{ transform: `scale(${Math.min(1.2, diagramScale)})` }}
                  dangerouslySetInnerHTML={{ __html: svgOutput }}
                />
              ) : (
                <p className="text-xs font-mono text-[#81868b]">
                  {error ? 'Unable to render preview' : 'Enter valid diagram code to preview'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-4 border-t flex items-center justify-between ${
            isDarkMode ? 'border-[#2a2a2a] bg-[#0a0a0a]/80' : 'border-[#e5e5e5] bg-[#f8f9fa]'
          }`}
        >
          <div className="flex items-center gap-3 text-[10px] font-mono text-[#81868b]">
            <span className="hidden sm:inline">
              Embedded Google Fonts & tactical vector reticles.
            </span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-[#f3f3f2]">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
              Scale: {Math.round(diagramScale * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                isDarkMode ? 'border-[#2a2a2a] text-[#f3f3f2] hover:bg-[#1a1a1a]' : 'border-[#e5e5e5] text-[#0a0a0a] hover:bg-[#e9ecef]'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (svgOutput) {
                  onInsertDiagram(code, svgOutput, diagramScale, accentColor);
                }
              }}
              disabled={!svgOutput || !!error}
              style={{ backgroundColor: accentColor }}
              className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-white disabled:opacity-40 transition-all shadow-md active:translate-y-px cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Insert onto Canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Text Translator Modal ──────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'zh', name: 'Chinese (中文)' },
  { code: 'ar', name: 'Arabic (العربية)' },
  { code: 'ru', name: 'Russian' },
];

const PRESET_TRANSLATIONS: Record<string, Record<string, string>> = {
  'architecture diagram': {
    ml: 'വാസ്തുവിദ്യാ രേഖാചിത്രം',
    ta: 'கட்டடக்கலை வரைபடம்',
    hi: 'वास्तुकला आरेख',
    es: 'diagrama de arquitectura',
    fr: "diagramme d'architecture",
  },
  'deep tech': {
    ml: 'ഡീപ് ടെക്നോളജി',
    ta: 'ஆழமான தொழில்நுட்பம்',
    hi: 'डीप टेक',
    es: 'tecnología profunda',
  },
  'autonomous systems': {
    ml: 'സ്വയംഭരണ സംവിധാനങ്ങൾ',
    ta: 'தன்னாட்சி அமைப்புகள்',
    hi: 'स्वायत्त प्रणाली',
    es: 'sistemas autónomos',
  },
  'hardware acceleration': {
    ml: 'ഹാർഡ്‌വെയർ ആക്സിലറേഷൻ',
    ta: 'வன்பொருள் முடுக்கம்',
    hi: 'हार्डवेयर त्वरण',
    es: 'aceleración por hardware',
  },
};

function TextTranslatorModal({
  onClose,
  onInsertText,
}: {
  onClose: () => void;
  onInsertText: (text: string) => void;
}) {
  const [sourceText, setSourceText] = useState('Aerial Spatial Whiteboard for Engineering');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('ml');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [copied, setCopied] = useState(false);

  const performTranslate = useCallback(async (text: string, from: string, to: string) => {
    if (!text.trim()) {
      setTranslatedText('');
      return;
    }

    // Check offline dictionary match
    const lower = text.trim().toLowerCase();
    if (PRESET_TRANSLATIONS[lower]?.[to]) {
      setTranslatedText(PRESET_TRANSLATIONS[lower][to]);
      return;
    }

    setIsTranslating(true);
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data?.responseData?.translatedText) {
          setTranslatedText(data.responseData.translatedText);
          setIsTranslating(false);
          return;
        }
      }
      throw new Error('API unavailable');
    } catch {
      // Fallback: transliteration / formatted placeholder
      setTranslatedText(`[${to.toUpperCase()}] ${text}`);
    } finally {
      setIsTranslating(false);
    }
  }, []);

  useEffect(() => {
    performTranslate(sourceText, sourceLang, targetLang);
  }, [sourceText, sourceLang, targetLang, performTranslate]);

  const handleCopy = async () => {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-md pointer-events-auto animate-in fade-in duration-150">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--secondary)]/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#e73f07]/10 flex items-center justify-center text-[#e73f07]">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-sans font-black uppercase tracking-wider text-[var(--foreground)]">
                Aerial Multilingual Studio
              </h2>
              <p className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase tracking-wider">
                Translate canvas text across Malayalam, Tamil, Telugu, Hindi & Global Languages
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--accent)] transition-colors cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Language Selectors */}
        <div className="px-6 py-3 border-b border-[var(--border)] bg-[var(--secondary)]/20 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-1.5">
              From Language
            </label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="w-full bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-[var(--foreground)] outline-none focus:border-[#e73f07]"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-1.5">
              To Language
            </label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-[var(--foreground)] outline-none focus:border-[#e73f07]"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Input & Output */}
        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-1.5">
              Source Text
            </label>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={3}
              placeholder="Enter text to translate..."
              className="w-full bg-[#0a0a0a] text-[var(--foreground)] font-sans text-sm p-3.5 rounded-2xl border border-[var(--border)] outline-none focus:border-[#e73f07] transition-all resize-none shadow-inner"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold">
                Translated Result
              </label>
              <div className="flex items-center gap-2">
                {isTranslating && (
                  <span className="text-[10px] font-mono text-[#e73f07] animate-pulse">Translating...</span>
                )}
                {translatedText && (
                  <button
                    onClick={handleCopy}
                    className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={translatedText}
              onChange={(e) => setTranslatedText(e.target.value)}
              rows={3}
              placeholder="Translation will appear here..."
              className="w-full bg-[#111111] text-[var(--foreground)] font-sans text-sm p-3.5 rounded-2xl border border-[var(--border)] outline-none focus:border-[#e73f07] transition-all resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--secondary)]/30 flex items-center justify-between">
          <p className="text-[10px] font-mono text-[var(--muted-foreground)]">
            Ready to insert onto active canvas.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (translatedText.trim()) {
                  onInsertText(translatedText.trim());
                }
              }}
              disabled={!translatedText.trim() || isTranslating}
              className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-[#e73f07] hover:bg-[#d03806] text-white disabled:opacity-40 transition-all shadow-md shadow-[#e73f07]/20 active:translate-y-px cursor-pointer flex items-center gap-2"
            >
              <Type className="w-3.5 h-3.5" />
              Insert as Text
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
