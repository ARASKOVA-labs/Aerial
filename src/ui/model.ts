// ── UI model: tools, styles, palettes ────────────────────────────────────────

import type { ToolId } from '../lib/types';

export type PenTool = 'freedraw' | 'fountain' | 'marker' | 'highlighter';
export const PEN_TOOLS: PenTool[] = ['freedraw', 'fountain', 'marker', 'highlighter'];
export const SHAPE_TOOLS: ToolId[] = ['rectangle', 'diamond', 'ellipse'];
export const LINEAR_TOOLS: ToolId[] = ['arrow', 'line'];

export type FillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type Roundness = 'sharp' | 'round';
export type EraserMode = 'stroke' | 'precision';

/** Everything the properties panel edits. Persisted per user. */
export interface UiStyle {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  shapeWidth: number;
  penWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  roundness: Roundness;
  opacity: number;
  fontFamily: string;
  fontSize: number;
  highlighterColor: string;
  highlighterWidth: number;
  eraserMode: EraserMode;
  eraserSize: number;
  lastPen: PenTool;
}

export const DEFAULT_UI_STYLE: UiStyle = {
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'hachure',
  shapeWidth: 2,
  penWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  roundness: 'round',
  opacity: 100,
  fontFamily: 'Kalam, Caveat, cursive',
  fontSize: 24,
  highlighterColor: '#ffd43b',
  highlighterWidth: 3,
  eraserMode: 'stroke',
  eraserSize: 20,
  lastPen: 'freedraw',
};

export const STROKE_QUICK = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
export const BACKGROUND_QUICK = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'];
export const HIGHLIGHTER_QUICK = ['#ffd43b', '#69db7c', '#4dabf7', '#f783ac', '#ffa94d'];
export const CANVAS_BACKGROUNDS = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6'];

/** Open-color shades (light → dark), as in Excalidraw's picker. */
export const PALETTE: Array<[string, string[]]> = [
  ['Gray', ['#f8f9fa', '#e9ecef', '#ced4da', '#868e96', '#343a40']],
  ['Red', ['#ffc9c9', '#ff8787', '#fa5252', '#e03131', '#c92a2a']],
  ['Pink', ['#fcc2d7', '#f783ac', '#e64980', '#c2255c', '#a61e4d']],
  ['Grape', ['#eebefa', '#da77f2', '#be4bdb', '#9c36b5', '#862e9c']],
  ['Violet', ['#d0bfff', '#9775fa', '#7950f2', '#6741d9', '#5f3dc4']],
  ['Blue', ['#a5d8ff', '#4dabf7', '#228be6', '#1971c2', '#1864ab']],
  ['Cyan', ['#99e9f2', '#3bc9db', '#15aabf', '#0c8599', '#0b7285']],
  ['Teal', ['#96f2d7', '#38d9a9', '#12b886', '#099268', '#087f5b']],
  ['Green', ['#b2f2bb', '#69db7c', '#40c057', '#2f9e44', '#2b8a3e']],
  ['Yellow', ['#ffec99', '#ffd43b', '#fab005', '#f08c00', '#e67700']],
  ['Orange', ['#ffd8a8', '#ffa94d', '#fd7e14', '#e8590c', '#d9480f']],
];

export const SHAPE_WIDTHS: Array<[number, string]> = [[1, 'Thin'], [2, 'Bold'], [4, 'Extra bold']];
export const PEN_WIDTHS: Array<[number, string]> = [[1, 'Fine'], [2, 'Medium'], [3.5, 'Bold'], [6, 'Heavy']];
export const FONT_FAMILIES: Array<[string, string]> = [
  ['Kalam, Caveat, cursive', 'Hand-drawn'],
  ['Inter, ui-sans-serif, sans-serif', 'Normal'],
  ["'Space Mono', ui-monospace, monospace", 'Code'],
];
export const FONT_SIZES: Array<[number, string]> = [[16, 'S'], [24, 'M'], [32, 'L'], [44, 'XL']];

export interface ToolMeta {
  id: ToolId | 'image';
  label: string;
  /** Letter shortcut shown in the tooltip. */
  key?: string;
  /** Number shortcut shown on the button, Excalidraw-style. */
  num?: string;
}

/** Main toolbar, in Excalidraw's order. */
export const MAIN_TOOLS: ToolMeta[] = [
  { id: 'hand', label: 'Hand (panning tool)', key: 'H' },
  { id: 'select', label: 'Selection', key: 'V', num: '1' },
  { id: 'rectangle', label: 'Rectangle', key: 'R', num: '2' },
  { id: 'diamond', label: 'Diamond', key: 'D', num: '3' },
  { id: 'ellipse', label: 'Ellipse', key: 'O', num: '4' },
  { id: 'arrow', label: 'Arrow', key: 'A', num: '5' },
  { id: 'line', label: 'Line', key: 'L', num: '6' },
  { id: 'freedraw', label: 'Draw', key: 'P', num: '7' },
  { id: 'text', label: 'Text', key: 'T', num: '8' },
  { id: 'image', label: 'Insert image', num: '9' },
  { id: 'eraser', label: 'Eraser', key: 'E', num: '0' },
];

export const isPen = (t: string): t is PenTool => (PEN_TOOLS as string[]).includes(t);

/** Selection summary reported by the engine. */
export interface SelectionInfo {
  count: number;
  ids: number[];
  kinds: string[];
  style: null | {
    strokeColor: string;
    backgroundColor: string;
    fillStyle: FillStyle;
    strokeWidth: number;
    strokeStyle: StrokeStyle;
    roughness: number;
    roundness: Roundness;
    opacity: number;
    fontFamily: string;
    fontSize: number;
  };
  bounds: null | { x: number; y: number; w: number; h: number };
}

export const EMPTY_SELECTION: SelectionInfo = { count: 0, ids: [], kinds: [], style: null, bounds: null };

/**
 * TS twin of the engine's dark-mode colour transform
 * (`invert(93%) hue-rotate(180deg)`), so UI surfaces that show canvas colours
 * (paper behind the canvas, previews) match pixel for pixel.
 */
export function themedColor(color: string, isDark: boolean): string {
  const canonical = color.toLowerCase() === '#f8fafc' ? '#1e1e1e' : color;
  if (!isDark) return canonical;
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(canonical);
  if (!m) return canonical;
  let hex = m[1];
  if (hex.length <= 4) hex = hex.slice(0, 3).split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const inv = (c: number) => 0.93 - 0.86 * c;
  const [ri, gi, bi] = [inv(r), inv(g), inv(b)];
  const out = [
    -0.574 * ri + 1.43 * gi + 0.144 * bi,
    0.426 * ri + 0.43 * gi + 0.144 * bi,
    0.426 * ri + 1.43 * gi - 0.856 * bi,
  ].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}
