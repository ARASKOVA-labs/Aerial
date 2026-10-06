// ── Diagram source → themed SVG ──────────────────────────────────────────────
// Aras DSL (`node …` / `group …`) goes to the native layout engine when the
// desktop shell is present; everything else is Mermaid.

import mermaid from 'mermaid';
import { applyAraskovaDiagramAesthetics, getAraskovaMermaidConfig, type AraskovaDiagramStyle } from './diagram-theme';

let seq = 0;

const isArasDsl = (src: string) => /^(node|group)\s/.test(src);

async function renderAras(src: string): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const res = await invoke<{ svg: string }>('render_diagram', { code: src });
    return res?.svg ?? null;
  } catch {
    return null; // not in the desktop shell, or the DSL did not parse
  }
}

async function renderMermaid(src: string, dark: boolean, style: AraskovaDiagramStyle, accent: string): Promise<string> {
  mermaid.initialize(getAraskovaMermaidConfig(dark, style, accent));
  const id = `aerial-diagram-${++seq}`;
  try {
    const { svg } = await mermaid.render(id, src);
    return svg;
  } finally {
    // Mermaid leaves its scratch node behind when parsing fails.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
  }
}

/** Renders `source` and applies the Araskova diagram theme. Throws on syntax errors. */
export async function renderDiagram(source: string, style: AraskovaDiagramStyle, accent: string, appDark: boolean): Promise<string> {
  const src = source.trim();
  if (!src) throw new Error('Enter some Mermaid or Aras DSL to render.');
  const dark = style === 'industrial_light' ? false : style === 'blueprint' ? true : style === 'brutalist' ? true : appDark;
  const raw = (isArasDsl(src) && (await renderAras(src))) || (await renderMermaid(src, dark, style, accent));
  return applyAraskovaDiagramAesthetics(raw, dark, style, accent);
}
