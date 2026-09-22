// ── Aerial Canvas Library — Shared Type Definitions ─────────────────────────
// These types are the public API surface for the embeddable <AerialCanvas />.

// ── Tool Identifiers ────────────────────────────────────────────────────────

/** Tools available in the core canvas component (library-safe, no Tauri deps) */
export type ToolId =
  | 'select'
  | 'freedraw'
  | 'fountain'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'hand'
  | 'highlighter'
  | 'text'
  | 'eraser'
  | 'laser_pen';

/** Extended tools available only in the desktop app (Tauri-dependent) */
export type DesktopToolId = ToolId | 'image' | 'pdf' | 'magic_pen';

// ── WASM Engine Interface ───────────────────────────────────────────────────

/** The raw WASM AerialCanvas engine API surface */
export interface AerialEngine {
  // Tool setters
  set_tool_freedraw: () => void;
  set_tool_rectangle: () => void;
  set_tool_ellipse: () => void;
  set_tool_line: () => void;
  set_tool_select: () => void;
  set_tool_hand: () => void;
  set_tool_arrow: () => void;
  set_tool_fountain_pen: () => void;
  set_tool_highlighter: () => void;
  set_tool_text: () => void;
  set_tool_eraser: () => void;
  set_tool_magic_pen: () => void;
  set_tool_laser_pen: () => void;

  // Text operations
  get_selected_text: () => string | null;
  update_selected_text: (text: string) => void;

  // Laser / magic
  clear_laser_strokes: () => void;
  extract_magic_strokes: () => string;

  // Image / Diagram
  add_image: (img: HTMLImageElement, x: number, y: number, w: number, h: number, assetId: string) => void;
  add_diagram: (img: HTMLImageElement, x: number, y: number, w: number, h: number, code: string, svg: string, hitMapStr: string) => void;
  set_cached_image: (id: bigint | number, img: HTMLImageElement) => void;

  // Serialization
  get_scene_json: () => string;
  load_scene_json: (json: string) => void;
  export_full_state: () => Uint8Array;
  import_full_state: (bytes: Uint8Array) => void;

  // Dirty tracking
  check_and_clear_dirty: () => boolean;

  // CRDT / Collaboration
  get_local_state_vector: () => Uint8Array;
  process_incoming_packet: (packet: Uint8Array) => Uint8Array | undefined;
  export_delta_update: (remote_sv: Uint8Array) => Uint8Array;
  apply_remote_delta: (bytes: Uint8Array) => void;

  // Environment
  set_dark_mode: (isDark: boolean) => void;
  set_grid_type: (gtype: string) => void;
  set_fountain_sharpness: (s: number) => void;

  // Coordinate conversion
  screen_to_world_x: (sx: number) => number;
  screen_to_world_y: (sy: number) => number;

  // Drawing primitives
  add_text: (text: string, x: number, y: number, size: number, font_family?: string, color?: string) => void;
  clear_board: () => void;
  set_stroke_color: (c: string) => void;
  set_fill_color: (c: string) => void;
  set_stroke_width: (w: number) => void;
  set_is_rough: (rough: boolean) => void;
  set_is_curved: (curved: boolean) => void;

  // Zoom / View
  zoom_in: () => number;
  zoom_out: () => number;
  reset_view: () => number;
  get_zoom: () => number;

  // Input events
  on_mouse_down: (raw_x: number, raw_y: number) => void;
  on_mouse_move: (raw_x: number, raw_y: number) => void;
  on_mouse_up: (raw_x: number, raw_y: number) => void;
  on_double_click: (raw_x: number, raw_y: number) => string | undefined;
  get_element_code: (id: bigint) => string | undefined;
  on_wheel: (dx: number, dy: number, ctrl: boolean, sx: number, sy: number) => number;

  // Element operations
  delete_selected: () => void;
  render: () => void;
  tick_animations: () => boolean;
  undo: () => boolean;
  redo: () => boolean;

  // Eraser
  set_eraser_radius: (r: number) => void;

  // DPR
  set_dpr: (dpr: number) => void;

  // Cleanup
  free?: () => void;
}

// ── Component Props ─────────────────────────────────────────────────────────

