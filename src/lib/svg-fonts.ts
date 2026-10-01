// ── Font embedding for rasterised SVG ────────────────────────────────────────
// An SVG drawn through <img> cannot see the page's fonts, so diagram labels
// fell back to a wider system font than Mermaid measured with and were clipped.
// The bundled Inter files are inlined as @font-face data URLs only at raster
// time, so stored diagram SVG stays small.

import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff2?url';

const FACES: Array<[number, string]> = [
  [400, inter400],
  [500, inter500],
  [700, inter700],
  [800, inter800],
];

let cssPromise: Promise<string> | null = null;

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function embeddedFontCss(): Promise<string> {
  cssPromise ??= Promise.all(
    FACES.map(async ([weight, url]) => {
      const res = await fetch(url);
      const dataUrl = await toDataUrl(await res.blob());
      const src = dataUrl.replace(/^data:[^;,]*/, 'data:font/woff2');
      return `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};src:url(${src}) format('woff2');}`;
    }),
  )
    .then((faces) => faces.join(''))
    // Embedding is best effort: a host CSP may forbid the fetch.
    .catch(() => '');
  return cssPromise;
}

/** Returns `svg` with the Inter faces inlined right after the root element. */
export async function withEmbeddedFonts(svg: string): Promise<string> {
  const css = await embeddedFontCss();
  if (!css) return svg;
  const rootEnd = svg.indexOf('>', svg.indexOf('<svg'));
  if (rootEnd < 0) return svg;
  return `${svg.slice(0, rootEnd + 1)}<style>${css}</style>${svg.slice(rootEnd + 1)}`;
}
