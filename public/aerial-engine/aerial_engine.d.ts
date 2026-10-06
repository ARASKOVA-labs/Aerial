/* tslint:disable */
/* eslint-disable */

export class AerialCanvas {
    free(): void;
    [Symbol.dispose](): void;
    add_diagram(img: HTMLImageElement, x: number, y: number, w: number, h: number, code: string, svg: string, hit_map_str: string): void;
    /**
     * Adds elements (a JSON array of partial elements; omitted fields take
     * defaults, ids are assigned). Returns a JSON array with the new id of
     * each element, or null where it was rejected by validation.
     */
    add_elements_json(json: string): string;
    add_image(img: HTMLImageElement, x: number, y: number, w: number, h: number, asset_id: string): void;
    add_text(text: string, x: number, y: number, size: number, font_family?: string | null, color?: string | null): void;
    apply_remote_delta(bytes: Uint8Array): void;
    /**
     * Updates the drawing style with the fields present in `json` and applies
     * them to every selected element (one undo step).
     */
    apply_style(json: string): void;
    /**
     * Source (a data URL for stored assets) of the image cached for an element,
     * so a board can be exported with its images even where there is no store.
     */
    cached_image_src(id: bigint): string | undefined;
    can_redo(): boolean;
    can_undo(): boolean;
    /**
     * Deprecated: returns whether the scene changed since the last call.
     * Prefer `scene_version()`, which supports multiple independent readers.
     */
    check_and_clear_dirty(): boolean;
    clear_board(): void;
    clear_laser_strokes(): void;
    clear_magic_strokes(): void;
    /**
     * Bounds of everything on the board, `[min_x, min_y, max_x, max_y]` in
     * world units, or an empty array for an empty board.
     */
    content_bounds(): Float64Array;
    /**
     * Deletes elements by id (a JSON array), as one undo step. Returns how many were removed.
     */
    delete_elements_json(ids_json: string): number;
    delete_selected(): void;
    deselect(): void;
    /**
     * Copies the selection 10px down-right and selects the copies.
     */
    duplicate_selected(): void;
    element_count(): number;
    export_delta_update(remote_sv: Uint8Array): Uint8Array;
    export_full_state(): Uint8Array;
    extract_magic_strokes(): string;
    get_accent_color(): string;
    /**
     * `[[element_id, asset_id], ...]` for elements backed by stored assets, so
     * the host can preload images without parsing the whole scene JSON.
     */
    get_asset_refs(): string;
    /**
     * CSS cursor for the select tool at a screen point.
     */
    get_cursor(raw_x: number, raw_y: number): string;
    get_element_at(raw_x: number, raw_y: number): string | undefined;
    get_element_code(id: bigint): string | undefined;
    get_eraser_type(): string;
    get_local_state_vector(): Uint8Array;
    /**
     * Render statistics as JSON (for perf HUDs and benchmarks).
     */
    get_render_stats(): string;
    get_scene_json(): string;
    /**
     * The first selected element (single-selection API).
     */
    get_selected_element_json(): string | undefined;
    get_selected_text(): string | undefined;
    /**
     * `{count, ids (≤1000), kinds, style, bounds}` for the selection, bounds
     * in screen (CSS) pixels.
     */
    get_selection_info(): string;
    get_style(): string;
    get_zoom(): number;
    has_pending_changes(): boolean;
    /**
     * Hides an element from rendering (used while its text is edited inline).
     */
    hide_element(id: bigint): void;
    import_full_state(bytes: Uint8Array): void;
    /**
     * Number of elements dropped by validation in the last `load_scene_json`.
     */
    last_load_rejected(): number;
    /**
     * Replaces the board. Input is untrusted: malformed JSON is ignored and
     * invalid elements are dropped (see `last_load_rejected`).
     */
    load_scene_json(json: string): void;
    /**
     * Moves elements by (dx, dy) world units, as one undo step.
     */
    move_elements_json(ids_json: string, dx: number, dy: number): number;
    constructor(canvas_id: string);
    /**
     * Moves the selection by (dx, dy) world units as one undo step.
     */
    nudge_selected(dx: number, dy: number): void;
    on_double_click(raw_x: number, raw_y: number): string | undefined;
    on_mouse_down(raw_x: number, raw_y: number): void;
    on_mouse_move(raw_x: number, raw_y: number): void;
    on_mouse_up(raw_x: number, raw_y: number): void;
    on_wheel(dx: number, dy: number, ctrl: boolean, sx: number, sy: number): number;
    /**
     * Pointer down with pen pressure (0..1), or a negative value when the
     * device reports none (mouse) — pressure is then simulated from speed.
     */
    pointer_down(raw_x: number, raw_y: number, pressure: number): void;
    pointer_move(raw_x: number, raw_y: number, pressure: number): void;
    pointer_up(raw_x: number, raw_y: number): void;
    process_incoming_packet(packet: Uint8Array): Uint8Array | undefined;
    redo(): boolean;
    render(): void;
    /**
     * Layer order: `"front"`, `"back"`, `"forward"`, `"backward"`.
     */
    reorder_selected(action: string): void;
    reset_view(): number;
    /**
     * Deprecated no-op kept for API compatibility. Every mutating engine call
     * now records its own undo transaction.
     */
    save_state(): void;
    scale_selected(factor: number): void;
    /**
     * Monotonic scene revision. Each consumer stores the last value it
     * handled; unlike `check_and_clear_dirty` it is safe with many consumers.
     */
    scene_version(): number;
    screen_to_world_x(sx: number): number;
    screen_to_world_y(sy: number): number;
    select_all(): void;
    /**
     * Replaces the selection with the ids in a JSON array.
     */
    select_ids(json: string): void;
    /**
     * Bumped whenever the selection changes; JS polls it to refresh panels.
     */
    selection_version(): number;
    set_accent_color(color: string): void;
    /**
     * Canonical (light-theme) paper colour; shown transformed in dark mode.
     */
    set_background_color(color: string): void;
    set_cached_image(id: bigint, img: HTMLImageElement): void;
    /**
     * Dark mode re-colours every element through the theme transform; stored
     * colours never change, so switching back is lossless.
     */
    set_dark_mode(is_dark: boolean): void;
    set_dpr(dpr: number): void;
    set_eraser_radius(r: number): void;
    set_eraser_size(s: number): void;
    set_eraser_type(t: string): void;
    set_fill_color(c: string): void;
    /**
     * Kept for API compatibility; the brush shape is now pressure-driven.
     */
    set_fountain_sharpness(_s: number): void;
    set_grid_type(gtype: string): void;
    set_is_curved(curved: boolean): void;
    set_is_rough(rough: boolean): void;
    /**
     * Size (CSS px) below which content is drawn as density blocks when
     * zoomed out. 0 disables level-of-detail aggregation.
     */
    set_lod_threshold(px: number): void;
    /**
     * Modifier keys: Shift constrains shapes (square / 15° lines) and extends
     * selections; Alt draws shapes from the centre and restores while erasing.
     */
    set_modifiers(shift: boolean, alt: boolean): void;
    set_selected_id(id: bigint): void;
    set_stroke_color(c: string): void;
    set_stroke_width(w: number): void;
    set_tool_arrow(): void;
    set_tool_diamond(): void;
    set_tool_ellipse(): void;
    set_tool_eraser(): void;
    set_tool_fountain_pen(): void;
    set_tool_freedraw(): void;
    set_tool_hand(): void;
    set_tool_highlighter(): void;
    set_tool_laser_pen(): void;
    set_tool_line(): void;
    /**
     * When locked, drawing a shape keeps the tool instead of switching to
     * selection (Excalidraw's lock, `Q`).
     */
    set_tool_locked(locked: boolean): void;
    set_tool_magic_pen(): void;
    set_tool_marker(): void;
    set_tool_rectangle(): void;
    set_tool_select(): void;
    set_tool_text(): void;
    show_all_elements(): void;
    /**
     * Drains changes since the previous call as
     * `{"reset":bool,"upserts":[Element],"deletes":[id]}` — O(changed), so
     * autosave cost no longer grows with board size.
     */
    take_changes(): string;
    /**
     * The tool the engine switched to on its own since the last call
     * (`"select"` after drawing a shape while unlocked), if any.
     */
    take_tool_switch(): string | undefined;
    /**
     * Called every animation frame. Renders only when something changed.
     * Returns true while animations (laser fade, eraser trail) run.
     */
    tick_animations(): boolean;
    undo(): boolean;
    /**
     * Merges field patches into existing elements (`[{ "id": 7, "x": 10, ... }]`).
     * Returns the ids that were updated and are still valid.
     */
    update_elements_json(json: string): string;
    update_selected_text(text: string): void;
    update_text_element(id: bigint, text: string, x: number, y: number, size: number, font_family?: string | null, color?: string | null): void;
    world_to_screen_x(wx: number): number;
    world_to_screen_y(wy: number): number;
    zoom_in(): number;
    zoom_out(): number;
    /**
     * Frames the whole board with `padding` CSS px on every side, never
     * zooming in past 100%. Returns the new zoom (unchanged on an empty board).
     */
    zoom_to_fit(padding: number): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_aerialcanvas_free: (a: number, b: number) => void;
    readonly aerialcanvas_add_diagram: (a: number, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
    readonly aerialcanvas_add_elements_json: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_add_image: (a: number, b: any, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly aerialcanvas_add_text: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly aerialcanvas_apply_remote_delta: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_apply_style: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_cached_image_src: (a: number, b: bigint) => [number, number];
    readonly aerialcanvas_can_redo: (a: number) => number;
    readonly aerialcanvas_can_undo: (a: number) => number;
    readonly aerialcanvas_check_and_clear_dirty: (a: number) => number;
    readonly aerialcanvas_clear_board: (a: number) => void;
    readonly aerialcanvas_clear_laser_strokes: (a: number) => void;
    readonly aerialcanvas_clear_magic_strokes: (a: number) => void;
    readonly aerialcanvas_content_bounds: (a: number) => [number, number];
    readonly aerialcanvas_delete_elements_json: (a: number, b: number, c: number) => number;
    readonly aerialcanvas_delete_selected: (a: number) => void;
    readonly aerialcanvas_deselect: (a: number) => void;
    readonly aerialcanvas_duplicate_selected: (a: number) => void;
    readonly aerialcanvas_element_count: (a: number) => number;
    readonly aerialcanvas_export_delta_update: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_export_full_state: (a: number) => [number, number];
    readonly aerialcanvas_extract_magic_strokes: (a: number) => [number, number];
    readonly aerialcanvas_get_accent_color: (a: number) => [number, number];
    readonly aerialcanvas_get_asset_refs: (a: number) => [number, number];
    readonly aerialcanvas_get_cursor: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_get_element_at: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_get_element_code: (a: number, b: bigint) => [number, number];
    readonly aerialcanvas_get_eraser_type: (a: number) => [number, number];
    readonly aerialcanvas_get_local_state_vector: (a: number) => [number, number];
    readonly aerialcanvas_get_render_stats: (a: number) => [number, number];
    readonly aerialcanvas_get_scene_json: (a: number) => [number, number];
    readonly aerialcanvas_get_selected_element_json: (a: number) => [number, number];
    readonly aerialcanvas_get_selected_text: (a: number) => [number, number];
    readonly aerialcanvas_get_selection_info: (a: number) => [number, number];
    readonly aerialcanvas_get_style: (a: number) => [number, number];
    readonly aerialcanvas_get_zoom: (a: number) => number;
    readonly aerialcanvas_has_pending_changes: (a: number) => number;
    readonly aerialcanvas_hide_element: (a: number, b: bigint) => void;
    readonly aerialcanvas_import_full_state: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_last_load_rejected: (a: number) => number;
    readonly aerialcanvas_load_scene_json: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_move_elements_json: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly aerialcanvas_new: (a: number, b: number) => [number, number, number];
    readonly aerialcanvas_nudge_selected: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_on_double_click: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_on_mouse_down: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_on_mouse_move: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_on_mouse_up: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_on_wheel: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly aerialcanvas_pointer_down: (a: number, b: number, c: number, d: number) => void;
    readonly aerialcanvas_pointer_move: (a: number, b: number, c: number, d: number) => void;
    readonly aerialcanvas_process_incoming_packet: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_redo: (a: number) => number;
    readonly aerialcanvas_render: (a: number) => void;
    readonly aerialcanvas_reorder_selected: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_reset_view: (a: number) => number;
    readonly aerialcanvas_save_state: (a: number) => void;
    readonly aerialcanvas_scale_selected: (a: number, b: number) => void;
    readonly aerialcanvas_scene_version: (a: number) => number;
    readonly aerialcanvas_screen_to_world_x: (a: number, b: number) => number;
    readonly aerialcanvas_screen_to_world_y: (a: number, b: number) => number;
    readonly aerialcanvas_select_all: (a: number) => void;
    readonly aerialcanvas_select_ids: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_selection_version: (a: number) => number;
    readonly aerialcanvas_set_accent_color: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_background_color: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_cached_image: (a: number, b: bigint, c: any) => void;
    readonly aerialcanvas_set_dark_mode: (a: number, b: number) => void;
    readonly aerialcanvas_set_dpr: (a: number, b: number) => void;
    readonly aerialcanvas_set_eraser_radius: (a: number, b: number) => void;
    readonly aerialcanvas_set_eraser_size: (a: number, b: number) => void;
    readonly aerialcanvas_set_eraser_type: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_fill_color: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_fountain_sharpness: (a: number, b: number) => void;
    readonly aerialcanvas_set_grid_type: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_is_curved: (a: number, b: number) => void;
    readonly aerialcanvas_set_is_rough: (a: number, b: number) => void;
    readonly aerialcanvas_set_lod_threshold: (a: number, b: number) => void;
    readonly aerialcanvas_set_modifiers: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_selected_id: (a: number, b: bigint) => void;
    readonly aerialcanvas_set_stroke_color: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_stroke_width: (a: number, b: number) => void;
    readonly aerialcanvas_set_tool_arrow: (a: number) => void;
    readonly aerialcanvas_set_tool_diamond: (a: number) => void;
    readonly aerialcanvas_set_tool_ellipse: (a: number) => void;
    readonly aerialcanvas_set_tool_eraser: (a: number) => void;
    readonly aerialcanvas_set_tool_fountain_pen: (a: number) => void;
    readonly aerialcanvas_set_tool_freedraw: (a: number) => void;
    readonly aerialcanvas_set_tool_hand: (a: number) => void;
    readonly aerialcanvas_set_tool_highlighter: (a: number) => void;
    readonly aerialcanvas_set_tool_laser_pen: (a: number) => void;
    readonly aerialcanvas_set_tool_line: (a: number) => void;
    readonly aerialcanvas_set_tool_locked: (a: number, b: number) => void;
    readonly aerialcanvas_set_tool_magic_pen: (a: number) => void;
    readonly aerialcanvas_set_tool_marker: (a: number) => void;
    readonly aerialcanvas_set_tool_rectangle: (a: number) => void;
    readonly aerialcanvas_set_tool_select: (a: number) => void;
    readonly aerialcanvas_set_tool_text: (a: number) => void;
    readonly aerialcanvas_show_all_elements: (a: number) => void;
    readonly aerialcanvas_take_changes: (a: number) => [number, number];
    readonly aerialcanvas_take_tool_switch: (a: number) => [number, number];
    readonly aerialcanvas_tick_animations: (a: number) => number;
    readonly aerialcanvas_undo: (a: number) => number;
    readonly aerialcanvas_update_elements_json: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_update_selected_text: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_update_text_element: (a: number, b: bigint, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly aerialcanvas_world_to_screen_x: (a: number, b: number) => number;
    readonly aerialcanvas_world_to_screen_y: (a: number, b: number) => number;
    readonly aerialcanvas_zoom_in: (a: number) => number;
    readonly aerialcanvas_zoom_out: (a: number) => number;
    readonly aerialcanvas_zoom_to_fit: (a: number, b: number) => number;
    readonly aerialcanvas_pointer_up: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
