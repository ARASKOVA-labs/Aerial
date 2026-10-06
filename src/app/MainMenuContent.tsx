// ── Main menu (top-left): boards, files, view and canvas preferences ─────────

import { useState } from 'react';
import { ColorPicker } from '../ui/ColorPicker';
import {
  BoardIcon,
  ChatIcon,
  CheckIcon,
  CloseIcon,
  CommandIcon,
  EditIcon,
  ExportIcon,
  FileIcon,
  FullscreenIcon,
  GridIcon,
  HelpIcon,
  ImageIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  TrashIcon,
} from '../ui/icons';
import { CANVAS_BACKGROUNDS } from '../ui/model';
import { MenuItem, MenuSeparator, MenuTitle, MOD } from '../ui/primitives';
import type { GridType, UseBoards } from './useBoards';

export interface MainMenuActions {
  openImage: () => void;
  openFile: () => void;
  saveFile: () => void;
  exportPng: () => void;
  exportSvg: () => void;
  openPalette: () => void;
  toggleFullscreen: () => void;
  showHelp: () => void;
  resetCanvas: () => void;
  sendFeedback: () => void;
}

const GRID_LABEL: Record<GridType, string> = { blank: 'Off', dots: 'Dots', lines: 'Lines' };
const NEXT_GRID: Record<GridType, GridType> = { blank: 'dots', dots: 'lines', lines: 'blank' };

function BoardList({ boards, close }: { boards: UseBoards; close: () => void }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const commit = () => {
    if (renaming) boards.renameBoard(renaming, draft);
    setRenaming(null);
  };
  return (
    <>
      {boards.boards.map((b) =>
        renaming === b.id ? (
          <div key={b.id} className="ae-menu-row">
            <input
              className="ae-input"
              autoFocus
              value={draft}
              aria-label="Board name"
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={commit}
            />
          </div>
        ) : (
          <div key={b.id} className="ae-menu-board">
            <MenuItem
              icon={<BoardIcon />}
              label={b.name}
              current={b.id === boards.activeBoardId}
              onSelect={() => {
                void boards.switchBoard(b.id);
                close();
              }}
            />
            {b.id === boards.activeBoardId && (
              <span className="ae-menu-board__actions">
                <button
                  type="button"
                  className="ae-btn ae-btn--sm"
                  aria-label="Rename board"
                  title="Rename"
                  onClick={() => {
                    setDraft(b.name);
                    setRenaming(b.id);
                  }}
                >
                  <EditIcon />
                </button>
                {boards.boards.length > 1 && (
                  <button type="button" className="ae-btn ae-btn--sm" aria-label="Delete board" title="Delete" onClick={() => void boards.deleteBoard(b.id)}>
                    <TrashIcon />
                  </button>
                )}
              </span>
            )}
          </div>
        ),
      )}
    </>
  );
}

export function MainMenuContent({
  close,
  boards,
  actions,
  isDarkMode,
  onThemeChange,
  canvasBg,
  onCanvasBg,
  gridType,
  onGridType,
  palmRejection,
  onPalmRejection,
}: {
  close: () => void;
  boards: UseBoards;
  actions: MainMenuActions;
  isDarkMode: boolean;
  onThemeChange: (dark: boolean) => void;
  canvasBg: string;
  onCanvasBg: (color: string) => void;
  gridType: GridType;
  onGridType: (g: GridType) => void;
  palmRejection: boolean;
  onPalmRejection: (on: boolean) => void;
}) {
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <>
      <MenuTitle
        action={
          <button type="button" className="ae-btn ae-btn--sm ae-tip ae-tip--right" data-tip={`New board — ${MOD}N`} aria-label="New board" onClick={() => void boards.createBoard()}>
            <PlusIcon />
          </button>
        }
      >
        Boards
      </MenuTitle>
      <BoardList boards={boards} close={close} />
      <MenuSeparator />
      <MenuItem icon={<FileIcon />} label="Open .aerial file…" hint={`${MOD}⇧E`} onSelect={run(actions.openFile)} />
      <MenuItem icon={<ExportIcon />} label="Save as .aerial file…" hint={`${MOD}E`} onSelect={run(actions.saveFile)} />
      <MenuItem icon={<ImageIcon />} label="Insert image…" hint={`${MOD}O`} onSelect={run(actions.openImage)} />
      <MenuItem icon={<ExportIcon />} label="Export image (PNG)…" hint={`${MOD}S`} onSelect={run(actions.exportPng)} />
      <MenuItem icon={<ExportIcon />} label="Export SVG…" hint={`${MOD}⇧S`} onSelect={run(actions.exportSvg)} />
      <MenuSeparator />
      <MenuItem icon={<CommandIcon />} label="Command palette" hint={`${MOD}K`} onSelect={run(actions.openPalette)} />
      <MenuItem icon={<FullscreenIcon />} label="Toggle fullscreen" onSelect={run(actions.toggleFullscreen)} />
      <MenuItem icon={<HelpIcon />} label="Help" hint="?" onSelect={run(actions.showHelp)} />
      <MenuItem icon={<TrashIcon />} label="Reset the canvas" danger onSelect={run(actions.resetCanvas)} />
      <MenuSeparator />
      <MenuItem icon={<ChatIcon />} label="Send feedback" onSelect={run(actions.sendFeedback)} />
      <MenuSeparator />
      <div className="ae-menu-row" style={{ justifyContent: 'space-between' }}>
        <span className="ae-menu-label">Theme</span>
        <div className="ae-options" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" className="ae-opt" aria-checked={!isDarkMode} aria-pressed={!isDarkMode} aria-label="Light" title="Light" onClick={() => onThemeChange(false)}>
            <SunIcon />
          </button>
          <button type="button" role="radio" className="ae-opt" aria-checked={isDarkMode} aria-pressed={isDarkMode} aria-label="Dark" title="Dark" onClick={() => onThemeChange(true)}>
            <MoonIcon />
          </button>
        </div>
      </div>
      <MenuTitle>Canvas background</MenuTitle>
      <div className="ae-menu-row">
        <ColorPicker value={canvasBg} quick={CANVAS_BACKGROUNDS} shadeIndex={0} onChange={onCanvasBg} />
      </div>
      <MenuItem icon={<GridIcon />} label="Grid" hint={GRID_LABEL[gridType]} onSelect={() => onGridType(NEXT_GRID[gridType])} />
      <MenuItem icon={palmRejection ? <CheckIcon /> : <CloseIcon />} label="Palm rejection" hint={palmRejection ? 'On' : 'Off'} onSelect={() => onPalmRejection(!palmRejection)} />
    </>
  );
}
