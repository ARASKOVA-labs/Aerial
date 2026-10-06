// ── Aerial Canvas Library — Core Embeddable Component ───────────────────────
// A self-contained, Tauri-free canvas component that can be embedded in any
// React 19 application. Owns the WASM lifecycle, pointer/touch input, the
// keyboard map, inline text editing and (optionally) the Excalidraw-style
// editor chrome. The pieces live in ./canvas/; this file composes them.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { AerialCanvasProps, AerialCanvasRef } from '../lib/types';
import { WelcomeScreen } from '../ui/Chrome';
import { InlineTextEditor } from '../ui/InlineTextEditor';
import { ExportIcon, TrashIcon } from '../ui/icons';
import { themedColor } from '../ui/model';
import { MenuItem, MenuSeparator } from '../ui/primitives';
import '../ui/theme.css';
import { buildCanvasApi } from './canvas/canvasApi';
import { CanvasChrome } from './canvas/CanvasChrome';
import { useCanvasCore } from './canvas/useCanvasCore';
import { useCanvasKeyboard } from './canvas/useCanvasKeyboard';
import { useDiagramTheming } from './canvas/useDiagramTheming';
import { useEngineLifecycle } from './canvas/useEngineLifecycle';
import { useMagicPen } from './canvas/useMagicPen';
import { usePointerInput } from './canvas/usePointerInput';
import { useTextEditing } from './canvas/useTextEditing';

let canvasIdCounter = 0;

/** Largest side (screen px) of an image inserted from the built-in picker. */
const INSERT_MAX_PX = 600;

const CURSOR: Partial<Record<string, string>> = { hand: 'grab', select: 'default', eraser: 'none', text: 'text' };

export const AerialCanvas = forwardRef<AerialCanvasRef, AerialCanvasProps>(function AerialCanvas(props, ref) {
  const { theme, backgroundColor, showToolbar = true, className = '', onReady, showWelcome = false, welcomeItems, logo, onHelp, onInsertImage } = props;
  const isDark = theme === 'dark';
  const background = backgroundColor ?? '#ffffff';
  const [canvasId] = useState(() => `aerial-canvas-${canvasIdCounter++}`);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const core = useCanvasCore(props);
  const { engineRef, canvasRef, engineReady, activeTool, textDraft } = core;
  const diagrams = useDiagramTheming(core, isDark);
  const magic = useMagicPen(core, props);
  const text = useTextEditing(core);
  useEngineLifecycle(core, canvasId, isDark, background, props, diagrams.retheme);
  const pointer = usePointerInput(core, props, text, magic.convert);

  /** Built-in image insert, used when the host does not provide its own. */
  const insertImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const img = new Image();
      img.onload = () => {
        const e = engineRef.current;
        const canvas = canvasRef.current;
        if (!e || !canvas) return;
        const k = Math.min(1, INSERT_MAX_PX / (e.get_zoom() || 1) / Math.max(img.naturalWidth, img.naturalHeight));
        const [w, h] = [img.naturalWidth * k, img.naturalHeight * k];
        const cx = e.screen_to_world_x(canvas.clientWidth / 2);
        const cy = e.screen_to_world_y(canvas.clientHeight / 2);
        core.act((en) => en.add_image(img, cx - w / 2, cy - h / 2, w, h, `img-${Date.now().toString(36)}`));
        core.applyTool('select');
      };
      // A data URL (not a blob URL) so the image can be exported with the board.
      const reader = new FileReader();
      reader.onload = () => (img.src = String(reader.result));
      reader.readAsDataURL(file);
    },
    [engineRef, canvasRef, core],
  );
  const insertImage = useCallback(() => (onInsertImage ? onInsertImage() : fileInputRef.current?.click()), [onInsertImage]);

  useCanvasKeyboard(core, { insertImage, onHelp, openText: text.open });

  useEffect(() => {
    if (canvasRef.current) canvasRef.current.style.cursor = CURSOR[activeTool] ?? 'crosshair';
  }, [activeTool, canvasRef]);

  // ── Imperative API ──────────────────────────────────────────────────────
  const api = buildCanvasApi(core, diagrams, magic.convert);
  const apiRef = useRef(api);
  apiRef.current = api;
  useImperativeHandle(ref, () => api);
  useEffect(() => {
    if (engineReady) onReady?.(apiRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady]);

  const defaultMenu = useMemo(
    () => (close: () => void) => (
      <>
        <MenuItem
          icon={<ExportIcon />}
          label="Export image"
          onSelect={() => {
            close();
            void apiRef.current.exportPngBlob().then((blob) => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'aerial.png';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            });
          }}
        />
        <MenuSeparator />
        <MenuItem
          icon={<TrashIcon />}
          label="Reset the canvas"
          danger
          onSelect={() => {
            close();
            apiRef.current.clearBoard();
          }}
        />
      </>
    ),
    [],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  const engine = engineRef.current;
  const draftScreen = textDraft && engine ? { x: engine.world_to_screen_x(textDraft.worldX), y: engine.world_to_screen_y(textDraft.worldY), zoom: engine.get_zoom() || 1 } : null;

  return (
    <div
      className={`ae-root ${className}`}
      data-theme={isDark ? 'dark' : 'light'}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none', background: themedColor(background, isDark) }}
    >
      <canvas
        id={canvasId}
        ref={canvasRef}
        aria-label="Drawing canvas"
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={pointer.onPointerUp}
        onPointerCancel={pointer.onPointerUp}
        onPointerLeave={pointer.onPointerLeave}
        onDoubleClick={pointer.onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />

      {activeTool === 'eraser' && <EraserCursor cursorRef={core.eraserCursorRef} size={core.uiStyle.eraserSize} dark={isDark} />}

      {textDraft && draftScreen && (
        <InlineTextEditor
          key={`${String(textDraft.elementId)}-${textDraft.worldX}-${textDraft.worldY}`}
          draft={textDraft}
          screenX={draftScreen.x}
          screenY={draftScreen.y}
          zoom={draftScreen.zoom}
          displayColor={themedColor(textDraft.color, isDark)}
          onCommit={text.commit}
        />
      )}

      {showWelcome && engineReady && core.isEmpty && !textDraft && <WelcomeScreen logo={logo ?? <span>Aerial</span>} items={welcomeItems} hasHelp={!!onHelp} />}

      {showToolbar && engineReady && <CanvasChrome core={core} props={props} defaultMenu={defaultMenu} insertImage={insertImage} onRecolorDiagram={(c) => void diagrams.recolor(c)} />}

      {magic.converting && (
        <div className="ae-toast" role="status">
          Recognizing handwriting…
        </div>
      )}

      {!engineReady && !core.loadError && (
        <div role="status" aria-label="Loading canvas" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 30 }}>
          <span className="ae-spinner" />
        </div>
      )}
      {core.loadError && (
        <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 30, padding: 24 }}>
          <div className="ae-dialog" style={{ position: 'static' }}>
            <h2>Canvas failed to load</h2>
            <p style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{core.loadError}</p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files?.[0];
          if (f) insertImageFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
});

function EraserCursor({ cursorRef, size, dark }: { cursorRef: React.RefObject<HTMLDivElement | null>; size: number; dark: boolean }) {
  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        pointerEvents: 'none',
        opacity: 0,
        zIndex: 12,
        willChange: 'transform',
        border: `1.5px solid ${dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)'}`,
        background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        boxShadow: `0 0 0 1px ${dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.8)'}`,
      }}
    />
  );
}
