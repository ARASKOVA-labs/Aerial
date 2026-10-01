// ── Aerial Canvas Library — Public API ──────────────────────────────────────
// This is the library entry point. Import from 'aerial' or 'aerial/canvas'.

import './index.css';

export { AerialCanvas } from './components/AerialCanvas';
export { AerialDraggableTextBox } from './components/AerialDraggableTextBox';
export type { AerialDraggableTextBoxProps } from './components/AerialDraggableTextBox';
export {
  AerialToolbar,
  AerialZoomBar,
  AerialSettingsPopover,
  ToolBtn,
  DropdownToolBtn,
  AnimatedToolIcon,
  STROKE_COLORS,
} from './components/AerialToolbar';
export type {
  AerialCanvasProps,
  AerialCanvasRef,
  AerialEngine,
  ToolId,
  DesktopToolId,
  AerialToolbarProps,
  AerialZoomBarProps,
  AerialSettingsPopoverProps,
} from './lib/types';
export { Toolbar } from './ui/Toolbar';
export type { ExtraTool, ToolbarProps } from './ui/Toolbar';
export { PropertiesPanel } from './ui/PropertiesPanel';
export type { PropertiesPanelProps, StyleChange } from './ui/PropertiesPanel';
export { MainMenu, ZoomBar, HelpButton, WelcomeScreen } from './ui/Chrome';
export { MenuItem, MenuSeparator, MenuTitle, Popover } from './ui/primitives';
export { ColorPicker } from './ui/ColorPicker';
export * as AerialIcons from './ui/icons';
export { DEFAULT_UI_STYLE, themedColor } from './ui/model';
export type { UiStyle, SelectionInfo, PenTool } from './ui/model';
export { loadAerialEngine, resetWasmLoader } from './lib/wasm-loader';
export type { WasmLoaderOptions } from './lib/wasm-loader';
