// ── Magic pen: handwriting → text via Google Input Tools ─────────────────────

import { useCallback, useState } from 'react';
import { createLogger } from '../../lib/logger';
import { externalFetch } from '../../lib/net';
import type { AerialCanvasProps } from '../../lib/types';
import type { CanvasCore } from './useCanvasCore';

const logger = createLogger('MagicPen');

/** Recognition starts this long after the last stroke. */
export const MAGIC_IDLE_MS = 1200;
const TEXT_SIZE = 28;

type MagicProps = Pick<AerialCanvasProps, 'magicLanguage' | 'magicFont' | 'onExternalRequest'>;

export function useMagicPen(core: CanvasCore, { magicLanguage = 'en', magicFont = 'Kalam, Caveat, cursive', onExternalRequest }: MagicProps) {
  const { engineRef, styleRef, syncUi } = core;
  const [converting, setConverting] = useState(false);

  const convert = useCallback(async (): Promise<string | null> => {
    const engine = engineRef.current;
    if (!engine) return null;
    // Recognition uploads the ink to Google Input Tools; let the host gate it.
    if (onExternalRequest && !(await onExternalRequest('handwriting'))) return null;
    const jsonStr = engine.extract_magic_strokes();
    if (!jsonStr) return null;
    try {
      const { ink, bounds } = JSON.parse(jsonStr) as {
        ink?: unknown[];
        bounds?: { min_x?: number; min_y?: number; max_x?: number; max_y?: number; baseline_y?: number };
      };
      if (!Array.isArray(ink) || ink.length === 0) return null;
      setConverting(true);
      const resp = await externalFetch(`https://inputtools.google.com/request?itc=${encodeURIComponent(magicLanguage)}-t-i0-handwrit&app=translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_version: 0.4,
          api_level: '533.0.0',
          device: navigator.userAgent,
          input_type: '0',
          options: 'enable_pre_space',
          requests: [
            {
              writing_guide: {
                writing_area_width: Math.max(800, (bounds?.max_x ?? 800) - (bounds?.min_x ?? 0)),
                writing_area_height: Math.max(300, (bounds?.max_y ?? 300) - (bounds?.min_y ?? 0)),
              },
              ink,
              language: magicLanguage,
            },
          ],
        }),
      });
      if (!resp.ok) throw new Error(`Recognition API HTTP error: ${resp.status}`);
      const data = await resp.json();
      const recognized = data?.[0] === 'SUCCESS' ? (data?.[1]?.[0]?.[1]?.[0] as string | undefined) : undefined;
      if (recognized) {
        const x = bounds?.min_x ?? 250;
        const y = bounds?.baseline_y ? bounds.baseline_y - TEXT_SIZE : (bounds?.min_y ?? 250);
        engine.add_text(recognized, x, y, TEXT_SIZE, magicFont, styleRef.current.strokeColor);
        syncUi();
        return recognized;
      }
    } catch (err) {
      logger.warn('Handwriting recognition failed:', err);
    } finally {
      setConverting(false);
      engine.render();
    }
    return null;
  }, [engineRef, styleRef, syncUi, magicLanguage, magicFont, onExternalRequest]);

  return { convert, converting };
}
