// ── Diagrams on the canvas: insert, re-theme with the app, recolour ──────────

import { useCallback } from 'react';
import mermaid from 'mermaid';
import { applyAraskovaDiagramAesthetics, getAraskovaMermaidConfig } from '../../lib/diagram-theme';
import { createLogger } from '../../lib/logger';
import { renderSvgToImage, svgDataUrl, svgSize } from '../../lib/svg-image';
import { parseElement } from './element';
import type { CanvasCore } from './useCanvasCore';

const logger = createLogger('CanvasDiagrams');

const styleFor = (dark: boolean) => (dark ? 'brutalist' : 'industrial_light');
const uid = () => Math.random().toString(36).slice(2, 9);

async function renderAras(code: string): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<{ svg: string }>('render_diagram', { code }))?.svg ?? null;
  } catch {
    return null; // not running in the desktop shell
  }
}

export function useDiagramTheming(core: CanvasCore, isDark: boolean) {
  const { engineRef, canvasRef, selectionRef, syncUi, setDiagramAccent } = core;

  /** Re-renders every diagram for the current theme (they are images). */
  const retheme = useCallback(
    async (dark: boolean) => {
      const e = engineRef.current;
      if (!e) return;
      let diagrams: Array<{ id: number; code?: string; svg?: string }> = [];
      try {
        const parsed = JSON.parse(e.get_scene_json()) as { elements?: Array<{ id: number; kind?: string; code?: string; svg?: string }> };
        diagrams = (parsed.elements ?? []).filter((el) => el.kind?.toLowerCase() === 'diagram' && (el.code || el.svg));
      } catch (err) {
        logger.warn('Failed to parse scene for diagram re-theming:', err);
        return;
      }
      if (diagrams.length === 0) return;
      const style = styleFor(dark);
      mermaid.initialize(getAraskovaMermaidConfig(dark, style));
      for (const el of diagrams) {
        try {
          const code = (el.code ?? '').trim();
          let svg = /^(node|group)\s/.test(code) ? ((await renderAras(code)) ?? '') : '';
          if (svg) svg = applyAraskovaDiagramAesthetics(svg, dark, style);
          if (!svg && code) svg = applyAraskovaDiagramAesthetics((await mermaid.render(`retheme-${el.id}-${uid()}`, code)).svg, dark, style);
          if (!svg && el.svg) svg = applyAraskovaDiagramAesthetics(el.svg, dark, style);
          if (svg && engineRef.current) {
            engineRef.current.set_cached_image(BigInt(el.id), await renderSvgToImage(svg));
            engineRef.current.render();
          }
        } catch (err) {
          logger.warn(`Failed to re-theme diagram #${el.id}:`, err);
        }
      }
    },
    [engineRef],
  );

  /** Changes the selected diagram's accent colour. */
  const recolor = useCallback(
    async (color: string) => {
      const e = engineRef.current;
      const id = selectionRef.current.ids[0];
      const el = parseElement(e?.get_selected_element_json());
      if (!e || id === undefined || !el?.code) return;
      try {
        const style = styleFor(isDark);
        mermaid.initialize(getAraskovaMermaidConfig(isDark, style, color));
        const styled = applyAraskovaDiagramAesthetics((await mermaid.render(`recolor-${uid()}`, el.code)).svg, isDark, style, color);
        const img = await renderSvgToImage(styled);
        const parsed = JSON.parse(e.get_scene_json()) as { elements?: Array<Record<string, unknown>> };
        const target = parsed.elements?.find((x) => Number(x.id) === id);
        if (target) {
          target.stroke_color = color;
          target.svg = svgDataUrl(styled);
          e.load_scene_json(JSON.stringify(parsed));
        }
        e.set_cached_image(BigInt(id), img);
        e.set_accent_color(color);
        e.set_selected_id(BigInt(id));
        e.render();
        setDiagramAccent(color);
      } catch (err) {
        logger.error('Failed to recolor diagram:', err);
      }
    },
    [engineRef, selectionRef, isDark, setDiagramAccent],
  );

  /** Places a diagram in the middle of the view. */
  const addDiagram = useCallback(
    async (code: string, rawSvg: string, scale = 1, accent = '#e73f07') => {
      const engine = engineRef.current;
      const canvas = canvasRef.current;
      if (!engine || !canvas) return;
      try {
        // The studio hands over SVG it already themed; only style raw SVG here.
        const svg = rawSvg.includes('araskova-theme-override') ? rawSvg : applyAraskovaDiagramAesthetics(rawSvg, isDark, styleFor(isDark), accent);
        const size = svgSize(svg);
        const img = await renderSvgToImage(svg);
        const w = Math.round((size?.w || img.naturalWidth || 600) * scale);
        const h = Math.round((size?.h || img.naturalHeight || 400) * scale);
        const wx = engine.screen_to_world_x(canvas.clientWidth / 2) - w / 2;
        const wy = engine.screen_to_world_y(canvas.clientHeight / 2) - h / 2;
        engine.add_diagram(img, wx, wy, w, h, code, svgDataUrl(svg), '{}');
        engine.set_accent_color(accent);
        engine.render();
        syncUi();
      } catch (err) {
        logger.error('Error in addDiagram:', err);
      }
    },
    [engineRef, canvasRef, isDark, syncUi],
  );

  return { retheme, recolor, addDiagram };
}
