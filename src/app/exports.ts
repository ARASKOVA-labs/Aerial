// ── PNG / SVG export ─────────────────────────────────────────────────────────

import type { RefObject } from 'react';
import { createLogger } from '../lib/logger';
import type { AerialCanvasRef } from '../lib/types';
import type { ShowToast } from './useToast';

const logger = createLogger('Export');

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export async function exportPng(canvas: RefObject<AerialCanvasRef | null>, toast: ShowToast) {
  try {
    const blob = await canvas.current?.exportPngBlob();
    if (blob) download(blob, `aerial-${stamp()}.png`);
  } catch (err) {
    logger.error('PNG export failed', err);
    toast('The image could not be exported.');
  }
}

export async function exportSvg(canvas: RefObject<AerialCanvasRef | null>, toast: ShowToast) {
  try {
    const svg = await canvas.current?.exportSvgString();
    if (svg) download(new Blob([svg], { type: 'image/svg+xml' }), `aerial-${stamp()}.svg`);
  } catch (err) {
    logger.error('SVG export failed', err);
    toast('The SVG could not be exported.');
  }
}
