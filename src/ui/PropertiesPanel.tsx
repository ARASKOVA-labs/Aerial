// ── Properties panel (left island) ───────────────────────────────────────────
// Shows only what applies to the active tool or the current selection, the
// way Excalidraw does: stroke, background, fill, width, style, sloppiness,
// edges, font, opacity, layers and actions — plus pen types and eraser modes.

import type { ReactNode } from 'react';
import type { ToolId } from '../lib/types';
import { ColorPicker } from './ColorPicker';
import {
  BackwardIcon,
  BrushIcon,
  DuplicateIcon,
  EdgeRoundIcon,
  EdgeSharpIcon,
  ErasePartialIcon,
  EraseWholeIcon,
  FillCrossIcon,
  FillHachureIcon,
  FillSolidIcon,
  ForwardIcon,
  HighlighterIcon,
  MarkerIcon,
  PenIcon,
  SloppyArchitectIcon,
  SloppyArtistIcon,
  SloppyCartoonistIcon,
  StrokeDashedIcon,
  StrokeDottedIcon,
  StrokeSolidIcon,
  StrokeWidthIcon,
  ToBackIcon,
  ToFrontIcon,
  TrashIcon,
} from './icons';
import {
  BACKGROUND_QUICK,
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHTER_QUICK,
  LINEAR_TOOLS,
  PEN_WIDTHS,
  SHAPE_TOOLS,
  SHAPE_WIDTHS,
  STROKE_QUICK,
  isPen,
  type PenTool,
  type SelectionInfo,
  type UiStyle,
} from './model';

/** Style change in engine terms (only present fields change). */
export interface StyleChange {
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: UiStyle['fillStyle'];
  strokeWidth?: number;
  strokeStyle?: UiStyle['strokeStyle'];
  roughness?: number;
  roundness?: UiStyle['roundness'];
  opacity?: number;
  fontFamily?: string;
  fontSize?: number;
}

const SHAPE_KINDS = ['Rectangle', 'Diamond', 'Ellipse'];
const LINEAR_KINDS = ['Line', 'Arrow'];
const PEN_KINDS = ['FreeDraw', 'FountainPen', 'Marker', 'Highlighter'];

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