export interface AerialCanvasProps {
  /** Initial scene JSON from get_scene_json() */
  initialScene?: string;
  /** Initial full binary state (takes precedence over initialScene) */
  initialState?: Uint8Array;
  /** Callback fired whenever strokes or elements are updated */
  onChange?: (sceneJson: string) => void;
  /** Canvas color theme */
  theme?: 'dark' | 'light';
  /** If true, user cannot draw or modify the board */
  readOnly?: boolean;
  /** Whether to show built-in minimal brutalist floating toolbar (defaults to true) */
  showToolbar?: boolean;
  /** Custom class names for the container */
  className?: string;
  /** Callback when canvas engine has fully booted */
  onReady?: (api: AerialCanvasRef) => void;
  /** Override the base URL for aerial-engine WASM assets */
  wasmBasePath?: string;
  /** Interval in ms for dirty-checking and firing onChange (default: 500) */
  changeInterval?: number;
  /** Palm rejection toggle (only stylus/pen or mouse can draw; touch is pan only). Default: true */
  palmRejection?: boolean;
  /** Callback when zoom level changes */
  onZoomChange?: (zoomPercent: number) => void;
  /** Callback when a diagram node is double-clicked (for rename/re-render) */
  onNodeDoubleClick?: (elementId: bigint, nodeId: string, code?: string) => void;
}

// ── Imperative Ref API ──────────────────────────────────────────────────────

export interface AerialCanvasRef {
  /** Get the current scene as serialized JSON */
  getSceneJson: () => string;
  /** Load a scene from serialized JSON */
  loadSceneJson: (json: string) => void;
  /** Export full binary state (includes CRDT history) */
  exportFullState: () => Uint8Array;
  /** Import full binary state */
  importFullState: (bytes: Uint8Array) => void;
  /** Add a diagram element to the canvas */
  addDiagram: (code: string, svg: string) => void;
  /** Add a text element at world coordinates */
  addText: (text: string, x: number, y: number, size?: number, color?: string) => void;
  /** Export the visible canvas area as a PNG Blob */
  exportPngBlob: () => Promise<Blob>;
  /** Export the visible canvas area as an SVG string (canvas snapshot embedded) */
  exportSvgString: () => Promise<string>;
  /** Clear the entire board */
  clearBoard: () => void;
  /** Zoom in one step */
  zoomIn: () => void;
  /** Zoom out one step */
  zoomOut: () => void;
  /** Reset the view to default zoom and position */
  resetView: () => void;
  /** Get current zoom percentage */
  getZoom: () => number;
  /** Programmatically set the active drawing tool */
  setTool: (tool: ToolId) => void;
  /** Set stroke color */
  setStrokeColor: (color: string) => void;
  /** Set stroke width */
  setStrokeWidth: (width: number) => void;
  /** Undo last action */
  undo: () => void;
  /** Redo last undone action */
  redo: () => void;
  /** Delete currently selected element(s) */
  deleteSelected: () => void;
  /** Set dark/light mode on the engine */
  setDarkMode: (isDark: boolean) => void;
  /** Get a reference to the raw WASM engine (advanced use) */
  getEngine: () => AerialEngine | null;
  /** Add an image element at world coordinates */
  addImage: (img: HTMLImageElement, x: number, y: number, w: number, h: number, assetId: string) => void;
}

// ── Toolbar Props ───────────────────────────────────────────────────────────

export interface AerialToolbarProps {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  isHidden?: boolean;
  /** Called when "More Tools" overflow items are triggered */
  onMoreAction?: (action: string) => void;
}

export interface AerialZoomBarProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onUndo: () => void;
  onRedo: () => void;
  isHidden?: boolean;
}

export interface AerialSettingsPopoverProps {
  activeTool: ToolId;
  strokeColor: string;
  strokeWidth: number;
  eraserSize: number;
  fountainSharpness: number;
  isRough: boolean;
  isCurved: boolean;
  onChangeColor: (color: string) => void;
  onChangeWidth: (w: number) => void;
  onChangeEraserSize: (s: number) => void;
  onChangeSharpness: (s: number) => void;
  onChangeRough: (rough: boolean) => void;
  onChangeCurved: (curved: boolean) => void;
}
