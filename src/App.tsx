import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import mermaid from 'mermaid';
import * as pdfjsLib from 'pdfjs-dist';
// Bundled locally: loading executable worker code from a CDN at runtime was a
// supply-chain risk and broke PDF import offline.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import './App.css';
import { AerialMark } from './AerialLogo';
import { AerialCanvas } from './components/AerialCanvas';
import { QuickCanvasModal } from './components/QuickCanvasModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { KeyboardShortcutsModal } from './components/desktop/KeyboardShortcutsModal';
import { DiagramStudioModal } from './components/desktop/DiagramStudioModal';
import { TextTranslatorModal } from './components/desktop/TextTranslatorModal';
import type { AerialCanvasRef, DesktopToolId, ToolId } from './lib/types';
import type { ExtraTool } from './ui/Toolbar';
import { ColorPicker } from './ui/ColorPicker';
import { MenuItem, MenuSeparator, MenuTitle, MOD } from './ui/primitives';
import { CANVAS_BACKGROUNDS, EMPTY_SELECTION, type SelectionInfo } from './ui/model';
import {
  BoardIcon,
  ChatIcon,
  CheckIcon,
  ClipboardIcon,
  CloseIcon,
  CommandIcon,
  DiagramIcon,
  EditIcon,
  ExportIcon,
  FileIcon,
  FullscreenIcon,
  GridIcon,
  HelpIcon,
  ImageIcon,
  LaserIcon,
  MagicPenIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  TranslateIcon,
  TrashIcon,
} from './ui/icons';
import { createLogger } from './lib/logger';
import { ensureConsent } from './lib/consent';
import { externalFetch } from './lib/net';
import {
  BoardSaver,
  EMPTY_SCENE,
  deleteBoardData,
  loadBoardScene,
  persistenceAvailable,
  preloadAssets,
  saveBoardChanges,
  sceneToChangeSet,
} from './lib/board-store';
import {
  getAraskovaMermaidConfig,
  applyAraskovaDiagramAesthetics,
} from './lib/diagram-theme';

const logger = createLogger('App');

mermaid.initialize({
  ...getAraskovaMermaidConfig(true, 'brutalist'),
  startOnLoad: false,
  securityLevel: 'strict',
});

/**
 * Canvas colours are stored in their light-theme form and inverted for dark
 * mode, so the old dark "paper" presets map back to white. Without this, a
 * board saved with a dark background would turn near-white in dark mode.
 */
const LEGACY_DARK_PAPERS = new Set(['#0a0a0a', '#18181b', '#0f172a', '#0c2a4a', '#121212']);
export function canonicalPaper(color: string | null | undefined): string {
  if (!color) return '#ffffff';
  return LEGACY_DARK_PAPERS.has(color.toLowerCase()) ? '#ffffff' : color;
}

export interface BoardInfo {
  id: string;
  name: string;
  updatedAt: number;
  bgColor?: string;
  gridType?: 'dots' | 'lines' | 'blank';
}

const TRANSLATE_LANGS: Array<[string, string]> = [['en', 'EN'], ['ml', 'ML'], ['ta', 'TA'], ['te', 'TE'], ['hi', 'HI'], ['es', 'ES'], ['fr', 'FR']];
const MAGIC_LANGS: Array<['en' | 'ml' | 'ta' | 'te', string]> = [['en', 'EN'], ['ml', 'ML'], ['ta', 'TA'], ['te', 'TE']];

