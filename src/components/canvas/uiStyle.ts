// ── Persisted editor style and how it maps onto the engine ───────────────────

import type { ToolId } from '../../lib/types';
import { DEFAULT_UI_STYLE, isPen, type UiStyle } from '../../ui/model';

const STYLE_KEY = 'aerial_ui_style_v1';

/** Reads the persisted UI style, keeping only fields whose type matches the defaults. */
export function loadUiStyle(): UiStyle {
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    if (!raw) return DEFAULT_UI_STYLE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_UI_STYLE;
    const out: Record<string, unknown> = { ...DEFAULT_UI_STYLE };
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (k in DEFAULT_UI_STYLE && typeof v === typeof (DEFAULT_UI_STYLE as unknown as Record<string, unknown>)[k]) out[k] = v;
    }
    return out as unknown as UiStyle;
  } catch {
    return DEFAULT_UI_STYLE;
  }
}

export function saveUiStyle(s: UiStyle) {
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode): the style simply isn't remembered.
  }
}

/** Width the engine should draw with for a tool. */
export function widthFor(tool: ToolId, s: UiStyle): number {
  if (tool === 'highlighter') return s.highlighterWidth;
  if (isPen(tool) || tool === 'magic_pen' || tool === 'laser_pen') return s.penWidth;
  return s.shapeWidth;
}

/** The engine's style payload for new elements drawn with `tool`. */
export function engineStyleFor(tool: ToolId, s: UiStyle): string {
  return JSON.stringify({
    strokeColor: tool === 'highlighter' ? s.highlighterColor : s.strokeColor,
    backgroundColor: s.backgroundColor,
    fillStyle: s.fillStyle,
    strokeWidth: widthFor(tool, s),
    strokeStyle: s.strokeStyle,
    roughness: s.roughness,
    roundness: s.roundness,
    opacity: tool === 'highlighter' ? 100 : s.opacity,
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
  });
}
