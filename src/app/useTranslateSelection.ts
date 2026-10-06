// ── Translate the selected text element in place ─────────────────────────────

import { useCallback, type RefObject } from 'react';
import { ensureConsent } from '../lib/consent';
import { createLogger } from '../lib/logger';
import { externalFetch } from '../lib/net';
import type { AerialCanvasRef } from '../lib/types';
import type { ShowToast } from './useToast';

const logger = createLogger('Translate');

export function useTranslateSelection(canvasRef: RefObject<AerialCanvasRef | null>, toast: ShowToast) {
  return useCallback(
    async (targetLang: string) => {
      const engine = canvasRef.current?.getEngine();
      const text = engine?.get_selected_text();
      if (!engine || !text) {
        toast('Select a text element first');
        return;
      }
      // Selected text leaves the device for a third party: ask once, explicitly.
      if (!(await ensureConsent('translation', { reask: true }))) return;
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
        const data = (await (await externalFetch(url)).json()) as unknown;
        const parts = Array.isArray(data) && Array.isArray(data[0]) ? (data[0] as unknown[]) : [];
        const translated = parts.map((p) => (Array.isArray(p) && typeof p[0] === 'string' ? p[0] : '')).join('');
        if (!translated) throw new Error('empty translation');
        engine.update_selected_text(translated);
        engine.render();
      } catch (err) {
        logger.error('Translation failed', err);
        toast('Translation failed');
      }
    },
    [canvasRef, toast],
  );
}
