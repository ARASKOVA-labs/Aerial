// ── Diagram theming: public entry point ──────────────────────────────────────
// Mermaid config, SVG post-processing and starter templates live in ./diagram/.

export { getAraskovaMermaidConfig, type AraskovaDiagramStyle, type MermaidThemeConfig } from './diagram/config';
export { applyAraskovaDiagramAesthetics } from './diagram/aesthetics';
export { ARASKOVA_DIAGRAM_TEMPLATES } from './diagram/templates';
