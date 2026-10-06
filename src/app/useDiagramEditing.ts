// ── Rename an Aras DSL diagram node by double-clicking it ────────────────────

import { useCallback, type RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { applyAraskovaDiagramAesthetics } from '../lib/diagram-theme';
import { createLogger } from '../lib/logger';
import type { AerialCanvasRef } from '../lib/types';

const logger = createLogger('DiagramEditing');

export function useDiagramEditing(canvasRef: RefObject<AerialCanvasRef | null>, isDarkMode: boolean) {
  return useCallback(
    async (_elementId: bigint, nodeId: string, code?: string) => {
      if (!code) return;
      const label = window.prompt(`Rename diagram node [${nodeId}]:`)?.trim();
      if (!label) return;
      try {
        const newCode = await invoke<string>('update_diagram_node', { code, nodeId, newLabel: label });
        const res = await invoke<{ svg: string }>('render_diagram', { code: newCode });
        canvasRef.current?.addDiagram(newCode, applyAraskovaDiagramAesthetics(res.svg, isDarkMode));
      } catch (err) {
        logger.error('Failed to update diagram node', err);
      }
    },
    [canvasRef, isDarkMode],
  );
}
