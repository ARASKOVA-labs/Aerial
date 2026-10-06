// ── Main toolbar (top centre) ────────────────────────────────────────────────

import type { ReactNode } from 'react';
import type { ToolId } from '../lib/types';
import {
  ArrowIcon,
  BrushIcon,
  DiamondIcon,
  EllipseIcon,
  EraserIcon,
  HandIcon,
  HighlighterIcon,
  ImageIcon,
  LineIcon,
  LockIcon,
  MarkerIcon,
  MoreToolsIcon,
  PenIcon,
  RectangleIcon,
  SelectIcon,
  TextIcon,
  UnlockIcon,
} from './icons';
import { MAIN_TOOLS, isPen, type PenTool } from './model';
import { MenuItem, MenuSeparator, MenuTitle, Popover } from './primitives';

export interface ExtraTool {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  active?: boolean;
  /** Section heading in the "more tools" menu. */
  group?: string;
  onSelect: () => void;
}

export const PEN_ICON: Record<PenTool, ReactNode> = {
  freedraw: <PenIcon />,
  fountain: <BrushIcon />,
  marker: <MarkerIcon />,
  highlighter: <HighlighterIcon />,
};

export const TOOL_ICONS: Record<string, ReactNode> = {
  hand: <HandIcon />,
  select: <SelectIcon />,
  rectangle: <RectangleIcon />,
  diamond: <DiamondIcon />,
  ellipse: <EllipseIcon />,
  arrow: <ArrowIcon />,
  line: <LineIcon />,
  text: <TextIcon />,
  image: <ImageIcon />,
  eraser: <EraserIcon />,
};

export interface ToolbarProps {
  activeTool: ToolId;
  lastPen: PenTool;
  locked: boolean;
  onToggleLock: () => void;
  onSelectTool: (id: ToolId) => void;
  onInsertImage: () => void;
  extraTools: ExtraTool[];
}

export function Toolbar({ activeTool, lastPen, locked, onToggleLock, onSelectTool, onInsertImage, extraTools }: ToolbarProps) {
  const extraActive = extraTools.some((t) => t.active);
  const groups = Array.from(new Set(extraTools.map((t) => t.group ?? '')));

  return (
    <div className="ae-island" role="toolbar" aria-label="Tools">
      <button
        type="button"
        className="ae-btn ae-tip"
        aria-pressed={locked}
        data-tip={locked ? 'Unlock tool (Q)' : 'Keep selected tool active after drawing (Q)'}
        onClick={onToggleLock}
      >
        {locked ? <LockIcon /> : <UnlockIcon />}
      </button>
      <div className="ae-divider" />
      {MAIN_TOOLS.map((t) => {
        const isDraw = t.id === 'freedraw';
        const active = isDraw ? isPen(activeTool) : activeTool === t.id;
        const icon = isDraw ? PEN_ICON[isPen(activeTool) ? activeTool : lastPen] : TOOL_ICONS[t.id];
        const keyHint = [t.key, t.num].filter(Boolean).join(' or ');
        return (
          <button
            key={t.id}
            type="button"
            className="ae-btn ae-tip"
            aria-pressed={active}
            aria-label={t.label}
            data-tip={keyHint ? `${t.label} — ${keyHint}` : t.label}
            onClick={() => {
              if (t.id === 'image') onInsertImage();
              else if (isDraw) onSelectTool(isPen(activeTool) ? activeTool : lastPen);
              else onSelectTool(t.id as ToolId);
            }}
          >
            {icon}
            {t.num && <span className="ae-btn__key">{t.num}</span>}
          </button>
        );
      })}
      {extraTools.length > 0 && (
        <>
          <div className="ae-divider" />
          <Popover
            trigger={({ open, toggle }) => (
              <button
                type="button"
                className="ae-btn ae-tip"
                aria-pressed={open || extraActive}
                aria-haspopup="menu"
                data-tip="More tools"
                onClick={toggle}
              >
                <MoreToolsIcon />
              </button>
            )}
          >
            {(close) => (
              <div className="ae-menu" role="menu" style={{ minWidth: 232 }}>
                {groups.map((g, gi) => (
                  <div key={g || gi}>
                    {gi > 0 && <MenuSeparator />}
                    {g && <MenuTitle>{g}</MenuTitle>}
                    {extraTools
                      .filter((t) => (t.group ?? '') === g)
                      .map((t) => (
                        <MenuItem
                          key={t.id}
                          icon={t.icon}
                          label={t.label}
                          hint={t.shortcut}
                          current={t.active}
                          onSelect={() => {
                            t.onSelect();
                            close();
                          }}
                        />
                      ))}
                  </div>
                ))}
              </div>
            )}
          </Popover>
        </>
      )}
    </div>
  );
}
