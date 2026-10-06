// ── Boards: list, active board, autosave, import ─────────────────────────────

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { AerialDocument } from '../lib/aerial-file';
import { applyAssets, persistAssets, rekeyAssets } from '../lib/board-files';
import { BoardSaver, EMPTY_SCENE, deleteBoardData, loadBoardScene, persistenceAvailable, preloadAssets, saveBoardChanges, sceneToChangeSet } from '../lib/board-store';
import { createLogger } from '../lib/logger';
import type { AerialCanvasRef } from '../lib/types';
import { usePersistentState } from './usePersistentState';

const logger = createLogger('Boards');

export type GridType = 'dots' | 'lines' | 'blank';

export interface BoardInfo {
  id: string;
  name: string;
  updatedAt: number;
  bgColor?: string;
  gridType?: GridType;
}

const DEFAULT_BOARDS: BoardInfo[] = [{ id: 'default_board', name: 'Main Canvas', updatedAt: 0 }];
const AUTOSAVE_MS = 500;

function parseBoards(raw: string | null): BoardInfo[] {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((b) => b && typeof b.id === 'string' && typeof b.name === 'string');
    }
  } catch {
    // Corrupt list: start over with the default board (its data is still on disk).
  }
  return DEFAULT_BOARDS;
}

const newBoardId = () => `board_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export interface UseBoards {
  boards: BoardInfo[];
  activeBoardId: string;
  activeBoard: BoardInfo | undefined;
  /** Loads the active board into a freshly mounted canvas. */
  hydrate: (api: AerialCanvasRef) => Promise<void>;
  switchBoard: (id: string) => Promise<void>;
  createBoard: (opts?: { name?: string }) => Promise<string>;
  renameBoard: (id: string, name: string) => void;
  deleteBoard: (id: string) => Promise<void>;
  /** Adds a document (e.g. an opened .aerial file) as a new board and opens it. */
  importDocument: (doc: AerialDocument) => Promise<void>;
  /** Remembers per-board paper colour / grid. */
  setBoardLook: (look: { bgColor?: string; gridType?: GridType }) => void;
}

export function useBoards(
  canvasRef: RefObject<AerialCanvasRef | null>,
  canvasReady: boolean,
  onLook: (look: { bgColor?: string; gridType?: GridType }) => void,
  defaults: { bgColor: string; gridType: GridType },
): UseBoards {
  const [boards, setBoards] = usePersistentState('aerial_board_list', parseBoards, JSON.stringify);
  const [activeBoardId, setActiveBoardId] = usePersistentState('aerial_active_board_id', (raw) => raw || 'default_board');

  // Autosave reads the board id from a ref so a save scheduled just before a
  // board switch can never write the new board's changes under the old id.
  const activeRef = useRef(activeBoardId);
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  const saverRef = useRef<BoardSaver | null>(null);
  saverRef.current ??= new BoardSaver(() => canvasRef.current?.getEngine());

  const hydrate = useCallback(
    async (api: AerialCanvasRef) => {
      const engine = api.getEngine();
      if (!engine || !persistenceAvailable()) return;
      try {
        const scene = await loadBoardScene(activeRef.current);
        if (scene) {
          api.loadSceneJson(scene);
          void preloadAssets(engine);
        }
      } catch (err) {
        logger.error('Failed to load board:', err);
      }
    },
    [],
  );

  useEffect(() => {
    if (!canvasReady) return;
    const flush = () => void saverRef.current?.flush(activeRef.current);
    const interval = setInterval(flush, AUTOSAVE_MS);
    const onHidden = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHidden);
      flush();
    };
  }, [canvasReady]);

  const switchBoard = useCallback(
    async (targetId: string) => {
      if (targetId === activeRef.current) return;
      const api = canvasRef.current;
      const engine = api?.getEngine();
      if (!api || !engine) return;
      // Persist the outgoing board's pending edits under its own id first.
      await saverRef.current?.flush(activeRef.current);
      activeRef.current = targetId;
      setActiveBoardId(targetId);
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
      api.loadSceneJson(scene ?? EMPTY_SCENE);
      void preloadAssets(engine);
      const target = boardsRef.current.find((b) => b.id === targetId);
      onLook({ bgColor: target?.bgColor, gridType: target?.gridType });
    },
    [canvasRef, onLook, setActiveBoardId],
  );

  const addBoard = useCallback(
    (name: string): string => {
      const id = newBoardId();
      setBoards((prev) => [...prev, { id, name, updatedAt: Date.now(), bgColor: defaults.bgColor, gridType: defaults.gridType }]);
      boardsRef.current = [...boardsRef.current, { id, name, updatedAt: Date.now(), bgColor: defaults.bgColor, gridType: defaults.gridType }];
      return id;
    },
    [defaults.bgColor, defaults.gridType, setBoards],
  );

  const createBoard = useCallback(
    async (opts: { name?: string } = {}) => {
      const id = addBoard(opts.name?.trim() || `Canvas ${boardsRef.current.length + 1}`);
      await switchBoard(id);
      return id;
    },
    [addBoard, switchBoard],
  );

  const renameBoard = useCallback(
    (id: string, name: string) => {
      const clean = name.trim().slice(0, 80);
      if (!clean) return;
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, name: clean, updatedAt: Date.now() } : b)));
    },
    [setBoards],
  );

  const deleteBoard = useCallback(
    async (id: string) => {
      const remaining = boardsRef.current.filter((b) => b.id !== id);
      if (remaining.length === 0) return;
      setBoards(remaining);
      boardsRef.current = remaining;
      if (activeRef.current === id) await switchBoard(remaining[0].id);
      // Deleting from the list deletes the data too.
      if (persistenceAvailable()) {
        try {
          await deleteBoardData(id);
        } catch (err) {
          logger.error('Failed to delete board data:', err);
        }
      }
    },
    [setBoards, switchBoard],
  );

  const importDocument = useCallback(
    async (input: AerialDocument) => {
      const doc = rekeyAssets(input);
      const sceneJson = JSON.stringify(doc.scene);
      const id = addBoard(doc.name);
      if (persistenceAvailable()) {
        // Store first: switching loads the board from disk like any other.
        await persistAssets(doc.assets);
        await saveBoardChanges(id, sceneToChangeSet(sceneJson));
        await switchBoard(id);
      } else {
        await switchBoard(id);
        canvasRef.current?.loadSceneJson(sceneJson);
      }
      const engine = canvasRef.current?.getEngine();
      if (engine) {
        applyAssets(engine, doc.assets);
        canvasRef.current?.zoomToFit();
      }
    },
    [addBoard, canvasRef, switchBoard],
  );

  const setBoardLook = useCallback(
    (look: { bgColor?: string; gridType?: GridType }) => {
      setBoards((prev) => prev.map((b) => (b.id === activeRef.current ? { ...b, ...look } : b)));
    },
    [setBoards],
  );

  return {
    boards,
    activeBoardId,
    activeBoard: boards.find((b) => b.id === activeBoardId),
    hydrate,
    switchBoard,
    createBoard,
    renameBoard,
    deleteBoard,
    importDocument,
    setBoardLook,
  };
}
