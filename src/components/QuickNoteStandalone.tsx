import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { QuickCanvasModal } from './QuickCanvasModal';
import { createLogger } from '../lib/logger';

const logger = createLogger('QuickNoteStandalone');

export function QuickNoteStandalone() {
  const [isDarkMode] = useState(() => {
    const saved = localStorage.getItem('aerial_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Ensure 100% transparency for standalone floating card
    document.documentElement.classList.add('quicknote-window');
    document.body.classList.add('quicknote-window');
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    const root = document.getElementById('root');
    if (root) {
      root.style.backgroundColor = 'transparent';
    }

    // Sync theme class to html/root
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleClose = useCallback(() => {
    invoke('hide_window').catch((e) => logger.debug('hide_window failed:', e));
  }, []);

  const handleStampText = useCallback(async (text: string) => {
    try {
      localStorage.setItem('aerial_quick_stamp_text', text);
      await invoke('open_main_canvas');
    } catch (e) {
      logger.debug('open_main_canvas failed:', e);
    }
  }, []);

  const handleStampSketch = useCallback(async (pngBlob: Blob) => {
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const b64 = reader.result as string;
        localStorage.setItem('aerial_quick_stamp_sketch', b64);
        try {
          await invoke('open_main_canvas');
        } catch (e) {
          logger.debug('open_main_canvas failed:', e);
        }
      };
      reader.readAsDataURL(pngBlob);
    } catch (e) {
      logger.debug('open_main_canvas failed:', e);
    }
  }, []);

  const handleSaveAsBoard = useCallback(async (name: string, canvasState?: Uint8Array, textContent?: string) => {
    const newId = 'board_' + Date.now();
    const newBoard = {
      id: newId,
      name: name || `Quick Note`,
      updatedAt: Date.now(),
      bgColor: isDarkMode ? '#0a0a0a' : '#ffffff',
      gridType: 'dots',
    };

    // Update board list in localStorage
    try {
      const stored = localStorage.getItem('aerial_board_list');
      const list = stored ? JSON.parse(stored) : [];
      const updatedList = [...list, newBoard];
      localStorage.setItem('aerial_board_list', JSON.stringify(updatedList));
      localStorage.setItem('aerial_active_board_id', newId);
      if (textContent) {
        localStorage.setItem('aerial_quick_stamp_text', textContent);
      }
    } catch (e) {
      logger.error('Failed to update board list:', e);
    }

    // Save canvas state to DB if present
    if (canvasState && canvasState.length > 0) {
      let binary = '';
      for (let i = 0; i < canvasState.length; i++) {
        binary += String.fromCharCode(canvasState[i]);
      }
      const b64 = btoa(binary);
      try {
        await invoke('save_board', { payloadB64: b64, boardId: newId });
      } catch (e) {
        logger.error('Failed to save board to DB:', e);
      }
    }

    // Open main canvas to show the new board
    try {
      await invoke('open_main_canvas');
    } catch (e) {
      logger.debug('open_main_canvas failed:', e);
    }
  }, [isDarkMode]);

  return (
    <div className="w-screen h-screen flex items-center justify-center p-0 bg-transparent select-none overflow-hidden">
      <QuickCanvasModal
        isDarkMode={isDarkMode}
        isStandalone={true}
        onClose={handleClose}
        onStampSketch={handleStampSketch}
        onStampText={handleStampText}
        onSaveAsBoard={handleSaveAsBoard}
        onHideWindow={handleClose}
      />
    </div>
  );
}
