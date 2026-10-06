// ── Element JSON as the engine reports it ────────────────────────────────────

export interface ElementJson {
  id: number;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  font_size?: number;
  font_family?: string;
  stroke_color?: string;
  code?: string | null;
}

export function parseElement(json: string | null | undefined): ElementJson | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ElementJson;
  } catch {
    return null;
  }
}

export const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
