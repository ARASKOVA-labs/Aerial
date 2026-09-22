/* @ts-self-types="./aerial_engine.d.ts" */

export class AerialCanvas {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AerialCanvasFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_aerialcanvas_free(ptr, 0);
    }
    /**
     * @param {HTMLImageElement} img
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {string} code
     * @param {string} svg
     * @param {string} hit_map_str
     */
    add_diagram(img, x, y, w, h, code, svg, hit_map_str) {
        const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(svg, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(hit_map_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_add_diagram(this.__wbg_ptr, img, x, y, w, h, ptr0, len0, ptr1, len1, ptr2, len2);
    }
    /**
     * @param {HTMLImageElement} img
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {string} asset_id
     */
    add_image(img, x, y, w, h, asset_id) {
        const ptr0 = passStringToWasm0(asset_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_add_image(this.__wbg_ptr, img, x, y, w, h, ptr0, len0);
    }
    /**
     * @param {string} text
     * @param {number} x
     * @param {number} y
     * @param {number} size
     * @param {string | null} [font_family]
     * @param {string | null} [color]
     */
    add_text(text, x, y, size, font_family, color) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(font_family) ? 0 : passStringToWasm0(font_family, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(color) ? 0 : passStringToWasm0(color, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len2 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_add_text(this.__wbg_ptr, ptr0, len0, x, y, size, ptr1, len1, ptr2, len2);
    }
    /**
     * @param {Uint8Array} bytes
     */
    apply_remote_delta(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_apply_remote_delta(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {boolean}
     */
    check_and_clear_dirty() {
        const ret = wasm.aerialcanvas_check_and_clear_dirty(this.__wbg_ptr);
        return ret !== 0;
    }
    clear_board() {
        wasm.aerialcanvas_clear_board(this.__wbg_ptr);
    }
    clear_laser_strokes() {
        wasm.aerialcanvas_clear_laser_strokes(this.__wbg_ptr);
    }
    delete_selected() {
        wasm.aerialcanvas_delete_selected(this.__wbg_ptr);
    }
    /**
     * @param {Uint8Array} remote_sv
     * @returns {Uint8Array}
     */
    export_delta_update(remote_sv) {
        const ptr0 = passArray8ToWasm0(remote_sv, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.aerialcanvas_export_delta_update(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @returns {Uint8Array}
     */
    export_full_state() {
        const ret = wasm.aerialcanvas_export_full_state(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    extract_magic_strokes() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aerialcanvas_extract_magic_strokes(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {bigint} id
     * @returns {string | undefined}
     */
    get_element_code(id) {
        const ret = wasm.aerialcanvas_get_element_code(this.__wbg_ptr, id);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get_local_state_vector() {
        const ret = wasm.aerialcanvas_get_local_state_vector(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    get_scene_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aerialcanvas_get_scene_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string | undefined}
     */
    get_selected_text() {
        const ret = wasm.aerialcanvas_get_selected_text(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {number}
     */
    get_zoom() {
        const ret = wasm.aerialcanvas_get_zoom(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Uint8Array} bytes
     */
    import_full_state(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_import_full_state(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} json
     */
    load_scene_json(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_load_scene_json(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} canvas_id
     */
    constructor(canvas_id) {
        const ptr0 = passStringToWasm0(canvas_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.aerialcanvas_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        AerialCanvasFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} raw_x
     * @param {number} raw_y
     * @returns {string | undefined}
     */
    on_double_click(raw_x, raw_y) {
        const ret = wasm.aerialcanvas_on_double_click(this.__wbg_ptr, raw_x, raw_y);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {number} raw_x
     * @param {number} raw_y
     */
    on_mouse_down(raw_x, raw_y) {
        wasm.aerialcanvas_on_mouse_down(this.__wbg_ptr, raw_x, raw_y);
    }
    /**
     * @param {number} raw_x
     * @param {number} raw_y
     */
    on_mouse_move(raw_x, raw_y) {
        wasm.aerialcanvas_on_mouse_move(this.__wbg_ptr, raw_x, raw_y);
    }
    /**
     * @param {number} raw_x
     * @param {number} raw_y
     */
    on_mouse_up(raw_x, raw_y) {
        wasm.aerialcanvas_on_mouse_up(this.__wbg_ptr, raw_x, raw_y);
    }
    /**
     * @param {number} dx
     * @param {number} dy
     * @param {boolean} ctrl
     * @param {number} sx
     * @param {number} sy
     * @returns {number}
     */
    on_wheel(dx, dy, ctrl, sx, sy) {
        const ret = wasm.aerialcanvas_on_wheel(this.__wbg_ptr, dx, dy, ctrl, sx, sy);
        return ret;
    }
    /**
     * @param {Uint8Array} packet
     * @returns {Uint8Array | undefined}
     */
    process_incoming_packet(packet) {
        const ptr0 = passArray8ToWasm0(packet, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.aerialcanvas_process_incoming_packet(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @returns {boolean}
     */
    redo() {
        const ret = wasm.aerialcanvas_redo(this.__wbg_ptr);
        return ret !== 0;
    }
    render() {
        wasm.aerialcanvas_render(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    reset_view() {
        const ret = wasm.aerialcanvas_reset_view(this.__wbg_ptr);
        return ret;
    }
    save_state() {
        wasm.aerialcanvas_save_state(this.__wbg_ptr);
    }
    /**
     * @param {number} sx
     * @returns {number}
     */
    screen_to_world_x(sx) {
        const ret = wasm.aerialcanvas_screen_to_world_x(this.__wbg_ptr, sx);
        return ret;
    }
    /**
     * @param {number} sy
     * @returns {number}
     */
    screen_to_world_y(sy) {
        const ret = wasm.aerialcanvas_screen_to_world_y(this.__wbg_ptr, sy);
        return ret;
    }
    /**
     * @param {bigint} id
     * @param {HTMLImageElement} img
     */
    set_cached_image(id, img) {
        wasm.aerialcanvas_set_cached_image(this.__wbg_ptr, id, img);
    }
    /**
     * @param {boolean} is_dark
     */
    set_dark_mode(is_dark) {
        wasm.aerialcanvas_set_dark_mode(this.__wbg_ptr, is_dark);
    }
    /**
     * @param {number} dpr
     */
    set_dpr(dpr) {
        wasm.aerialcanvas_set_dpr(this.__wbg_ptr, dpr);
    }
    /**
     * @param {number} r
     */
    set_eraser_radius(r) {
        wasm.aerialcanvas_set_eraser_radius(this.__wbg_ptr, r);
    }
    /**
     * @param {string} c
     */
    set_fill_color(c) {
        const ptr0 = passStringToWasm0(c, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_set_fill_color(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} s
     */
    set_fountain_sharpness(s) {
        wasm.aerialcanvas_set_fountain_sharpness(this.__wbg_ptr, s);
    }
    /**
     * @param {string} gtype
     */
    set_grid_type(gtype) {
        const ptr0 = passStringToWasm0(gtype, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_set_grid_type(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {boolean} curved
     */
    set_is_curved(curved) {
        wasm.aerialcanvas_set_is_curved(this.__wbg_ptr, curved);
    }
    /**
     * @param {boolean} rough
     */
    set_is_rough(rough) {
        wasm.aerialcanvas_set_is_rough(this.__wbg_ptr, rough);
    }
    /**
     * @param {string} c
     */
    set_stroke_color(c) {
        const ptr0 = passStringToWasm0(c, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_set_stroke_color(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} w
     */
    set_stroke_width(w) {
        wasm.aerialcanvas_set_stroke_width(this.__wbg_ptr, w);
    }
    set_tool_arrow() {
        wasm.aerialcanvas_set_tool_arrow(this.__wbg_ptr);
    }
    set_tool_ellipse() {
        wasm.aerialcanvas_set_tool_ellipse(this.__wbg_ptr);
    }
    set_tool_eraser() {
        wasm.aerialcanvas_set_tool_eraser(this.__wbg_ptr);
    }
    set_tool_fountain_pen() {
        wasm.aerialcanvas_set_tool_fountain_pen(this.__wbg_ptr);
    }
    set_tool_freedraw() {
        wasm.aerialcanvas_set_tool_freedraw(this.__wbg_ptr);
    }
    set_tool_hand() {
        wasm.aerialcanvas_set_tool_hand(this.__wbg_ptr);
    }
    set_tool_highlighter() {
        wasm.aerialcanvas_set_tool_highlighter(this.__wbg_ptr);
    }
    set_tool_laser_pen() {
        wasm.aerialcanvas_set_tool_laser_pen(this.__wbg_ptr);
    }
    set_tool_line() {
        wasm.aerialcanvas_set_tool_line(this.__wbg_ptr);
    }
    set_tool_magic_pen() {
        wasm.aerialcanvas_set_tool_magic_pen(this.__wbg_ptr);
    }
    set_tool_rectangle() {
        wasm.aerialcanvas_set_tool_rectangle(this.__wbg_ptr);
    }
    set_tool_select() {
        wasm.aerialcanvas_set_tool_select(this.__wbg_ptr);
    }
    set_tool_text() {
        wasm.aerialcanvas_set_tool_text(this.__wbg_ptr);
    }
    /**
     * Returns true if there are still animations running (e.g. laser fade).
     * @returns {boolean}
     */
    tick_animations() {
        const ret = wasm.aerialcanvas_tick_animations(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    undo() {
        const ret = wasm.aerialcanvas_undo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} text
     */
    update_selected_text(text) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.aerialcanvas_update_selected_text(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {number}
     */
    zoom_in() {
        const ret = wasm.aerialcanvas_zoom_in(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    zoom_out() {
        const ret = wasm.aerialcanvas_zoom_out(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) AerialCanvas.prototype[Symbol.dispose] = AerialCanvas.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_debug_string_a57024b9c6e4a48b: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_undefined_6cff064c44e0d823: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_arc_782f59ce766a8abb: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.arc(arg1, arg2, arg3, arg4, arg5);
        }, arguments); },
        __wbg_beginPath_4b87fe7ed5408cac: function(arg0) {
            arg0.beginPath();
        },
        __wbg_clearRect_81c3c80fbe793b63: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.clearRect(arg1, arg2, arg3, arg4);
        },
        __wbg_crypto_b501cd47f5fc84cc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_document_ac38448dbfd31a57: function(arg0) {
            const ret = arg0.document;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_drawImage_df46beb36e04ae8f: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.drawImage(arg1, arg2, arg3, arg4, arg5);
        }, arguments); },
        __wbg_ellipse_5101aa9d3056735c: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            arg0.ellipse(arg1, arg2, arg3, arg4, arg5, arg6, arg7);
        }, arguments); },
        __wbg_fillRect_3077c0e38eb34cd1: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.fillRect(arg1, arg2, arg3, arg4);
        },
        __wbg_fillText_2ebd722b6f37129e: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.fillText(getStringFromWasm0(arg1, arg2), arg3, arg4);
        }, arguments); },
        __wbg_fill_33944400e9c94f79: function(arg0) {
            arg0.fill();
        },
        __wbg_getContext_71c33f14b63da593: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getElementById_1637d6969b003cda: function(arg0, arg1, arg2) {
            const ret = arg0.getElementById(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_getRandomValues_0ece34fb6273ba4a: function(arg0) {
            const ret = arg0.getRandomValues;
            return ret;
        },
        __wbg_getRandomValues_fc2c42282aa7250c: function(arg0, arg1) {
            arg0.getRandomValues(arg1);
        },
        __wbg_height_e56f6fb197710e09: function(arg0) {
            const ret = arg0.height;
            return ret;
        },
        __wbg_instanceof_CanvasRenderingContext2d_d23139c3ef7651a3: function(arg0) {
            let result;
            try {
                result = arg0 instanceof CanvasRenderingContext2D;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_HtmlCanvasElement_327e7f7530c72bbd: function(arg0) {
            let result;
            try {
                result = arg0 instanceof HTMLCanvasElement;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_5625ff9937037a38: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_length_36bd29c6848c2144: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_lineTo_9495a068a4f48283: function(arg0, arg1, arg2) {
            arg0.lineTo(arg1, arg2);
        },
        __wbg_moveTo_a5882cdf1a7d39d9: function(arg0, arg1, arg2) {
            arg0.moveTo(arg1, arg2);
        },
        __wbg_msCrypto_56bad8adf1ceb3d9: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_with_length_3ffc1c56427c525c: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_prototypesetcall_de8e0d9553586985: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_quadraticCurveTo_5bb4e18a192b53b9: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.quadraticCurveTo(arg1, arg2, arg3, arg4);
        },
        __wbg_randomFillSync_1afd9d46e5907320: function(arg0, arg1, arg2) {
            arg0.randomFillSync(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_require_6e5b8fc0b04be67c: function(arg0, arg1, arg2) {
            const ret = arg0.require(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_restore_43a0248041b088b5: function(arg0) {
            arg0.restore();
        },
        __wbg_save_0c65dc2190a45c2a: function(arg0) {
            arg0.save();
        },
        __wbg_scale_1999c309b681811d: function() { return handleError(function (arg0, arg1, arg2) {
            arg0.scale(arg1, arg2);
        }, arguments); },
        __wbg_self_d2194f493ba20573: function() { return handleError(function () {
            const ret = self.self;
            return ret;
        }, arguments); },
        __wbg_set_fillStyle_52e75a25be60a3ff: function(arg0, arg1, arg2) {
            arg0.fillStyle = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_font_63f9cc44d4c6f102: function(arg0, arg1, arg2) {
            arg0.font = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_globalAlpha_7990fab00eb6c8f2: function(arg0, arg1) {
            arg0.globalAlpha = arg1;
        },
        __wbg_set_lineCap_ec484c1489fa48bc: function(arg0, arg1, arg2) {
            arg0.lineCap = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_lineJoin_645744ec04386dd0: function(arg0, arg1, arg2) {
            arg0.lineJoin = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_lineWidth_5f9aefcc32e60287: function(arg0, arg1) {
            arg0.lineWidth = arg1;
        },
        __wbg_set_shadowBlur_8f0ba721d1bde0ba: function(arg0, arg1) {
            arg0.shadowBlur = arg1;
        },
        __wbg_set_shadowColor_b6af7ba363af9d9a: function(arg0, arg1, arg2) {
            arg0.shadowColor = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_strokeStyle_cce50c69cecc2df7: function(arg0, arg1, arg2) {
            arg0.strokeStyle = getStringFromWasm0(arg1, arg2);
        },
        __wbg_static_accessor_GLOBAL_THIS_466428f93b4eaa76: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_c7aea38d4de089bc: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_MODULE_ef3aa2eb251158a5: function() {
            const ret = module;
            return ret;
        },
        __wbg_static_accessor_SELF_42d4fae05e59267a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_e0db14a0eba6a812: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_strokeRect_1e1fb12083885dd8: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.strokeRect(arg1, arg2, arg3, arg4);
        },
        __wbg_stroke_5f311844f0db0d9a: function(arg0) {
            arg0.stroke();
        },
        __wbg_subarray_a4cc58201c7359fd: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_translate_b7073fdf68217bcc: function() { return handleError(function (arg0, arg1, arg2) {
            arg0.translate(arg1, arg2);
        }, arguments); },
        __wbg_width_1952934caca67137: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./aerial_engine_bg.js": import0,
    };
}

const AerialCanvasFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_aerialcanvas_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('aerial_engine_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
