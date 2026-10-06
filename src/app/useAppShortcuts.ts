// ── App-level keyboard shortcuts ─────────────────────────────────────────────
// Drawing shortcuts (tools, undo, zoom, layers…) live in <AerialCanvas />; it
// handles its keys first and marks them handled with preventDefault.

import { useEffect, useRef } from 'react';

export interface ShortcutActions {
  closeDialogs: () => void;
  togglePalette: () => void;
  toggleHelp: () => void;
  exportPng: () => void;
  exportSvg: () => void;
  saveFile: () => void;
  openFile: () => void;
  newBoard: () => void;
  openImage: () => void;
  openPdf: () => void;
  resetCanvas: () => void;
  pasteScreenshot: () => void;
  switchToBoard: (index: number) => void;
  toggleFullscreen: () => void;
  zoomToFit: () => void;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function useAppShortcuts(actions: ShortcutActions) {
  // Always call the latest handlers without re-binding the listener.
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ref.current;
      if (e.key === 'Escape') return a.closeDialogs();
      if (isTyping(e.target) || e.defaultPrevented) return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        if (e.shiftKey && e.code === 'Digit1') {
          e.preventDefault();
          a.zoomToFit();
        }
        return;
      }
      const key = e.key.toLowerCase();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (key === 'k') run(a.togglePalette);
      else if (key === 's') run(e.shiftKey ? a.exportSvg : a.exportPng);
      else if (key === 'e') run(e.shiftKey ? a.openFile : a.saveFile);
      else if (key === 'n') run(a.newBoard);
      else if (key === 'o') run(e.shiftKey ? a.openPdf : a.openImage);
      else if ((e.key === 'Backspace' || e.key === 'Delete') && e.shiftKey) run(a.resetCanvas);
      else if (key === 'v') a.pasteScreenshot(); // let the paste event fire too
      else if (/^[1-9]$/.test(e.key)) run(() => a.switchToBoard(parseInt(e.key, 10) - 1));
      else if (e.ctrlKey && key === 'f') run(a.toggleFullscreen);
      else if (e.key === '/') run(a.toggleHelp);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
