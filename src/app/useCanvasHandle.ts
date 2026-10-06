// ── The canvas ref and its "engine is ready" flag ────────────────────────────

import { useCallback, useRef, useState } from 'react';
import type { AerialCanvasRef } from '../lib/types';

export function useCanvasHandle() {
  const canvasRef = useRef<AerialCanvasRef>(null);
  const [canvasReady, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  return { canvasRef, canvasReady, markReady };
}
