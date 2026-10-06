// ── The canvas's imperative API (AerialCanvasRef) ────────────────────────────

import type { AerialCanvasRef } from '../../lib/types';
import type { CanvasCore } from './useCanvasCore';

const EMPTY_CHANGES = '{"reset":false,"upserts":[],"deletes":[]}';

export function buildCanvasApi(
  core: CanvasCore,
  diagrams: { addDiagram: AerialCanvasRef['addDiagram']; retheme: (dark: boolean) => Promise<void> },
  convertMagic: () => Promise<string | null>,
): AerialCanvasRef {
  const { engineRef, canvasRef, styleRef, selectionRef, act } = core;
  const engine = () => engineRef.current;

  const exportPngBlob = () =>
    new Promise<Blob>((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) return reject(new Error('Canvas not available'));
      // Selection chrome is painted on the same canvas: clear it first.
      engine()?.deselect();
      engine()?.render();
      core.syncUi();
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to export PNG'))), 'image/png');
    });

  return {
    getEngine: engine,
    getSceneJson: () => engine()?.get_scene_json() ?? '{}',
    loadSceneJson: (json) => act((e) => e.load_scene_json(json)),
    exportFullState: () => engine()?.export_full_state() ?? new Uint8Array(),
    importFullState: (bytes) => act((e) => e.import_full_state(bytes)),
    takeChanges: () => engine()?.take_changes() ?? EMPTY_CHANGES,
    getElementCount: () => engine()?.element_count() ?? 0,
    getRenderStats: () => {
      try {
        return JSON.parse(engine()?.get_render_stats() ?? '{}');
      } catch {
        return {};
      }
    },
    setLodThreshold: (px) => engine()?.set_lod_threshold(px),

    addDiagram: diagrams.addDiagram,
    scaleSelected: (factor) => act((e) => e.scale_selected(factor)),
    setAccentColor: (color) => act((e) => e.set_accent_color(color)),
    addText: (text, x = 250, y = 250, size = 28, color, fontFamily) => act((e) => e.add_text(text, x, y, size, fontFamily || styleRef.current.fontFamily, color)),
    addImage: (img, x, y, w, h, assetId) => act((e) => e.add_image(img, x, y, w, h, assetId)),
    convertMagicStrokes: convertMagic,

    exportPngBlob,
    exportSvgString: async () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not available');
      await exportPngBlob();
      const dataUrl = canvas.toDataURL('image/png');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
    },

    clearBoard: () => act((e) => e.clear_board()),
    zoomIn: core.zoomIn,
    zoomOut: core.zoomOut,
    resetView: core.resetView,
    zoomToFit: core.zoomToFit,
    getZoom: () => (engine() ? Math.round(engine()!.get_zoom() * 100) : core.zoomLevel),

    setTool: (tool) => core.applyTool(tool, false),
    setToolLocked: core.setToolLocked,
    setStrokeColor: (color) => core.applyStyleChange({ strokeColor: color }),
    setStrokeWidth: (width) => core.applyStyleChange({ strokeWidth: width }),
    applyStyle: core.applyStyleChange,
    getUiStyle: () => styleRef.current,
    setEraserType: (type) => {
      engine()?.set_eraser_type?.(type);
      if (type !== 'element') core.applyEraser({ eraserMode: type });
    },
    setEraserSize: (size) => core.applyEraser({ eraserSize: size }),

    undo: core.undo,
    redo: core.redo,
    deleteSelected: core.deleteSelected,
    duplicateSelected: core.duplicateSelected,
    reorderSelected: core.reorderSelected,
    selectAll: core.selectAll,
    getSelectionInfo: () => selectionRef.current,

    setDarkMode: (dark) => {
      engine()?.set_dark_mode(dark);
      engine()?.render();
      void diagrams.retheme(dark);
    },
    setBackgroundColor: (color) => engine()?.set_background_color(color),
  };
}
