// ── Handwriting: text → pen strokes ──────────────────────────────────────────
// Lays text out in a single-stroke (plotter) font, so notes are written as
// real freehand strokes that behave like anything drawn with the pen: they
// can be erased partially, recoloured, and are rendered with pen pressure.
// Fonts: EMS Readability (print) and EMS Allure (cursive), SIL OFL.

type Pt = [number, number];
interface Glyph {
  adv: number;
  strokes: Pt[][];
}
interface StrokeFont {
  upm: number;
  missingAdv: number;
  glyphs: Map<string, Glyph>;
}

export type HandStyle = 'print' | 'cursive';

const FONT_FILES: Record<HandStyle, string> = { print: 'EMSReadability.svg', cursive: 'EMSAllure.svg' };
const fonts = new Map<HandStyle, Promise<StrokeFont>>();

function parseFont(svg: string): StrokeFont {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const upm = parseFloat(doc.querySelector('font-face')?.getAttribute('units-per-em') ?? '1000');
  const missingAdv = parseFloat(doc.querySelector('font')?.getAttribute('horiz-adv-x') ?? '500');
  const glyphs = new Map<string, Glyph>();
  doc.querySelectorAll('glyph').forEach((g) => {
    const u = g.getAttribute('unicode');
    if (u == null) return;
    const strokes: Pt[][] = [];
    let cur: Pt[] | null = null;
    const tok = (g.getAttribute('d') ?? '').match(/[ML]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    for (let i = 0; i < tok.length; ) {
      if (tok[i] === 'M' || tok[i] === 'L') {
        if (tok[i] === 'M') strokes.push((cur = []));
        i++;
        continue;
      }
      cur?.push([parseFloat(tok[i]), parseFloat(tok[i + 1])]);
      i += 2;
    }
    glyphs.set(u, { adv: parseFloat(g.getAttribute('horiz-adv-x') ?? String(missingAdv)), strokes });
  });
  return { upm, missingAdv, glyphs };
}

function loadFont(style: HandStyle): Promise<StrokeFont> {
  let p = fonts.get(style);
  if (!p) {
    p = fetch(`/fonts/stroke/${FONT_FILES[style]}`)
      .then((r) => {
        if (!r.ok) throw new Error(`handwriting font unavailable (${r.status})`);
        return r.text();
      })
      .then(parseFont);
    fonts.set(style, p);
    p.catch(() => fonts.delete(style));
  }
  return p;
}

/** Inserts points so no segment is longer than `step`: the pen renderer smooths dense input best. */
function densify(points: Pt[], step: number): Pt[] {
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

export interface HandwritingOptions {
  /** Top-left of the first line, world units. */
  x: number;
  y: number;
  /** Cap height-ish size in world units (default 28). */
  size?: number;
  style?: HandStyle;
  /** Wrap lines longer than this (world units); 0 = no wrapping. */
  maxWidth?: number;
  lineHeight?: number;
}

export interface HandwritingLayout {
  strokes: Pt[][];
  width: number;
  height: number;
}

/** Lays out `text` (newlines and word wrap supported) as world-space polylines. */
export async function layoutHandwriting(text: string, opts: HandwritingOptions): Promise<HandwritingLayout> {
  const font = await loadFont(opts.style ?? 'print');
  const size = Math.max(4, opts.size ?? 28);
  const k = size / font.upm / 0.7; // the fonts' caps are ~0.7 em
  const lineHeight = (opts.lineHeight ?? 1.45) * size;
  const advance = (ch: string) => (font.glyphs.get(ch)?.adv ?? font.missingAdv) * k;
  const wordWidth = (w: string) => [...w].reduce((s, ch) => s + advance(ch), 0);
  const space = advance(' ');

  // Greedy word wrap.
  const lines: string[] = [];
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!opts.maxWidth) {
      lines.push(para);
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && wordWidth(next) > opts.maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }

  const strokes: Pt[][] = [];
  let width = 0;
  lines.forEach((line, li) => {
    let cx = opts.x;
    const baseline = opts.y + size + li * lineHeight;
    for (const ch of line) {
      if (ch === ' ') {
        cx += space;
        continue;
      }
      const g = font.glyphs.get(ch);
      for (const s of g?.strokes ?? []) {
        if (s.length === 0) continue;
        const pts = s.map(([gx, gy]): Pt => [cx + gx * k, baseline - gy * k]);
        // Dots (one point) become a tiny dash so they render as ink.
        strokes.push(densify(pts.length === 1 ? [pts[0], [pts[0][0] + size * 0.04, pts[0][1]]] : pts, Math.max(1, size * 0.06)));
      }
      cx += g ? g.adv * k : advance(ch);
    }
    width = Math.max(width, cx - opts.x);
  });
  return { strokes, width, height: lines.length * lineHeight };
}
