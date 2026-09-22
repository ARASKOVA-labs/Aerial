// ── Aerial Canvas Library — Public API ──────────────────────────────────────
// This is the library entry point. Import from 'aerial' or 'aerial/canvas'.

import './index.css';

export { AerialCanvas } from './components/AerialCanvas';
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
export { loadAerialEngine, resetWasmLoader } from './lib/wasm-loader';
export type { WasmLoaderOptions } from './lib/wasm-loader';
