// ── Getting images onto the canvas: paste, drop, pick, PDF ───────────────────

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import * as pdfjsLib from 'pdfjs-dist';
// Bundled locally: loading executable worker code from a CDN at runtime was a
// remote-code-execution risk and broke offline use.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { persistenceAvailable } from '../lib/board-store';
import { createLogger } from '../lib/logger';
import type { AerialCanvasRef } from '../lib/types';
import type { ShowToast } from './useToast';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const logger = createLogger('ImageImport');

type Point = { x: number; y: number };

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|bmp|tiff?|svg)$/i;
/** Successive images in one drop are fanned out by this many px. */
const CASCADE_PX = 30;
const PDF_RENDER_SCALE = 1.5;
const PDF_PAGE_GAP = 40;

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Stores an image on the desktop; the web build keeps it in memory only. */
async function storeAsset(id: string, dataUrl: string) {
  if (!persistenceAvailable()) return;
  await invoke('save_asset', { id, base64Data: dataUrl });
}

export function useImageImport(canvasRef: RefObject<AerialCanvasRef | null>, toast: ShowToast, blocked: boolean) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const pointer = useRef<Point>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  /** Places an image centred on `at` (screen px), scaled to fit the view. */
  const insertDataUrl = useCallback(
    async (dataUrl: string, at?: Point) => {
      const engine = canvasRef.current?.getEngine();
      if (!engine) return;
      const assetId = crypto.randomUUID();
      try {
        await storeAsset(assetId, dataUrl);
      } catch (err) {
        logger.error('Could not store image', err);
        toast('That image could not be saved.');
        return;
      }
      const img = await loadImage(dataUrl);
      let { width: w, height: h } = img;
      const maxW = Math.min(850, window.innerWidth * 0.75);
      const maxH = Math.min(650, window.innerHeight * 0.75);
      if (w > maxW) [w, h] = [maxW, (maxW / w) * h];
      if (h > maxH) [w, h] = [(maxH / h) * w, maxH];
      const p = at ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      canvasRef.current?.addImage(img, engine.screen_to_world_x(p.x - w / 2), engine.screen_to_world_y(p.y - h / 2), w, h, assetId);
    },
    [canvasRef, toast],
  );

  const insertFile = useCallback(async (file: Blob, at?: Point) => insertDataUrl(await readAsDataUrl(file), at), [insertDataUrl]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      for (const item of (await navigator.clipboard?.read?.()) ?? []) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          await insertFile(await item.getType(type), pointer.current);
          return true;
        }
      }
    } catch (err) {
      logger.debug('Clipboard read unavailable; relying on the paste event', err);
    }
    return false;
  }, [insertFile]);

  // ⌘V of an image anywhere outside a text field.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (blocked) return;
      const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile());
      const file = files.find(Boolean) ?? [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      void insertFile(file, pointer.current);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [insertFile, blocked]);

  // Browser drag & drop.
  useEffect(() => {
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      setIsDraggingFile(true);
    };
    const onLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) setIsDraggingFile(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);
      [...(e.dataTransfer?.files ?? [])]
        .filter((f) => f.type.startsWith('image/'))
        .forEach((f, i) => void insertFile(f, { x: e.clientX + i * CASCADE_PX, y: e.clientY + i * CASCADE_PX }));
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [insertFile]);

  // Desktop: files dropped from Finder arrive as paths; Rust only reads paths
  // the OS reported in this drop event.
  useEffect(() => {
    if (!persistenceAvailable()) return;
    const unlisten = listen<{ paths: string[]; position?: Point }>('tauri://drag-drop', async (event) => {
      const at = event.payload.position ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      let i = 0;
      for (const path of event.payload.paths ?? []) {
        if (!IMAGE_FILE.test(path)) continue;
        try {
          const dataUrl = await invoke<string>('read_dropped_image', { path });
          await insertDataUrl(dataUrl, { x: at.x + i * CASCADE_PX, y: at.y + i * CASCADE_PX });
          i++;
        } catch (err) {
          logger.error('Could not read a dropped file', err);
        }
      }
    });
    return () => void unlisten.then((fn) => fn()).catch(() => undefined);
  }, [insertDataUrl]);

  const onImageInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) void insertFile(file);
    },
    [insertFile],
  );

  /** Renders every page of a PDF as an image, laid out left to right. */
  const onPdfInput = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const engine = canvasRef.current?.getEngine();
      if (!file || !engine) return;
      try {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const y = engine.screen_to_world_y(100);
        let x = engine.screen_to_world_x(window.innerWidth / 2 - 300);
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const dataUrl = canvas.toDataURL('image/png');
          const assetId = crypto.randomUUID();
          await storeAsset(assetId, dataUrl);
          canvasRef.current?.addImage(await loadImage(dataUrl), x, y, viewport.width, viewport.height, assetId);
          x += viewport.width + PDF_PAGE_GAP;
        }
        toast(`Inserted ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`);
      } catch (err) {
        logger.error('Could not render PDF', err);
        toast('That PDF could not be opened.');
      }
    },
    [canvasRef, toast],
  );

  return {
    isDraggingFile,
    pasteFromClipboard,
    openImagePicker: useCallback(() => imageInputRef.current?.click(), []),
    openPdfPicker: useCallback(() => pdfInputRef.current?.click(), []),
    imageInputProps: { ref: imageInputRef, type: 'file', accept: 'image/*', hidden: true, onChange: onImageInput } as const,
    pdfInputProps: { ref: pdfInputRef, type: 'file', accept: 'application/pdf', hidden: true, onChange: onPdfInput } as const,
  };
}