function Options<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode; text?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="ae-options" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-pressed={o.value === value}
          aria-label={o.label}
          title={o.label}
          className={`ae-opt${o.text ? ' ae-opt--text' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon ?? o.text}
        </button>
      ))}
    </div>
  );
}

export interface PropertiesPanelProps {
  tool: ToolId;
  selection: SelectionInfo;
  style: UiStyle;
  onChange: (change: StyleChange) => void;
  onPenChange: (pen: PenTool) => void;
  onEraser: (patch: Partial<Pick<UiStyle, 'eraserMode' | 'eraserSize'>>) => void;
  onLayer: (action: 'front' | 'forward' | 'backward' | 'back') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Extra tool-specific controls supplied by the host (e.g. Magic Pen language). */
  extra?: ReactNode;
}

export function PropertiesPanel({ tool, selection, style, onChange, onPenChange, onEraser, onLayer, onDuplicate, onDelete, extra }: PropertiesPanelProps) {
  const selecting = tool === 'select' && selection.count > 0;
  const kinds = selecting ? selection.kinds : [];
  const anyKind = (list: string[]) => kinds.some((k) => list.includes(k));
  const showShape = SHAPE_TOOLS.includes(tool) || anyKind(SHAPE_KINDS);
  const showLinear = LINEAR_TOOLS.includes(tool) || anyKind(LINEAR_KINDS);
  const showPen = isPen(tool) || anyKind(PEN_KINDS);
  const showText = tool === 'text' || kinds.includes('Text');
  const showEraser = tool === 'eraser';
  const isHighlighter = tool === 'highlighter' || (selecting && kinds.length === 1 && kinds[0] === 'Highlighter');
  const strokeable = showShape || showLinear || showPen || showText;

  if (!strokeable && !showEraser && !extra && !selecting) return null;

  const sel = selecting ? selection.style : null;
  const strokeColor = sel?.strokeColor ?? (tool === 'highlighter' ? style.highlighterColor : style.strokeColor);
  const background = sel?.backgroundColor ?? style.backgroundColor;
  const width = sel?.strokeWidth ?? (tool === 'highlighter' ? style.highlighterWidth : isPen(tool) ? style.penWidth : style.shapeWidth);
  const widths = showShape || showLinear ? SHAPE_WIDTHS : PEN_WIDTHS;
  const nearestWidth = widths.reduce((a, b) => (Math.abs(b[0] - width) < Math.abs(a[0] - width) ? b : a))[0];
  const opacity = sel?.opacity ?? style.opacity;
  const fillStyle = sel?.fillStyle ?? style.fillStyle;
  const strokeStyle = sel?.strokeStyle ?? style.strokeStyle;
  const roughness = sel?.roughness ?? style.roughness;
  const roundness = sel?.roundness ?? style.roundness;
  const fontFamily = sel?.fontFamily ?? style.fontFamily;
  const fontSize = sel?.fontSize ?? style.fontSize;
  const hasFill = showShape && background !== 'transparent';

  return (
    <div className="ae-island ae-panel" role="region" aria-label="Properties">
      {isPen(tool) && !selecting && (
        <Section label="Pen">
          <Options<PenTool>
            value={tool}
            onChange={onPenChange}
            options={[
              { value: 'freedraw', label: 'Pen — pressure-sensitive ink', icon: <PenIcon /> },
              { value: 'fountain', label: 'Brush — tapered, expressive', icon: <BrushIcon /> },
              { value: 'marker', label: 'Marker — even, bold', icon: <MarkerIcon /> },
              { value: 'highlighter', label: 'Highlighter — translucent', icon: <HighlighterIcon /> },
            ]}
          />
        </Section>
      )}

      {showEraser && (
        <>
          <Section label="Eraser">
            <Options<'stroke' | 'precision'>
              value={style.eraserMode}
              onChange={(v) => onEraser({ eraserMode: v })}
              options={[
                { value: 'stroke', label: 'Whole object — previews, removes on release (Alt restores)', icon: <EraseWholeIcon /> },
                { value: 'precision', label: 'Partial — erase just the part you touch', icon: <ErasePartialIcon /> },
              ]}
            />
          </Section>
          <Section label="Size">
            <div className="ae-range-row">
              <input
                className="ae-range"
                type="range"
                min={6}
                max={80}
                step={2}
                value={style.eraserSize}
                style={{ ['--ae-fill' as string]: `${((style.eraserSize - 6) / 74) * 100}%` }}
                onChange={(e) => onEraser({ eraserSize: Number(e.target.value) })}
              />
              <span>{style.eraserSize}</span>
            </div>
          </Section>
        </>
      )}

      {strokeable && (
        <Section label="Stroke">
          <ColorPicker value={strokeColor} quick={isHighlighter ? HIGHLIGHTER_QUICK : STROKE_QUICK} onChange={(c) => onChange({ strokeColor: c })} />
        </Section>
      )}

      {showShape && (
        <Section label="Background">
          <ColorPicker value={background} quick={BACKGROUND_QUICK} allowTransparent shadeIndex={0} onChange={(c) => onChange({ backgroundColor: c })} />
        </Section>
      )}

      {hasFill && (
        <Section label="Fill">
          <Options
            value={fillStyle}
            onChange={(v) => onChange({ fillStyle: v })}
            options={[
              { value: 'hachure', label: 'Hachure', icon: <FillHachureIcon /> },
              { value: 'cross-hatch', label: 'Cross-hatch', icon: <FillCrossIcon /> },
              { value: 'solid', label: 'Solid', icon: <FillSolidIcon /> },
            ]}
          />
        </Section>
      )}

      {(showShape || showLinear || showPen) && (
        <Section label="Stroke width">
          <Options
            value={nearestWidth}
            onChange={(v) => onChange({ strokeWidth: v })}
            options={widths.map(([w, label]) => ({ value: w, label, icon: <StrokeWidthIcon width={w} /> }))}
          />
        </Section>
      )}

      {(showShape || showLinear) && (
        <>
          <Section label="Stroke style">
            <Options
              value={strokeStyle}
              onChange={(v) => onChange({ strokeStyle: v })}
              options={[
                { value: 'solid', label: 'Solid', icon: <StrokeSolidIcon /> },
                { value: 'dashed', label: 'Dashed', icon: <StrokeDashedIcon /> },
                { value: 'dotted', label: 'Dotted', icon: <StrokeDottedIcon /> },
              ]}
            />
          </Section>
          <Section label="Sloppiness">
            <Options
              value={Math.round(roughness)}
              onChange={(v) => onChange({ roughness: v })}
              options={[
                { value: 0, label: 'Architect', icon: <SloppyArchitectIcon /> },
                { value: 1, label: 'Artist', icon: <SloppyArtistIcon /> },
                { value: 2, label: 'Cartoonist', icon: <SloppyCartoonistIcon /> },
              ]}
            />
          </Section>
        </>
      )}

      {(tool === 'rectangle' || tool === 'diamond' || anyKind(['Rectangle', 'Diamond'])) && (
        <Section label="Edges">
          <Options
            value={roundness}
            onChange={(v) => onChange({ roundness: v })}
            options={[
              { value: 'sharp', label: 'Sharp', icon: <EdgeSharpIcon /> },
              { value: 'round', label: 'Round', icon: <EdgeRoundIcon /> },
            ]}
          />
        </Section>
      )}

      {showText && (
        <>
          <Section label="Font family">
            <Options
              value={FONT_FAMILIES.find(([f]) => f === fontFamily)?.[0] ?? fontFamily}
              onChange={(v) => onChange({ fontFamily: v })}
              options={FONT_FAMILIES.map(([f, label]) => ({
                value: f,
                label,
                icon: <span style={{ fontFamily: f, fontSize: 15, fontWeight: 600 }}>Aa</span>,
              }))}
            />
          </Section>
          <Section label="Font size">
            <Options
              value={FONT_SIZES.reduce((a, b) => (Math.abs(b[0] - fontSize) < Math.abs(a[0] - fontSize) ? b : a))[0]}
              onChange={(v) => onChange({ fontSize: v })}
              options={FONT_SIZES.map(([s, label]) => ({ value: s, label: `${label} (${s}px)`, text: label }))}
            />
          </Section>
        </>
      )}

      {extra}

      {(strokeable || selecting) && (
        <Section label="Opacity">
          <div className="ae-range-row">
            <input
              className="ae-range"
              type="range"
              min={0}
              max={100}
              step={10}
              value={opacity}
              style={{ ['--ae-fill' as string]: `${opacity}%` }}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
              aria-label="Opacity"
            />
            <span style={{ width: 26, textAlign: 'right' }}>{opacity}</span>
          </div>
        </Section>
      )}

      {selecting && (
        <>
          <Section label="Layers">
            <div className="ae-options">
              <button type="button" className="ae-opt" title="Send to back" aria-label="Send to back" onClick={() => onLayer('back')}>
                <ToBackIcon />
              </button>
              <button type="button" className="ae-opt" title="Send backward" aria-label="Send backward" onClick={() => onLayer('backward')}>
                <BackwardIcon />
              </button>
              <button type="button" className="ae-opt" title="Bring forward" aria-label="Bring forward" onClick={() => onLayer('forward')}>
                <ForwardIcon />
              </button>
              <button type="button" className="ae-opt" title="Bring to front" aria-label="Bring to front" onClick={() => onLayer('front')}>
                <ToFrontIcon />
              </button>
            </div>
          </Section>
          <Section label="Actions">
            <div className="ae-options">
              <button type="button" className="ae-opt" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={onDuplicate}>
                <DuplicateIcon />
              </button>
              <button type="button" className="ae-opt" title="Delete" aria-label="Delete" onClick={onDelete} style={{ color: 'var(--ae-danger)' }}>
                <TrashIcon />
              </button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
