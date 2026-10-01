import DOMPurify from 'dompurify';
/** Defence in depth for diagram previews injected via innerHTML. */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject'],
    // Mermaid renders node labels as HTML inside <foreignObject>; without this
    // DOMPurify strips them and every label disappears.
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });
}
