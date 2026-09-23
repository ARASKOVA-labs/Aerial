/* tslint:disable */
/* eslint-disable */

export class AerialCanvas {
    free(): void;
    [Symbol.dispose](): void;
    add_diagram(img: HTMLImageElement, x: number, y: number, w: number, h: number, code: string, svg: string, hit_map_str: string): void;
    add_image(img: HTMLImageElement, x: number, y: number, w: number, h: number, asset_id: string): void;
    add_text(text: string, x: number, y: number, size: number, font_family?: string | null, color?: string | null): void;
    apply_remote_delta(bytes: Uint8Array): void;
    check_and_clear_dirty(): boolean;
    clear_board(): void;
    clear_laser_strokes(): void;
    clear_magic_strokes(): void;
    delete_selected(): void;
    deselect(): void;
    export_delta_update(remote_sv: Uint8Array): Uint8Array;
    export_full_state(): Uint8Array;
    extract_magic_strokes(): string;
    get_accent_color(): string;
    get_element_at(raw_x: number, raw_y: number): string | undefined;
    get_element_code(id: bigint): string | undefined;
    get_eraser_type(): string;
    get_local_state_vector(): Uint8Array;
    get_scene_json(): string;
    get_selected_element_json(): string | undefined;
    get_selected_text(): string | undefined;
    get_zoom(): number;
    import_full_state(bytes: Uint8Array): void;
    load_scene_json(json: string): void;
    constructor(canvas_id: string);
    on_double_click(raw_x: number, raw_y: number): string | undefined;
    on_mouse_down(raw_x: number, raw_y: number): void;
    on_mouse_move(raw_x: number, raw_y: number): void;
    on_mouse_up(raw_x: number, raw_y: number): void;
    on_wheel(dx: number, dy: number, ctrl: boolean, sx: number, sy: number): number;
    process_incoming_packet(packet: Uint8Array): Uint8Array | undefined;
    redo(): boolean;
    render(): void;
    reset_view(): number;
    save_state(): void;
    scale_selected(factor: number): void;
    screen_to_world_x(sx: number): number;
    screen_to_world_y(sy: number): number;
    set_accent_color(color: string): void;
    set_background_color(color: string): void;
    set_cached_image(id: bigint, img: HTMLImageElement): void;
    set_dark_mode(is_dark: boolean): void;
    set_dpr(dpr: number): void;
    set_eraser_radius(r: number): void;
    set_eraser_type(t: string): void;
    set_fill_color(c: string): void;
    set_fountain_sharpness(s: number): void;
    set_grid_type(gtype: string): void;
    set_is_curved(curved: boolean): void;
    set_is_rough(rough: boolean): void;
    set_selected_id(id: bigint): void;
    set_stroke_color(c: string): void;
    set_stroke_width(w: number): void;
    set_tool_arrow(): void;
    set_tool_ellipse(): void;
    set_tool_eraser(): void;
    set_tool_fountain_pen(): void;
    set_tool_freedraw(): void;
    set_tool_hand(): void;
    set_tool_highlighter(): void;
    set_tool_laser_pen(): void;
    set_tool_line(): void;
    set_tool_magic_pen(): void;
    set_tool_rectangle(): void;
    set_tool_select(): void;
    set_tool_text(): void;
    /**
     * Returns true if there are still animations running (e.g. laser fade).
     */
    tick_animations(): boolean;
    undo(): boolean;
    update_selected_text(text: string): void;
    update_text_element(id: bigint, text: string, x: number, y: number, size: number, font_family?: string | null, color?: string | null): void;
    world_to_screen_x(wx: number): number;
    world_to_screen_y(wy: number): number;
    zoom_in(): number;
    zoom_out(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_aerialcanvas_free: (a: number, b: number) => void;
    readonly aerialcanvas_add_diagram: (a: number, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
    readonly aerialcanvas_add_image: (a: number, b: any, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly aerialcanvas_add_text: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly aerialcanvas_apply_remote_delta: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_check_and_clear_dirty: (a: number) => number;
    readonly aerialcanvas_clear_board: (a: number) => void;
    readonly aerialcanvas_clear_laser_strokes: (a: number) => void;
    readonly aerialcanvas_clear_magic_strokes: (a: number) => void;
    readonly aerialcanvas_delete_selected: (a: number) => void;
    readonly aerialcanvas_deselect: (a: number) => void;
    readonly aerialcanvas_export_delta_update: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_export_full_state: (a: number) => [number, number];
    readonly aerialcanvas_extract_magic_strokes: (a: number) => [number, number];
    readonly aerialcanvas_get_accent_color: (a: number) => [number, number];
    readonly aerialcanvas_get_element_at: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_get_element_code: (a: number, b: bigint) => [number, number];
    readonly aerialcanvas_get_eraser_type: (a: number) => [number, number];
    readonly aerialcanvas_get_local_state_vector: (a: number) => [number, number];
    readonly aerialcanvas_get_scene_json: (a: number) => [number, number];
    readonly aerialcanvas_get_selected_element_json: (a: number) => [number, number];
    readonly aerialcanvas_get_selected_text: (a: number) => [number, number];
    readonly aerialcanvas_get_zoom: (a: number) => number;
    readonly aerialcanvas_import_full_state: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_load_scene_json: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_new: (a: number, b: number) => [number, number, number];
    readonly aerialcanvas_on_double_click: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_on_mouse_down: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_on_mouse_move: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_on_mouse_up: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_on_wheel: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly aerialcanvas_process_incoming_packet: (a: number, b: number, c: number) => [number, number];
    readonly aerialcanvas_redo: (a: number) => number;
    readonly aerialcanvas_render: (a: number) => void;
    readonly aerialcanvas_reset_view: (a: number) => number;
    readonly aerialcanvas_save_state: (a: number) => void;
    readonly aerialcanvas_scale_selected: (a: number, b: number) => void;
    readonly aerialcanvas_screen_to_world_x: (a: number, b: number) => number;
    readonly aerialcanvas_screen_to_world_y: (a: number, b: number) => number;
    readonly aerialcanvas_set_accent_color: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_background_color: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_cached_image: (a: number, b: bigint, c: any) => void;
    readonly aerialcanvas_set_dark_mode: (a: number, b: number) => void;
    readonly aerialcanvas_set_dpr: (a: number, b: number) => void;
    readonly aerialcanvas_set_eraser_radius: (a: number, b: number) => void;
    readonly aerialcanvas_set_eraser_type: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_fill_color: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_fountain_sharpness: (a: number, b: number) => void;
    readonly aerialcanvas_set_grid_type: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_is_curved: (a: number, b: number) => void;
    readonly aerialcanvas_set_is_rough: (a: number, b: number) => void;
    readonly aerialcanvas_set_selected_id: (a: number, b: bigint) => void;
    readonly aerialcanvas_set_stroke_color: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_set_stroke_width: (a: number, b: number) => void;
    readonly aerialcanvas_set_tool_arrow: (a: number) => void;
    readonly aerialcanvas_set_tool_ellipse: (a: number) => void;
    readonly aerialcanvas_set_tool_eraser: (a: number) => void;
    readonly aerialcanvas_set_tool_fountain_pen: (a: number) => void;
    readonly aerialcanvas_set_tool_freedraw: (a: number) => void;
    readonly aerialcanvas_set_tool_hand: (a: number) => void;
    readonly aerialcanvas_set_tool_highlighter: (a: number) => void;
    readonly aerialcanvas_set_tool_laser_pen: (a: number) => void;
    readonly aerialcanvas_set_tool_line: (a: number) => void;
    readonly aerialcanvas_set_tool_magic_pen: (a: number) => void;
    readonly aerialcanvas_set_tool_rectangle: (a: number) => void;
    readonly aerialcanvas_set_tool_select: (a: number) => void;
    readonly aerialcanvas_set_tool_text: (a: number) => void;
    readonly aerialcanvas_tick_animations: (a: number) => number;
    readonly aerialcanvas_undo: (a: number) => number;
    readonly aerialcanvas_update_selected_text: (a: number, b: number, c: number) => void;
    readonly aerialcanvas_update_text_element: (a: number, b: bigint, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly aerialcanvas_world_to_screen_x: (a: number, b: number) => number;
    readonly aerialcanvas_world_to_screen_y: (a: number, b: number) => number;
    readonly aerialcanvas_zoom_in: (a: number) => number;
    readonly aerialcanvas_zoom_out: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
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