/** A labelled row of text options, styled like the properties panel. */
function PanelChoice<T extends string>({ label, value, options, onChange }: { label: string; value?: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <fieldset className="ae-section" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="ae-section__label" style={{ padding: 0, marginBottom: 6 }}>
        {label}
      </legend>
      <div className="ae-options" style={{ flexWrap: 'wrap' }}>
        {options.map(([v, text]) => (
          <button key={v} type="button" className="ae-opt ae-opt--text" aria-pressed={v === value} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Small "Aerial" lock-up for the welcome screen. */
function Wordmark({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
      <AerialMark size={46} isDarkMode={isDarkMode} />
      <span style={{ fontFamily: 'Rephen, var(--ae-font)', fontSize: 42, fontWeight: 900, letterSpacing: '0.14em', color: 'var(--ae-text)' }}>AERIAL</span>
    </span>
  );
}

export default function App() {
  const canvasRef = useRef<AerialCanvasRef>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<DesktopToolId>('select');
  const [selection, setSelection] = useState<SelectionInfo>(EMPTY_SELECTION);
  const [magicLanguage, setMagicLanguage] = useState<'en' | 'ml' | 'ta' | 'te'>('en');
  const [gridType, setGridType] = useState<'dots' | 'lines' | 'blank'>(() => {
    const g = localStorage.getItem('aerial_grid');
    return g === 'dots' || g === 'lines' ? g : 'blank';
  });
  const [palmRejection, setPalmRejection] = useState(() => localStorage.getItem('aerial_palm_rejection') !== 'false');
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
  // Autosave reads the board id from a ref so a save scheduled just before a
  // board switch can never write the new board's changes under the old id.
  const activeBoardIdRef = useRef(activeBoardId);
  const saverRef = useRef<BoardSaver | null>(null);
  if (!saverRef.current) saverRef.current = new BoardSaver(() => canvasRef.current?.getEngine());
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [canvasBgColor, setCanvasBgColor] = useState<string>(() => canonicalPaper(localStorage.getItem('aerial_canvas_bg')));

  // Modals
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showDiagramModal, setShowDiagramModal] = useState(false);
  const [showTranslatorModal, setShowTranslatorModal] = useState(false);
  const [, setIsFullscreen] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showQuickCanvas, setShowQuickCanvas] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [isOpenedFromBackground, setIsOpenedFromBackground] = useState(false);

  const handleHideWindow = useCallback(() => {
    invoke('hide_window').catch((err) => {
      logger.debug('hide_window not available (web mode):', err);
    });
  }, []);

  // ── Global Shortcut Event Listener (Tauri) ─────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<boolean>('quick-canvas:open', (event) => {
      setIsOpenedFromBackground(Boolean(event.payload));
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

  // Dark mode (persisted to localStorage)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('aerial_dark_mode') === 'true';
  });

  // Drawings re-colour with the theme (the engine inverts canonical colours),
  // so switching theme no longer touches the paper colour.
  useEffect(() => {
    localStorage.setItem('aerial_dark_mode', isDarkMode.toString());
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('aerial_grid', gridType);
  }, [gridType]);

  useEffect(() => {
    localStorage.setItem('aerial_palm_rejection', String(palmRejection));
  }, [palmRejection]);

  const handleThemeChange = useCallback((dark: boolean) => setIsDarkMode(dark), []);

  // ── Canvas onReady: Hydrate board and pre-load assets ───────────────────────
  const handleCanvasReady = useCallback(async (api: AerialCanvasRef) => {
    const engine = api.getEngine();
    if (!engine) return;
    window.__aerialBoot?.('board');

    // Load persisted board from the Tauri backend
    let loadedDbBoard = false;
    if (persistenceAvailable()) {
      try {
        const scene = await loadBoardScene(activeBoardIdRef.current);
        if (scene) {
          api.loadSceneJson(scene);
          void preloadAssets(engine);
          loadedDbBoard = true;
        }
      } catch (e) {
        logger.error('Failed to load board:', e);
      }
    }

    if (!loadedDbBoard) logger.debug('No persisted board; starting empty');

    engine.set_grid_type(gridType);
    engine.set_dark_mode(isDarkMode);
    engine.set_background_color(canvasBgColor);
    engine.render();
    setCanvasReady(true);

    // Hold the boot screen until the hand-drawn font is ready (bounded), so
    // the first frame of the welcome screen and text never flashes.
    window.__aerialBoot?.('fonts');
    await Promise.race([
      Promise.all([document.fonts.load('400 20px Kalam'), document.fonts.load('500 14px Inter')]).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 700)),
    ]);
    window.__aerialBoot?.('ready');
  }, [gridType, isDarkMode, canvasBgColor]);

  // ── Auto-Save Loop: incremental deltas to the Tauri backend ────────────────
  useEffect(() => {
    if (!canvasReady) return;
    const flush = () => { void saverRef.current?.flush(activeBoardIdRef.current); };
    const interval = setInterval(flush, 500);
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHidden);
      flush();
    };
  }, [canvasReady]);

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
    if (targetId === activeBoardIdRef.current) return;
    const engine = canvasRef.current?.getEngine();
    if (engine) {
      // Persist the outgoing board's pending edits under its own id first.
      await saverRef.current?.flush(activeBoardIdRef.current);

      activeBoardIdRef.current = targetId;
      setActiveBoardId(targetId);
      localStorage.setItem('aerial_active_board_id', targetId);

      // Loading (even an empty scene) resets the engine's change feed, so the
      // switch itself never produces writes.
      let scene: string | null = null;
      if (persistenceAvailable()) {
        try {
          scene = await loadBoardScene(targetId);
        } catch (err) {
          logger.error('Failed to load target board:', err);
        }
      }
      canvasRef.current?.loadSceneJson(scene ?? EMPTY_SCENE);
      void preloadAssets(engine);

      const targetBoard = boards.find(b => b.id === targetId);
      if (targetBoard?.bgColor) setCanvasBgColor(canonicalPaper(targetBoard.bgColor));
      if (targetBoard?.gridType) setGridType(targetBoard.gridType);
    }
  }, [boards]);

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

  const deleteBoard = useCallback(async (boardId: string) => {
    if (boards.length <= 1) return;
    const remaining = boards.filter(b => b.id !== boardId);
    setBoards(remaining);
    localStorage.setItem('aerial_board_list', JSON.stringify(remaining));
    if (activeBoardIdRef.current === boardId) {
      await switchBoard(remaining[0].id);
    }
    // Deleting from the list must delete the data too — previously the rows
    // stayed on disk indefinitely after a board was "deleted".
    if (persistenceAvailable()) {
      try {
        await deleteBoardData(boardId);
      } catch (err) {
        logger.error('Failed to delete board data:', err);
      }
    }
  }, [boards, switchBoard]);

  // ── Tool Selection ────────────────────────────────────────────────────────
  const selectTool = useCallback((id: DesktopToolId) => {
    if (id === 'image') {
      imageInputRef.current?.click();
      return;
    }
    if (id === 'pdf') {
      pdfInputRef.current?.click();
      return;
    }
    canvasRef.current?.setTool(id);
    setActiveTool(id);
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

  // ── Toast Notification HUD ────────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToastNotification = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2500);
  }, []);

  const handleStampText = useCallback((text: string) => {
    const engine = canvasRef.current?.getEngine();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const wx = engine ? engine.screen_to_world_x(cx - 150) : 250;
    const wy = engine ? engine.screen_to_world_y(cy - 50) : 250;
    const textColor = isDarkMode ? '#f3f3f2' : '#0a0a0a';
    canvasRef.current?.addText(text, wx, wy, 24, textColor);
    showToastNotification('Note stamped to canvas');
  }, [isDarkMode, showToastNotification]);

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

    if (canvasState && canvasState.length > 0 && persistenceAvailable()) {
      try {
        const sceneJson = new TextDecoder().decode(canvasState);
        await saveBoardChanges(newId, sceneToChangeSet(sceneJson));
      } catch (e) {
        logger.error('Failed to save quick note board:', e);
      }
    }

    await switchBoard(newId);

    if (textContent) {
      const textColor = isDarkMode ? '#f3f3f2' : '#0a0a0a';
      canvasRef.current?.addText(textContent, 100, 100, 24, textColor);
      setTimeout(async () => {
        const engine = canvasRef.current?.getEngine();
        if (engine) {
          try {
            const stateBytes = engine.export_full_state();
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < stateBytes.length; i += chunkSize) {
              binary += String.fromCharCode.apply(null, stateBytes.subarray(i, i + chunkSize) as unknown as number[]);
            }
            const b64 = window.btoa(binary);
            await invoke('save_board', { payloadB64: b64, boardId: newId });
          } catch (err) {
            logger.error('Failed to persist text board:', err);
          }
        }
      }, 200);
    }
    showToastNotification('Quick Note saved as new board');
  }, [boards, canvasBgColor, gridType, switchBoard, isDarkMode, showToastNotification]);

  // ── Sync Incoming Stamps from Standalone Quick Note Window ───────────────
  useEffect(() => {
    const checkIncomingStamps = () => {
      const stampText = localStorage.getItem('aerial_quick_stamp_text');
      if (stampText) {
        localStorage.removeItem('aerial_quick_stamp_text');
        handleStampText(stampText);
      }
      const stampSketch = localStorage.getItem('aerial_quick_stamp_sketch');
      if (stampSketch) {
        localStorage.removeItem('aerial_quick_stamp_sketch');
        fetch(stampSketch)
          .then((res) => res.blob())
          .then((blob) => handleStampSketch(blob))
          .catch((e) => logger.error('Failed to convert stamp sketch blob:', e));
      }
      const targetBoardId = localStorage.getItem('aerial_active_board_id');
      if (targetBoardId && targetBoardId !== activeBoardId) {
        const stored = localStorage.getItem('aerial_board_list');
        if (stored) {
          try {
            setBoards(JSON.parse(stored));
          } catch {
            // ignore
          }
        }
        switchBoard(targetBoardId);
      }
    };

    window.addEventListener('focus', checkIncomingStamps);
    window.addEventListener('storage', checkIncomingStamps);
    return () => {
      window.removeEventListener('focus', checkIncomingStamps);
      window.removeEventListener('storage', checkIncomingStamps);
    };
  }, [handleStampText, handleStampSketch, activeBoardId, switchBoard]);

  // ── Mouse Position Tracking (for placing pasted screenshots right at the cursor) ──
  const mousePosRef = useRef<{ x: number; y: number }>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, []);

  // ── Universal Image & Screenshot Insertion (Pastes, Drops, Files) ─────────
  const insertImageFromDataUrl = useCallback(async (
    dataUrl: string,
    targetPos?: { x: number; y: number }
  ) => {
    const engine = canvasRef.current?.getEngine();
    if (!engine) return;

    const assetId = crypto.randomUUID();
    try {
      await invoke('save_asset', { id: assetId, base64Data: dataUrl });
    } catch (err) {
      logger.debug('save_asset fallback (web mode):', err);
    }

    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      const maxW = Math.min(850, window.innerWidth * 0.75);
      const maxH = Math.min(650, window.innerHeight * 0.75);

      if (w > maxW) {
        h = (maxW / w) * h;
        w = maxW;
      }
      if (h > maxH) {
        w = (maxH / h) * w;
        h = maxH;
      }

      const screenX = targetPos ? targetPos.x : (window.innerWidth / 2);
      const screenY = targetPos ? targetPos.y : (window.innerHeight / 2);
      const wx = engine.screen_to_world_x(screenX - w / 2);
      const wy = engine.screen_to_world_y(screenY - h / 2);

      canvasRef.current?.addImage(img, wx, wy, w, h, assetId);
      showToastNotification('Screenshot inserted into canvas');
    };
    img.src = dataUrl;
  }, [showToastNotification]);

  const insertImageFile = useCallback((file: File | Blob, targetPos?: { x: number; y: number }) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        insertImageFromDataUrl(dataUrl, targetPos);
      }
    };
    reader.readAsDataURL(file);
  }, [insertImageFromDataUrl]);

  // ── Paste Screenshot / Image from Clipboard (⌘V / Button) ───────────────────
  const handlePasteFromClipboard = useCallback(async (targetPos?: { x: number; y: number }) => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            insertImageFile(blob, targetPos || mousePosRef.current);
            return true;
          }
        }
      }
    } catch (err) {
      logger.debug('Clipboard API read error, relying on paste event:', err);
    }
    return false;
  }, [insertImageFile]);

  // Global window paste listener for direct ⌘V screenshot insertion
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (showQuickCanvas || showDiagramModal || showTranslatorModal) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            e.stopPropagation();
            insertImageFile(file, mousePosRef.current);
            return;
          }
        }
      }

      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f.type.startsWith('image/')) {
            e.preventDefault();
            e.stopPropagation();
            insertImageFile(f, mousePosRef.current);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [insertImageFile, showQuickCanvas, showDiagramModal, showTranslatorModal]);

  // ── Drag & Drop Screenshots & Image Files directly onto Canvas ─────────────
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingFile(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        setIsDraggingFile(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingFile(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      let offset = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const pos = {
            x: e.clientX + offset,
            y: e.clientY + offset,
          };
          insertImageFile(file, pos);
          offset += 30;
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [insertImageFile]);

  // Tauri Native File Drop Listener (Finder / Desktop Screenshots)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ paths: string[]; position: { x: number; y: number } }>('tauri://drag-drop', async (event) => {
      if (!event.payload?.paths || event.payload.paths.length === 0) return;
      let offset = 0;
      for (const filePath of event.payload.paths) {
        if (filePath.match(/\.(png|jpe?g|webp|gif|bmp|tiff|svg)$/i)) {
          try {
            // Rust only reads paths the OS just reported in this drop event.
            const dataUrl = await invoke<string>('read_dropped_image', { path: filePath });
            const pos = {
              x: (event.payload.position?.x ?? window.innerWidth / 2) + offset,
              y: (event.payload.position?.y ?? window.innerHeight / 2) + offset,
            };
            insertImageFromDataUrl(dataUrl, pos);
            offset += 30;
          } catch (err) {
            logger.error('Failed to read dropped file in Tauri:', err);
          }
        }
      }
    }).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => { unlisten?.(); };
  }, [insertImageFromDataUrl]);

  // Image Upload input handler
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      insertImageFile(file);
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [insertImageFile]);

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
      showToastNotification('Select a text element first');
      return;
    }

    // Selected text leaves the device for a third party: ask once, explicitly.
    if (!ensureConsent('translation', { reask: true })) return;

    try {
      const res = await externalFetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`);
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
      showToastNotification('Translation failed');
    }
  }, [showToastNotification]);

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

  // ── App-level keyboard shortcuts ──────────────────────────────────────────
  // Drawing shortcuts (tools, undo, zoom, layers…) live in <AerialCanvas />;
  // it handles its keys first and marks them handled with preventDefault.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (e.key === 'Escape') {
        setShowClearConfirm(false);
        setShowFeedbackModal(false);
        setShowDiagramModal(false);
        setShowTranslatorModal(false);
        setShowShortcutsModal(false);
        setShowQuickCanvas(false);
        setShowCommandPalette(false);
        return;
      }
      if (e.defaultPrevented) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      if (key === 'k') {
        e.preventDefault();
        setShowCommandPalette((s) => !s);
      } else if (e.shiftKey && key === 's') {
        e.preventDefault();
        void handleExportSvg();
      } else if (key === 's' || key === 'e') {
        e.preventDefault();
        void handleExportImage();
      } else if (key === 'n') {
        e.preventDefault();
        void createNewBoard();
      } else if (key === 'o') {
        e.preventDefault();
        (e.shiftKey ? pdfInputRef : imageInputRef).current?.click();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && e.shiftKey) {
        e.preventDefault();
        setShowClearConfirm(true);
      } else if (key === 'v') {
        void handlePasteFromClipboard();
      } else if (/^[1-9]$/.test(e.key) && boards[parseInt(e.key, 10) - 1]) {
        e.preventDefault();
        void switchBoard(boards[parseInt(e.key, 10) - 1].id);
      } else if (e.ctrlKey && key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === '/') {
        e.preventDefault();
        setShowShortcutsModal((s) => !s);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleExportImage, handleExportSvg, createNewBoard, switchBoard, boards, toggleFullscreen, handlePasteFromClipboard]);

  // ── Editor chrome content ─────────────────────────────────────────────────
  const extraTools = useMemo<ExtraTool[]>(
    () => [
      { id: 'laser', label: 'Laser pointer', icon: <LaserIcon />, shortcut: 'K', group: 'Draw', active: activeTool === 'laser_pen', onSelect: () => selectTool('laser_pen') },
      { id: 'magic', label: 'Magic pen — handwriting to text', icon: <MagicPenIcon />, shortcut: 'W', group: 'Draw', active: activeTool === 'magic_pen', onSelect: () => selectTool('magic_pen') },
      { id: 'diagram', label: 'Diagram from text (Mermaid)', icon: <DiagramIcon />, group: 'Generate', onSelect: () => setShowDiagramModal(true) },
      { id: 'translate', label: 'Text translator', icon: <TranslateIcon />, group: 'Generate', onSelect: () => setShowTranslatorModal(true) },
      { id: 'pdf', label: 'Insert PDF', icon: <FileIcon />, shortcut: `${MOD}⇧O`, group: 'Insert', onSelect: () => pdfInputRef.current?.click() },
      { id: 'paste', label: 'Paste screenshot', icon: <ClipboardIcon />, shortcut: `${MOD}V`, group: 'Insert', onSelect: () => void handlePasteFromClipboard() },
    ],
    [activeTool, selectTool, handlePasteFromClipboard],
  );

  const panelExtra = useCallback(
    (tool: ToolId): ReactNode => {
      if (tool === 'magic_pen') {
        return <PanelChoice label="Handwriting language" value={magicLanguage} options={MAGIC_LANGS} onChange={setMagicLanguage} />;
      }
      if (tool === 'select' && selection.count === 1 && selection.kinds[0] === 'Text') {
        return <PanelChoice label="Translate to" options={TRANSLATE_LANGS} onChange={(l) => void handleTranslate(l)} />;
      }
      return null;
    },
    [magicLanguage, selection, handleTranslate],
  );

  const commitRename = useCallback(() => {
    if (renamingBoardId) renameBoard(renamingBoardId, renameInput);
    setRenamingBoardId(null);
  }, [renamingBoardId, renameInput, renameBoard]);

  const menu = (close: () => void) => (
    <>
      <MenuTitle
        action={
          <button type="button" className="ae-btn ae-btn--sm ae-tip ae-tip--right" data-tip={`New board — ${MOD}N`} aria-label="New board" onClick={() => void createNewBoard()}>
            <PlusIcon />
          </button>
        }
      >
        Boards
      </MenuTitle>
      {boards.map((b) =>
        renamingBoardId === b.id ? (
          <div key={b.id} className="ae-menu-row">
            <input
              className="ae-input"
              autoFocus
              value={renameInput}
              aria-label="Board name"
              maxLength={80}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenamingBoardId(null);
              }}
              onBlur={commitRename}
            />
          </div>
        ) : (
          <div key={b.id} className="ae-menu-board">
            <MenuItem
              icon={<BoardIcon />}
              label={b.name}
              current={b.id === activeBoardId}
              onSelect={() => {
                void switchBoard(b.id);
                close();
              }}
            />
            {b.id === activeBoardId && (
              <span className="ae-menu-board__actions">
                <button
                  type="button"
                  className="ae-btn ae-btn--sm"
                  aria-label="Rename board"
                  title="Rename"
                  onClick={() => {
                    setRenameInput(b.name);
                    setRenamingBoardId(b.id);
                  }}
                >
                  <EditIcon />
                </button>
                {boards.length > 1 && (
                  <button type="button" className="ae-btn ae-btn--sm" aria-label="Delete board" title="Delete" onClick={() => void deleteBoard(b.id)}>
                    <TrashIcon />
                  </button>
                )}
              </span>
            )}
          </div>
        ),
      )}
      <MenuSeparator />
      <MenuItem icon={<ImageIcon />} label="Open image…" hint={`${MOD}O`} onSelect={() => { close(); imageInputRef.current?.click(); }} />
      <MenuItem icon={<ExportIcon />} label="Export image…" hint={`${MOD}S`} onSelect={() => { close(); void handleExportImage(); }} />
      <MenuItem icon={<ExportIcon />} label="Export SVG…" hint={`${MOD}⇧S`} onSelect={() => { close(); void handleExportSvg(); }} />
      <MenuItem icon={<CommandIcon />} label="Command palette" hint={`${MOD}K`} onSelect={() => { close(); setShowCommandPalette(true); }} />
      <MenuItem icon={<FullscreenIcon />} label="Toggle fullscreen" onSelect={() => { close(); toggleFullscreen(); }} />
      <MenuItem icon={<HelpIcon />} label="Help" hint="?" onSelect={() => { close(); setShowShortcutsModal(true); }} />
      <MenuItem icon={<TrashIcon />} label="Reset the canvas" danger onSelect={() => { close(); setShowClearConfirm(true); }} />
      <MenuSeparator />
      <MenuItem icon={<ChatIcon />} label="Send feedback" onSelect={() => { close(); setShowFeedbackModal(true); }} />
      <MenuSeparator />
      <div className="ae-menu-row" style={{ justifyContent: 'space-between' }}>
        <span className="ae-menu-label">Theme</span>
        <div className="ae-options" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" className="ae-opt" aria-checked={!isDarkMode} aria-pressed={!isDarkMode} aria-label="Light" title="Light" onClick={() => handleThemeChange(false)}>
            <SunIcon />
          </button>
          <button type="button" role="radio" className="ae-opt" aria-checked={isDarkMode} aria-pressed={isDarkMode} aria-label="Dark" title="Dark" onClick={() => handleThemeChange(true)}>
            <MoonIcon />
          </button>
        </div>
      </div>
      <MenuTitle>Canvas background</MenuTitle>
      <div className="ae-menu-row">
        <ColorPicker value={canvasBgColor} quick={CANVAS_BACKGROUNDS} shadeIndex={0} onChange={changeCanvasBg} />
      </div>
      <MenuItem
        icon={<GridIcon />}
        label="Grid"
        hint={gridType === 'blank' ? 'Off' : gridType === 'dots' ? 'Dots' : 'Lines'}
        onSelect={() => setGridType((g) => (g === 'blank' ? 'dots' : g === 'dots' ? 'lines' : 'blank'))}
      />
      <MenuItem
        icon={palmRejection ? <CheckIcon /> : <CloseIcon />}
        label="Palm rejection"
        hint={palmRejection ? 'On' : 'Off'}
        onSelect={() => setPalmRejection((p) => !p)}
      />
    </>
  );

  const welcomeItems = (
    <>
      <MenuItem icon={<ImageIcon />} label="Open image" hint={`${MOD}O`} onSelect={() => imageInputRef.current?.click()} />
      <MenuItem icon={<DiagramIcon />} label="Diagram from text" onSelect={() => setShowDiagramModal(true)} />
      <MenuItem icon={<HelpIcon />} label="Help & shortcuts" hint="?" onSelect={() => setShowShortcutsModal(true)} />
    </>
  );

  return (
    <div className="ae-root fixed inset-0 overflow-hidden select-none" data-theme={isDarkMode ? 'dark' : 'light'}>
      <div className="absolute inset-0 z-0">
        <AerialCanvas
          ref={canvasRef}
          onExternalRequest={(service) => ensureConsent(service, { reask: true })}
          theme={isDarkMode ? 'dark' : 'light'}
          backgroundColor={canvasBgColor}
          palmRejection={palmRejection}
          magicLanguage={magicLanguage}
          showToolbar
          showWelcome
          menu={menu}
          extraTools={extraTools}
          welcomeItems={welcomeItems}
          logo={<Wordmark isDarkMode={isDarkMode} />}
          onHelp={() => setShowShortcutsModal((s) => !s)}
          onInsertImage={() => imageInputRef.current?.click()}
          onSelectionChange={setSelection}
          panelExtra={panelExtra}
          onReady={handleCanvasReady}
          onToolChange={(tool) => setActiveTool(tool)}
          onNodeDoubleClick={handleNodeDoubleClick}
        />
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
      <input ref={pdfInputRef} type="file" accept="application/pdf" hidden onChange={handlePdfUpload} />

      {/* ── Reset canvas confirmation ── */}
      {showClearConfirm && (
        <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setShowClearConfirm(false)}>
          <div className="ae-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title">
            <h2 id="clear-title">Reset the canvas?</h2>
            <p>This clears the whole board. You can still undo it with {MOD}Z until you close the app.</p>
            <div className="ae-dialog__actions">
              <button type="button" className="ae-cta" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="ae-cta ae-cta--danger"
                autoFocus
                onClick={() => {
                  canvasRef.current?.clearBoard();
                  setShowClearConfirm(false);
                }}
              >
                Reset canvas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback ── */}
      {showFeedbackModal && (
        <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setShowFeedbackModal(false)}>
          <div className="ae-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" style={{ width: 440 }}>
            <h2 id="feedback-title">{feedbackSent ? 'Thanks for the feedback!' : 'Send feedback'}</h2>
            {feedbackSent ? (
              <p>It helps make Aerial better for everyone.</p>
            ) : (
              <>
                <p>Found a bug or have an idea? Tell us — or open an issue on GitHub.</p>
                <textarea
                  className="ae-input"
                  rows={5}
                  autoFocus
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="What happened? What did you expect?"
                  style={{ width: '100%', resize: 'vertical', marginBottom: 4 }}
                />
              </>
            )}
            <div className="ae-dialog__actions">
              {!feedbackSent && (
                <a className="ae-cta" href="https://github.com/ARASKOVA-labs/Aerial/issues/new" target="_blank" rel="noreferrer" style={{ marginRight: 'auto' }}>
                  Open GitHub issue
                </a>
              )}
              <button
                type="button"
                className="ae-cta"
                onClick={() => {
                  setShowFeedbackModal(false);
                  setFeedbackSent(false);
                }}
              >
                {feedbackSent ? 'Close' : 'Cancel'}
              </button>
              {!feedbackSent && (
                <button
                  type="button"
                  className="ae-cta ae-cta--primary"
                  disabled={!feedbackText.trim()}
                  onClick={() => {
                    setFeedbackSent(true);
                    setFeedbackText('');
                  }}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showQuickCanvas && (
        <QuickCanvasModal
          isDarkMode={isDarkMode}
          isOpenedFromBackground={isOpenedFromBackground}
          onClose={() => {
            setShowQuickCanvas(false);
            if (isOpenedFromBackground) {
              handleHideWindow();
              setIsOpenedFromBackground(false);
            }
          }}
          onStampSketch={handleStampSketch}
          onStampText={handleStampText}
          onSaveAsBoard={handleSaveQuickNoteAsBoard}
          onHideWindow={handleHideWindow}
        />
      )}

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
          onToggleTheme={() => setIsDarkMode((d) => !d)}
          onClearBoard={() => setShowClearConfirm(true)}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
          onPasteScreenshot={() => handlePasteFromClipboard()}
        />
      )}

      {showShortcutsModal && <KeyboardShortcutsModal onClose={() => setShowShortcutsModal(false)} />}

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

      {showTranslatorModal && (
        <TextTranslatorModal
          onClose={() => setShowTranslatorModal(false)}
          onInsertText={(text) => {
            canvasRef.current?.addText(text);
            setShowTranslatorModal(false);
          }}
        />
      )}

      {/* ── Drop target ── */}
      {isDraggingFile && (
        <div className="ae-drop" aria-hidden="true">
          <div className="ae-drop__card">
            <ImageIcon />
            <span>Drop image to insert</span>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="ae-toast" role="status" style={{ position: 'fixed' }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
