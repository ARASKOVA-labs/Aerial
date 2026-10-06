// ── Editor chrome over the canvas: menu, toolbar, properties, zoom ───────────

import type { ReactNode } from 'react';
import type { AerialCanvasProps } from '../../lib/types';
import { HelpButton, MainMenu, ZoomBar } from '../../ui/Chrome';
import { ColorPicker } from '../../ui/ColorPicker';
import { MinusIcon, PlusIcon } from '../../ui/icons';
import { PropertiesPanel } from '../../ui/PropertiesPanel';
import { Toolbar } from '../../ui/Toolbar';
import type { CanvasCore } from './useCanvasCore';

const DIAGRAM_ACCENTS = ['#e73f07', '#1e1e1e', '#1971c2', '#2f9e44', '#f08c00'];

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="ae-section" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="ae-section__label" style={{ padding: 0, marginBottom: 6 }}>
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

/** Accent and size controls shown when a single diagram is selected. */
function DiagramControls({ accent, onAccent, onScale }: { accent: string; onAccent: (c: string) => void; onScale: (k: number) => void }) {
  return (
    <>
      <Section label="Diagram accent">
        <ColorPicker value={accent} quick={DIAGRAM_ACCENTS} onChange={onAccent} />
      </Section>
      <Section label="Size">
        <div className="ae-options">
          <button type="button" className="ae-opt" title="Shrink 10%" aria-label="Shrink diagram" onClick={() => onScale(0.9)}>
            <MinusIcon />
          </button>
          <button type="button" className="ae-opt" title="Grow 10%" aria-label="Grow diagram" onClick={() => onScale(1.1)}>
            <PlusIcon />
          </button>
        </div>
      </Section>
    </>
  );
}

type ChromeProps = Pick<AerialCanvasProps, 'menu' | 'extraTools' | 'topRight' | 'onHelp' | 'panelExtra'>;

export function CanvasChrome({
  core,
  props,
  defaultMenu,
  insertImage,
  onRecolorDiagram,
}: {
  core: CanvasCore;
  props: ChromeProps;
  defaultMenu: (close: () => void) => ReactNode;
  insertImage: () => void;
  onRecolorDiagram: (color: string) => void;
}) {
  const { activeTool, selection, diagramAccent, readOnly } = core;
  const diagramSelected = activeTool === 'select' && selection.count === 1 && selection.kinds[0] === 'Diagram' && diagramAccent !== null;
  const hostExtra = props.panelExtra?.(activeTool);
  const extra =
    diagramSelected || hostExtra ? (
      <>
        {diagramSelected && <DiagramControls accent={diagramAccent} onAccent={onRecolorDiagram} onScale={(k) => core.act((e) => e.scale_selected(k))} />}
        {hostExtra}
      </>
    ) : undefined;

  return (
    <div className="ae-layer">
      <div className="ae-top">
        <div className="ae-row" style={{ alignItems: 'flex-start' }}>
          <MainMenu>{props.menu ?? defaultMenu}</MainMenu>
        </div>
        {!readOnly && (
          <div className="ae-top-center">
            <Toolbar
              activeTool={activeTool}
              lastPen={core.uiStyle.lastPen}
              locked={core.toolLocked}
              onToggleLock={core.toggleLock}
              onSelectTool={(t) => core.applyTool(t)}
              onInsertImage={insertImage}
              extraTools={props.extraTools ?? []}
            />
          </div>
        )}
        <div className="ae-row">{props.topRight}</div>
      </div>

      {!readOnly && (
        <PropertiesPanel
          tool={activeTool}
          selection={selection}
          style={core.uiStyle}
          onChange={core.applyStyleChange}
          onPenChange={(p) => core.applyTool(p)}
          onEraser={core.applyEraser}
          onLayer={core.reorderSelected}
          onDuplicate={core.duplicateSelected}
          onDelete={core.deleteSelected}
          extra={extra}
        />
      )}

      <div className="ae-bottom">
        <ZoomBar
          zoom={core.zoomLevel}
          onZoomIn={core.zoomIn}
          onZoomOut={core.zoomOut}
          onReset={core.resetView}
          onUndo={core.undo}
          onRedo={core.redo}
          canUndo={core.canUndo && !readOnly}
          canRedo={core.canRedo && !readOnly}
        />
        {props.onHelp && <HelpButton onClick={props.onHelp} />}
      </div>
    </div>
  );
}
