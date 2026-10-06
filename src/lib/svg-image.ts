// ── SVG → image helpers ──────────────────────────────────────────────────────
// Diagrams are drawn through <img>, never injected as markup: the SVG is then
// parsed as XML (its <style> applies the same in WebKit and Chromium), it
// cannot run script, and the preview shows exactly what lands on the canvas.

import { withEmbeddedFonts } from './svg-fonts';

const stripImports = (svg: string) => svg.replace(/@import\s+url\([^)]+\);?/gi, '');

/** Base64 data URL for an SVG string (safe for non-Latin-1 text). */
export const svgDataUrl = (svg: string) => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

/** Object URL for an SVG with the bundled fonts inlined. Revoke when done. */
export async function svgObjectUrl(svg: string): Promise<string> {
  const withFonts = await withEmbeddedFonts(stripImports(svg));
  return URL.createObjectURL(new Blob([withFonts], { type: 'image/svg+xml;charset=utf-8' }));
}

/** Decodes an SVG string into a loaded image element (fonts inlined). */
export async function renderSvgToImage(svg: string): Promise<HTMLImageElement> {
  const sanitized = await withEmbeddedFonts(stripImports(svg));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      // WebKit sometimes rejects large data URLs; fall back to a blob URL.
      try {
        const url = URL.createObjectURL(new Blob([sanitized], { type: 'image/svg+xml;charset=utf-8' }));
        const fallback = new Image();
        fallback.onload = () => {
          URL.revokeObjectURL(url);
          resolve(fallback);
        };
        fallback.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        fallback.src = url;
      } catch (e) {
        reject(e);
      }
    };
    img.src = svgDataUrl(sanitized);
  });
}

/** Intrinsic size of an SVG from its viewBox (or width/height), if any. */
export function svgSize(svg: string): { w: number; h: number } | null {
  const el = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('svg');
  if (!el) return null;
  const vb = el.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(parseFloat);
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: Math.round(vb[2]), h: Math.round(vb[3]) };
  const w = parseFloat(el.getAttribute('width') || '0');
  const h = parseFloat(el.getAttribute('height') || '0');
  return w > 0 && h > 0 ? { w: Math.round(w), h: Math.round(h) } : null;
}
