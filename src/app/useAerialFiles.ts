// ── Save / open .aerial files ────────────────────────────────────────────────
// Desktop: native Save / Open dialogs (Rust writes and reads the file) plus
// files opened from Finder. Web: download and <input type="file">.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AERIAL_EXTENSION, AERIAL_MIME, AerialFileError, aerialFileName, parseAerialFile, serializeAerialFile } from '../lib/aerial-file';
import { collectDocument } from '../lib/board-files';
import { persistenceAvailable } from '../lib/board-store';
import { createLogger } from '../lib/logger';
import type { AerialCanvasRef } from '../lib/types';
import type { ShowToast } from './useToast';
import type { UseBoards } from './useBoards';

const logger = createLogger('AerialFiles');

interface OpenedFile {
  name: string;
  contents: string;
}

/** A file waiting for its password. */
export interface LockedFile {
  name: string;
  contents: string;
  error?: string;
}

const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: AERIAL_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useAerialFiles(canvasRef: RefObject<AerialCanvasRef | null>, boards: UseBoards, canvasReady: boolean, toast: ShowToast) {
  const [saving, setSaving] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [locked, setLocked] = useState<LockedFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Open ───────────────────────────────────────────────────────────────────
  const importText = useCallback(
    async (file: OpenedFile, password?: string) => {
      try {
        const doc = await parseAerialFile(file.contents, password);
        if (!doc.name || doc.name === 'Imported board') doc.name = file.name;
        await boards.importDocument(doc);
        setLocked(null);
        toast(`Opened ${doc.name}`);
      } catch (err) {
        if (err instanceof AerialFileError && (err.code === 'password-required' || err.code === 'wrong-password')) {
          setLocked({ ...file, error: err.code === 'wrong-password' ? err.message : undefined });
          return;
        }
        logger.error('Could not open .aerial file', err);
        setLocked(null);
        toast(err instanceof AerialFileError ? err.message : 'That file could not be opened.');
      }
    },
    [boards, toast],
  );

  const openFile = useCallback(async () => {
    if (!persistenceAvailable()) {
      inputRef.current?.click();
      return;
    }
    try {
      const file = await invoke<OpenedFile | null>('open_aerial_file');
      if (file) await importText(file);
    } catch (err) {
      logger.error('Open dialog failed', err);
      toast('That file could not be opened.');
    }
  }, [importText, toast]);

  const onInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      await importText({ name: f.name.replace(new RegExp(`\\.${AERIAL_EXTENSION}$`, 'i'), ''), contents: await f.text() });
    },
    [importText],
  );

  // Files opened from the OS (Finder double-click, Open With, launch args).
  useEffect(() => {
    if (!canvasReady || !persistenceAvailable()) return;
    let disposed = false;
    const drain = async () => {
      try {
        const files = await invoke<OpenedFile[]>('take_opened_files');
        for (const f of files) if (!disposed) await importText(f);
      } catch (err) {
        logger.debug('No opened files to collect', err);
      }
    };
    void drain();
    const unlisten = listen('aerial://file-opened', () => void drain());
    return () => {
      disposed = true;
      void unlisten.then((fn) => fn()).catch(() => undefined);
    };
  }, [canvasReady, importText]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const saveFile = useCallback(
    async (name: string, password?: string) => {
      const engine = canvasRef.current?.getEngine();
      if (!engine) return;
      setSaving(true);
      try {
        const doc = await collectDocument(engine, name, APP_VERSION);
        const text = await serializeAerialFile(doc, password);
        const fileName = aerialFileName(name);
        if (persistenceAvailable()) {
          const saved = await invoke<string | null>('save_aerial_file', { suggestedName: fileName, contents: text });
          if (saved) toast(`Saved ${saved}${password ? ' (encrypted)' : ''}`);
        } else {
          download(fileName, text);
        }
        setSaveOpen(false);
      } catch (err) {
        logger.error('Saving .aerial file failed', err);
        toast('The board could not be saved.');
      } finally {
        setSaving(false);
      }
    },
    [canvasRef, toast],
  );

  return {
    openFile,
    /** Opens the Save dialog. */
    requestSave: useCallback(() => setSaveOpen(true), []),
    /** Closes the Save / Unlock dialogs (Escape). */
    closeDialogs: useCallback(() => {
      setSaveOpen(false);
      setLocked(null);
    }, []),
    saveDialog: { open: saveOpen, saving, defaultName: boards.activeBoard?.name ?? 'Board', onSave: saveFile, onClose: () => setSaveOpen(false) },
    unlockDialog: locked && {
      file: locked,
      onUnlock: (password: string) => importText(locked, password),
      onClose: () => setLocked(null),
    },
    inputProps: { ref: inputRef, type: 'file', accept: `.${AERIAL_EXTENSION},${AERIAL_MIME},application/json`, hidden: true, onChange: onInputChange } as const,
  };
}
