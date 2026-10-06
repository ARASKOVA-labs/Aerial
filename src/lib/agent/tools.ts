// ── Agent tools: what an MCP client (e.g. Claude) can do on the canvas ───────
// Each tool takes JSON arguments, works on the live board through the canvas
// API and the engine's batch editing calls, and returns JSON (or an image).
// Tool names and argument shapes mirror src-tauri/src/mcp.rs.

import { renderDiagram } from '../diagram-render';
import type { AraskovaDiagramStyle } from '../diagram-theme';
import type { AerialCanvasRef, AerialEngine } from '../types';
import { layoutHandwriting, type HandStyle } from './handwriting';

export interface AgentHost {
  canvas: () => AerialCanvasRef | null;
  boards: () => Array<{ id: string; name: string }>;
  activeBoard: () => { id: string; name: string } | undefined;
  openBoard: (id: string) => Promise<void>;
  createBoard: (name?: string) => Promise<string>;
  isDarkMode: () => boolean;
}

/** A tool result: JSON for the model, or a PNG it can look at. */
export type AgentResult = { kind: 'json'; value: unknown } | { kind: 'image'; mime: 'image/png'; base64: string; note?: string };

export class AgentError extends Error {}

type Args = Record<string, unknown>;
type Pt = [number, number];

// ── Argument helpers (inputs come from a model: check everything) ────────────
const num = (a: Args, k: string, fallback?: number): number => {
  const v = a[k];
  if (v === undefined || v === null) {
    if (fallback === undefined) throw new AgentError(`"${k}" is required`);
    return fallback;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new AgentError(`"${k}" must be a number`);
  return v;
};
const str = (a: Args, k: string, fallback?: string): string => {
  const v = a[k];
  if (v === undefined || v === null) {
    if (fallback === undefined) throw new AgentError(`"${k}" is required`);
    return fallback;
  }
  if (typeof v !== 'string') throw new AgentError(`"${k}" must be a string`);
  return v;
};
const list = (a: Args, k: string): unknown[] => {
  const v = a[k];
  if (!Array.isArray(v)) throw new AgentError(`"${k}" must be an array`);
  if (v.length > 2000) throw new AgentError(`"${k}" has too many items (max 2000)`);
  return v;
};
const point = (v: unknown): Pt => {
  if (Array.isArray(v) && v.length >= 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) return [v[0], v[1]];
  if (v && typeof v === 'object' && typeof (v as Args).x === 'number' && typeof (v as Args).y === 'number') return [(v as { x: number }).x, (v as { y: number }).y];
  throw new AgentError('points must be [x, y] pairs');
};
const color = (v: unknown, fallback: string): string => (typeof v === 'string' && /^(#[0-9a-f]{3,8}|transparent|[a-z]{3,20})$/i.test(v.trim()) ? v.trim() : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

// ── Engine access ────────────────────────────────────────────────────────────
function engineOf(host: AgentHost): { canvas: AerialCanvasRef; engine: AerialEngine } {
  const canvas = host.canvas();
  const engine = canvas?.getEngine();
  if (!canvas || !engine) throw new AgentError('The canvas is not ready yet.');
  return { canvas, engine };
}

interface SceneElement {
  id: number;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  stroke_color?: string;
  fill_color?: string;
  points?: Pt[];
  code?: string | null;
}

const sceneOf = (engine: AerialEngine) => (JSON.parse(engine.get_scene_json()) as { elements: SceneElement[] }).elements ?? [];

function addElements(engine: AerialEngine, elements: object[]): number[] {
  const ids = JSON.parse(engine.add_elements_json(JSON.stringify(elements))) as Array<number | null>;
  engine.render();
  const rejected = ids.filter((id) => id === null).length;
  if (rejected === ids.length && ids.length > 0) throw new AgentError('Every element was rejected (check coordinates and sizes).');
  return ids.filter((id): id is number => id !== null);
}

/** Like addElements, but keeps one slot per input (null = rejected). */
function addElementsKeepingSlots(engine: AerialEngine, elements: object[]): Array<number | null> {
  const ids = JSON.parse(engine.add_elements_json(JSON.stringify(elements))) as Array<number | null>;
  engine.render();
  if (ids.length > 0 && ids.every((id) => id === null)) throw new AgentError('Every element was rejected (check coordinates and sizes).');
  return ids;
}

/** Groups [shape, label?, shape, label?…] ids back into one entry per item. */
function pairWithLabels(ids: Array<number | null>, hasLabel: boolean[]) {
  let i = 0;
  return hasLabel.map((labelled) => {
    const id = ids[i++];
    const label_id = labelled ? ids[i++] : undefined;
    return label_id === undefined ? { id } : { id, label_id };
  });
}

/** Where to put new content of size w×h when the caller gave no position: right of everything, or the view centre. */
function freeSpot(engine: AerialEngine, w: number, h: number): Pt {
  const b = Array.from(engine.content_bounds());
  if (b.length === 4) return [b[2] + 80, b[1]];
  const view = document.querySelector<HTMLCanvasElement>('canvas[id^="aerial-canvas-"]');
  const [cw, ch] = [view?.clientWidth ?? 1200, view?.clientHeight ?? 800];
  return [engine.screen_to_world_x(cw / 2) - w / 2, engine.screen_to_world_y(ch / 2) - h / 2];
}

/** Rough text box size for typed text (the engine measures precisely when drawing). */
const textBox = (text: string, size: number) => {
  const lines = text.split('\n');
  return { w: Math.max(...lines.map((l) => l.length)) * size * 0.56 + 4, h: lines.length * size * 1.25 };
};

const FONTS: Record<string, string> = { hand: 'Kalam, Caveat, cursive', normal: 'Inter, ui-sans-serif, sans-serif', code: "'Space Mono', ui-monospace, monospace" };
const PEN_KIND: Record<string, string> = { pen: 'FreeDraw', brush: 'FountainPen', marker: 'Marker', highlighter: 'Highlighter' };
const SHAPE_KIND: Record<string, string> = { rectangle: 'Rectangle', ellipse: 'Ellipse', diamond: 'Diamond' };

/** Default ink. Colours are stored in light-theme form; the engine inverts them in dark mode. */
const INK = '#1e1e1e';

function labelElement(text: string, cx: number, cy: number, size: number, colorValue: string, font: string) {
  const box = textBox(text, size);
  return { kind: 'Text', text, x: cx - box.w / 2, y: cy - box.h / 2, w: box.w, h: box.h, font_size: size, font_family: font, stroke_color: colorValue, fill_color: colorValue, points: [[cx - box.w / 2, cy - box.h / 2]] };
}

// ── Tools ────────────────────────────────────────────────────────────────────
const MAX_LISTED = 400;

export const TOOLS: Record<string, (host: AgentHost, args: Args) => Promise<AgentResult>> = {
  async get_board(host, args) {
    const { engine } = engineOf(host);
    const all = sceneOf(engine);
    const kinds = args.kinds ? new Set(list(args, 'kinds').map(String)) : null;
    const elements = all
      .filter((e) => !kinds || kinds.has(e.kind))
      .slice(0, MAX_LISTED)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        x: Math.round(e.x),
        y: Math.round(e.y),
        width: Math.round(e.w),
        height: Math.round(e.h),
        ...(e.text ? { text: e.text } : {}),
        ...(e.stroke_color ? { stroke_color: e.stroke_color } : {}),
        ...(e.fill_color && e.fill_color !== 'transparent' ? { fill_color: e.fill_color } : {}),
        ...(e.code ? { diagram_source: e.code.slice(0, 2000) } : {}),
      }));
    const b = Array.from(engine.content_bounds());
    return {
      kind: 'json',
      value: {
        board: host.activeBoard(),
        element_count: all.length,
        listed: elements.length,
        content_bounds: b.length === 4 ? { x: Math.round(b[0]), y: Math.round(b[1]), width: Math.round(b[2] - b[0]), height: Math.round(b[3] - b[1]) } : null,
        zoom: engine.get_zoom(),
        theme: host.isDarkMode() ? 'dark' : 'light',
        coordinates: 'World units; 1 unit = 1 screen px at 100% zoom; y grows downward.',
        elements,
      },
    };
  },

  async get_snapshot(host, args) {
    const { canvas, engine } = engineOf(host);
    if (args.fit !== false) canvas.zoomToFit();
    engine.render(); // synchronous: the canvas holds the frame before export
    const blob = await canvas.exportPngBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { kind: 'image', mime: 'image/png', base64: btoa(bin), note: `Snapshot of "${host.activeBoard()?.name ?? 'board'}" (${sceneOf(engine).length} elements).` };
  },

  async list_boards(host) {
    return { kind: 'json', value: { active: host.activeBoard()?.id, boards: host.boards() } };
  },

  async open_board(host, args) {
    const id = args.id ? str(args, 'id') : undefined;
    const name = args.name ? str(args, 'name').toLowerCase() : undefined;
    const board = host.boards().find((b) => b.id === id || (name && b.name.toLowerCase() === name));
    if (!board) throw new AgentError('No board with that id or name. Use list_boards.');
    await host.openBoard(board.id);
    return { kind: 'json', value: { opened: board } };
  },

  async create_board(host, args) {
    const name = args.name ? str(args, 'name').slice(0, 80) : undefined;
    const id = await host.createBoard(name);
    return { kind: 'json', value: { created: { id, name: name ?? null }, note: 'The new board is now open.' } };
  },

  async draw_shapes(host, args) {
    const { engine } = engineOf(host);
    const ink = INK;
    const els: object[] = [];
    const hasLabel: boolean[] = [];
    for (const raw of list(args, 'shapes')) {
      const s = raw as Args;
      const kind = SHAPE_KIND[str(s, 'type', 'rectangle')];
      if (!kind) throw new AgentError('shape type must be rectangle, ellipse or diamond');
      const w = Math.max(1, num(s, 'width', 160));
      const h = Math.max(1, num(s, 'height', 100));
      const [fx, fy] = s.x === undefined || s.y === undefined ? freeSpot(engine, w, h) : [num(s, 'x'), num(s, 'y')];
      const stroke = color(s.stroke_color, ink);
      els.push({
        kind,
        points: [[fx, fy], [fx + w, fy + h]],
        stroke_color: stroke,
        fill_color: color(s.fill_color, 'transparent'),
        fill_style: oneOf(s.fill_style, ['solid', 'hachure', 'cross-hatch'] as const, 'hachure'),
        stroke_width: num(s, 'stroke_width', 2),
        stroke_style: oneOf(s.stroke_style, ['solid', 'dashed', 'dotted'] as const, 'solid'),
        roughness: Math.min(2, Math.max(0, num(s, 'sloppiness', 1))),
        roundness: s.rounded === false || kind === 'Ellipse' ? 'sharp' : 'round',
        opacity: Math.min(100, Math.max(0, num(s, 'opacity', 100))),
      });
      const label = typeof s.label === 'string' && s.label.trim();
      hasLabel.push(!!label);
      if (label) els.push(labelElement(label, fx + w / 2, fy + h / 2, num(s, 'label_size', 20), stroke, FONTS.hand));
    }
    return { kind: 'json', value: { shapes: pairWithLabels(addElementsKeepingSlots(engine, els), hasLabel) } };
  },

  async draw_connectors(host, args) {
    const { engine } = engineOf(host);
    const ink = INK;
    const scene = new Map(sceneOf(engine).map((e) => [e.id, e]));
    const els: object[] = [];
    const hasLabel: boolean[] = [];
    for (const raw of list(args, 'connectors')) {
      const c = raw as Args;
      let pts: Pt[];
      if (c.from_id !== undefined && c.to_id !== undefined) {
        const a = scene.get(num(c, 'from_id'));
        const b = scene.get(num(c, 'to_id'));
        if (!a || !b) throw new AgentError('from_id / to_id must be ids of elements on the board');
        pts = edgeToEdge(a, b);
      } else {
        pts = list(c, 'points').map(point);
        if (pts.length < 2) throw new AgentError('a connector needs at least two points');
      }
      const stroke = color(c.color, ink);
      els.push({
        kind: str(c, 'type', 'arrow') === 'line' ? 'Line' : 'Arrow',
        points: pts,
        stroke_color: stroke,
        stroke_width: num(c, 'stroke_width', 2),
        stroke_style: oneOf(c.stroke_style, ['solid', 'dashed', 'dotted'] as const, 'solid'),
        roughness: Math.min(2, Math.max(0, num(c, 'sloppiness', 1))),
      });
      const label = typeof c.label === 'string' && c.label.trim();
      hasLabel.push(!!label);
      if (label) {
        const mid = pts[Math.floor((pts.length - 1) / 2)];
        const next = pts[Math.floor((pts.length - 1) / 2) + 1];
        els.push(labelElement(label, (mid[0] + next[0]) / 2, (mid[1] + next[1]) / 2 - 14, num(c, 'label_size', 16), stroke, FONTS.hand));
      }
    }
    return { kind: 'json', value: { connectors: pairWithLabels(addElementsKeepingSlots(engine, els), hasLabel) } };
  },

  async draw_freehand(host, args) {
    const { engine } = engineOf(host);
    const ink = INK;
    const els = list(args, 'strokes').map((raw) => {
      const s = raw as Args;
      const pts = list(s, 'points').map(point);
      if (pts.length < 2) throw new AgentError('a stroke needs at least two points');
      const pen = str(s, 'pen', 'pen');
      if (!PEN_KIND[pen]) throw new AgentError('pen must be pen, brush, marker or highlighter');
      return { kind: PEN_KIND[pen], points: pts, stroke_color: color(s.color, pen === 'highlighter' ? '#ffd43b' : ink), stroke_width: num(s, 'width', pen === 'highlighter' ? 3 : 2) };
    });
    return { kind: 'json', value: { ids: addElements(engine, els) } };
  },

  async write_handwriting(host, args) {
    const { engine } = engineOf(host);
    const text = str(args, 'text').slice(0, 4000);
    const size = Math.min(400, Math.max(6, num(args, 'size', 28)));
    const style = oneOf<HandStyle>(args.style, ['print', 'cursive'], 'print');
    const maxWidth = Math.max(0, num(args, 'max_width', 0));
    // Measure first so an unpositioned note lands in free space.
    const probe = await layoutHandwriting(text, { x: 0, y: 0, size, style, maxWidth });
    const [x, y] = args.x === undefined || args.y === undefined ? freeSpot(engine, probe.width, probe.height) : [num(args, 'x'), num(args, 'y')];
    const layout = await layoutHandwriting(text, { x, y, size, style, maxWidth });
    const pen = str(args, 'pen', 'pen');
    if (!PEN_KIND[pen]) throw new AgentError('pen must be pen, brush, marker or highlighter');
    const stroke = color(args.color, INK);
    const width = num(args, 'width', Math.max(1, size / 14));
    const ids = addElements(engine, layout.strokes.map((points) => ({ kind: PEN_KIND[pen], points, stroke_color: stroke, stroke_width: width })));
    return { kind: 'json', value: { ids, bounds: { x: Math.round(x), y: Math.round(y), width: Math.round(layout.width), height: Math.round(layout.height) } } };
  },

  async add_text(host, args) {
    const { engine } = engineOf(host);
    const text = str(args, 'text').slice(0, 20000);
    const size = Math.min(400, Math.max(6, num(args, 'size', 24)));
    const box = textBox(text, size);
    const [x, y] = args.x === undefined || args.y === undefined ? freeSpot(engine, box.w, box.h) : [num(args, 'x'), num(args, 'y')];
    const c = color(args.color, INK);
    const font = FONTS[str(args, 'font', 'hand')] ?? FONTS.hand;
    return { kind: 'json', value: { ids: addElements(engine, [{ kind: 'Text', text, x, y, w: box.w, h: box.h, font_size: size, font_family: font, stroke_color: c, fill_color: c, points: [[x, y]] }]) } };
  },

  async add_diagram(host, args) {
    const { engine, canvas } = engineOf(host);
    const source = str(args, 'mermaid').slice(0, 64 * 1024);
    const style = ({ light: 'industrial_light', dark: 'brutalist', blueprint: 'blueprint' } as Record<string, AraskovaDiagramStyle>)[str(args, 'style', host.isDarkMode() ? 'dark' : 'light')] ?? 'industrial_light';
    const accent = color(args.accent, '#e73f07');
    let svg: string;
    try {
      svg = await renderDiagram(source, style, accent, host.isDarkMode());
    } catch (err) {
      throw new AgentError(`Mermaid could not parse the diagram: ${err instanceof Error ? err.message : String(err)}`);
    }
    const before = new Set(sceneOf(engine).map((e) => e.id));
    await canvas.addDiagram(source, svg, Math.min(3, Math.max(0.2, num(args, 'scale', 1))), accent);
    const added = sceneOf(engine).find((e) => !before.has(e.id) && e.kind === 'Diagram');
    if (added && args.x !== undefined && args.y !== undefined) {
      engine.move_elements_json(JSON.stringify([added.id]), num(args, 'x') - added.x, num(args, 'y') - added.y);
      engine.render();
    }
    return { kind: 'json', value: { id: added?.id ?? null } };
  },

  async update_elements(host, args) {
    const { engine } = engineOf(host);
    const ALLOWED: Record<string, string> = {
      x: 'x', y: 'y', width: 'w', height: 'h', text: 'text', stroke_color: 'stroke_color', fill_color: 'fill_color',
      stroke_width: 'stroke_width', stroke_style: 'stroke_style', fill_style: 'fill_style', opacity: 'opacity', font_size: 'font_size',
    };
    const scene = new Map(sceneOf(engine).map((e) => [e.id, e]));
    const patches = list(args, 'updates').map((raw) => {
      const u = raw as Args;
      const id = num(u, 'id');
      const el = scene.get(id);
      if (!el) throw new AgentError(`No element with id ${id}`);
      const patch: Args = { id };
      for (const [k, v] of Object.entries(u)) if (ALLOWED[k] && v !== undefined) patch[ALLOWED[k]] = v;
      // Point-defined elements move and resize through their points.
      if (el.points && el.kind !== 'Text' && el.kind !== 'Image' && el.kind !== 'Diagram' && ('x' in patch || 'y' in patch || 'w' in patch || 'h' in patch)) {
        const nx = (patch.x as number | undefined) ?? el.x;
        const ny = (patch.y as number | undefined) ?? el.y;
        const sx = ((patch.w as number | undefined) ?? el.w) / Math.max(1, el.w);
        const sy = ((patch.h as number | undefined) ?? el.h) / Math.max(1, el.h);
        patch.points = el.points.map(([px, py]) => [nx + (px - el.x) * sx, ny + (py - el.y) * sy]);
      }
      if (el.kind === 'Text' && typeof patch.stroke_color === 'string') patch.fill_color = patch.stroke_color;
      return patch;
    });
    const updated = JSON.parse(engine.update_elements_json(JSON.stringify(patches))) as number[];
    engine.render();
    return { kind: 'json', value: { updated } };
  },

  async move_elements(host, args) {
    const { engine } = engineOf(host);
    const ids = list(args, 'ids').map((v) => (typeof v === 'number' ? v : NaN)).filter(Number.isFinite);
    const moved = engine.move_elements_json(JSON.stringify(ids), num(args, 'dx', 0), num(args, 'dy', 0));
    engine.render();
    return { kind: 'json', value: { moved } };
  },

  async delete_elements(host, args) {
    const { engine } = engineOf(host);
    const ids = list(args, 'ids').map((v) => (typeof v === 'number' ? v : NaN)).filter(Number.isFinite);
    const deleted = engine.delete_elements_json(JSON.stringify(ids));
    engine.render();
    return { kind: 'json', value: { deleted } };
  },

  async clear_board(host, args) {
    if (args.confirm !== true) throw new AgentError('Pass "confirm": true to clear the whole board (it can be undone).');
    engineOf(host).canvas.clearBoard();
    return { kind: 'json', value: { cleared: true } };
  },

  async history(host, args) {
    const { canvas } = engineOf(host);
    const action = oneOf(args.action, ['undo', 'redo'] as const, 'undo');
    const steps = Math.min(50, Math.max(1, Math.round(num(args, 'steps', 1))));
    for (let i = 0; i < steps; i++) (action === 'undo' ? canvas.undo : canvas.redo)();
    return { kind: 'json', value: { [action]: steps } };
  },

  async zoom_to_fit(host) {
    engineOf(host).canvas.zoomToFit();
    return { kind: 'json', value: { zoom: engineOf(host).engine.get_zoom() } };
  },
};

/** Endpoints for an arrow between two elements: from edge to edge along the centre line. */
function edgeToEdge(a: SceneElement, b: SceneElement): Pt[] {
  const ca: Pt = [a.x + a.w / 2, a.y + a.h / 2];
  const cb: Pt = [b.x + b.w / 2, b.y + b.h / 2];
  const exit = (e: SceneElement, from: Pt, to: Pt): Pt => {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    const t = Math.min(dx ? e.w / 2 / Math.abs(dx) : Infinity, dy ? e.h / 2 / Math.abs(dy) : Infinity, 1);
    const gap = 8 / Math.max(1, Math.hypot(dx, dy));
    return [from[0] + dx * (t + gap), from[1] + dy * (t + gap)];
  };
  return [exit(a, ca, cb), exit(b, cb, ca)];
}

export async function runTool(host: AgentHost, name: string, args: unknown): Promise<AgentResult> {
  const tool = Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : undefined;
  if (!tool) throw new AgentError(`Unknown tool "${name}"`);
  return tool(host, args && typeof args === 'object' && !Array.isArray(args) ? (args as Args) : {});
}
