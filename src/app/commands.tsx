// ── Command palette entries ──────────────────────────────────────────────────
// Every action the palette offers, built from the app's real handlers so the
// palette never drifts from the menus and toolbar.

import type { PaletteCommand } from '../components/CommandPaletteModal';
import type { DesktopToolId } from '../lib/types';
import {
  BoardIcon,
  ClipboardIcon,
  DiagramIcon,
  ExportIcon,
  FileIcon,
  FullscreenIcon,
  HelpIcon,
  ImageIcon,
  LaserIcon,
  MagicPenIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  TranslateIcon,
  TrashIcon,
} from '../ui/icons';
import { MAIN_TOOLS } from '../ui/model';
import { MOD } from '../ui/primitives';
import { PEN_ICON, TOOL_ICONS } from '../ui/Toolbar';

export interface CommandHandlers {
  boards: Array<{ id: string; name: string }>;
  activeBoardId: string;
  isDarkMode: boolean;
  selectTool: (tool: DesktopToolId) => void;
  newBoard: () => void;
  switchBoard: (id: string) => void;
  openDiagram: () => void;
  openTranslator: () => void;
  openImage: () => void;
  openPdf: () => void;
  openFile?: () => void;
  pasteScreenshot: () => void;
  exportPng: () => void;
  exportSvg: () => void;
  exportAerial?: () => void;
  toggleFullscreen: () => void;
  toggleTheme: () => void;
  resetCanvas: () => void;
  showHelp: () => void;
  zoomToFit: () => void;
}

const PENS: Array<[DesktopToolId, string]> = [
  ['freedraw', 'Pen'],
  ['fountain', 'Brush'],
  ['marker', 'Marker'],
  ['highlighter', 'Highlighter'],
];

export function buildCommands(h: CommandHandlers): PaletteCommand[] {
  const tools: PaletteCommand[] = MAIN_TOOLS.filter((t) => t.id !== 'freedraw' && t.id !== 'image').map((t) => ({
    id: `tool-${t.id}`,
    label: t.label,
    group: 'Tools',
    icon: TOOL_ICONS[t.id],
    shortcut: t.key,
    keywords: 'tool',
    onSelect: () => h.selectTool(t.id as DesktopToolId),
  }));
  const pens: PaletteCommand[] = PENS.map(([id, label]) => ({
    id: `tool-${id}`,
    label,
    group: 'Tools',
    icon: PEN_ICON[id as keyof typeof PEN_ICON],
    shortcut: id === 'freedraw' ? 'P' : undefined,
    keywords: 'pen draw ink',
    onSelect: () => h.selectTool(id),
  }));
  return [
    ...tools,
    ...pens,
    { id: 'tool-laser', label: 'Laser pointer', group: 'Tools', icon: <LaserIcon />, shortcut: 'K', onSelect: () => h.selectTool('laser_pen') },
    { id: 'tool-magic', label: 'Magic pen (handwriting to text)', group: 'Tools', icon: <MagicPenIcon />, shortcut: 'W', onSelect: () => h.selectTool('magic_pen') },

    { id: 'ins-image', label: 'Insert image', group: 'Insert', icon: <ImageIcon />, shortcut: `${MOD}O`, onSelect: h.openImage },
    { id: 'ins-pdf', label: 'Insert PDF', group: 'Insert', icon: <FileIcon />, shortcut: `${MOD}⇧O`, onSelect: h.openPdf },
    { id: 'ins-paste', label: 'Paste screenshot', group: 'Insert', icon: <ClipboardIcon />, shortcut: `${MOD}V`, keywords: 'clipboard', onSelect: h.pasteScreenshot },
    { id: 'ins-diagram', label: 'Diagram from text', group: 'Insert', icon: <DiagramIcon />, keywords: 'mermaid flowchart sequence', onSelect: h.openDiagram },
    { id: 'ins-translate', label: 'Translate text', group: 'Insert', icon: <TranslateIcon />, keywords: 'language', onSelect: h.openTranslator },

    { id: 'board-new', label: 'New board', group: 'Boards', icon: <PlusIcon />, shortcut: `${MOD}N`, onSelect: h.newBoard },
    ...h.boards
      .filter((b) => b.id !== h.activeBoardId)
      .map((b) => ({ id: `board-${b.id}`, label: `Open ${b.name}`, group: 'Boards', icon: <BoardIcon />, keywords: 'switch board', onSelect: () => h.switchBoard(b.id) })),

    ...(h.openFile ? [{ id: 'file-open', label: 'Open .aerial file…', group: 'File', icon: <FileIcon />, keywords: 'import load', onSelect: h.openFile }] : []),
    ...(h.exportAerial ? [{ id: 'file-save', label: 'Save as .aerial file…', group: 'File', icon: <ExportIcon />, keywords: 'export download backup share', onSelect: h.exportAerial }] : []),
    { id: 'file-png', label: 'Export image (PNG)', group: 'File', icon: <ExportIcon />, shortcut: `${MOD}S`, keywords: 'png picture', onSelect: h.exportPng },
    { id: 'file-svg', label: 'Export SVG', group: 'File', icon: <ExportIcon />, shortcut: `${MOD}⇧S`, keywords: 'vector', onSelect: h.exportSvg },

    { id: 'view-theme', label: h.isDarkMode ? 'Switch to light theme' : 'Switch to dark theme', group: 'View', icon: h.isDarkMode ? <SunIcon /> : <MoonIcon />, keywords: 'dark light mode', onSelect: h.toggleTheme },
    { id: 'view-fit', label: 'Zoom to fit', group: 'View', icon: <FullscreenIcon />, shortcut: '⇧1', keywords: 'frame all content', onSelect: h.zoomToFit },
    { id: 'view-full', label: 'Toggle fullscreen', group: 'View', icon: <FullscreenIcon />, onSelect: h.toggleFullscreen },
    { id: 'help', label: 'Keyboard shortcuts', group: 'View', icon: <HelpIcon />, shortcut: '?', keywords: 'help keys', onSelect: h.showHelp },
    { id: 'reset', label: 'Reset the canvas', group: 'View', icon: <TrashIcon />, keywords: 'clear delete all', onSelect: h.resetCanvas },
  ];
}
