// ── Diagram studio: Mermaid / Aras DSL → themed SVG on the canvas ────────────

import { useEffect, useRef, useState } from 'react';
import { ARASKOVA_DIAGRAM_TEMPLATES, type AraskovaDiagramStyle } from '../../lib/diagram-theme';
import { renderDiagram } from '../../lib/diagram-render';
import { svgObjectUrl } from '../../lib/svg-image';
import { CloseIcon, DiagramIcon } from '../../ui/icons';

const STYLES: { id: AraskovaDiagramStyle; label: string }[] = [
  { id: 'industrial_light', label: 'Light' },
  { id: 'brutalist', label: 'Dark' },
  { id: 'blueprint', label: 'Blueprint' },
];

const ACCENTS = [
  { color: '#e73f07', name: 'Araskova orange' },
  { color: '#0ea5e9', name: 'Cyan' },
  { color: '#10b981', name: 'Green' },
  { color: '#f59e0b', name: 'Amber' },
  { color: '#ef4444', name: 'Red' },
];

const SIZES = [0.5, 0.75, 1, 1.25, 1.5];

/** Re-render after typing stops for this long. */
const DEBOUNCE_MS = 220;

export function DiagramStudioModal({
  isDarkMode,
  onClose,
  onInsertDiagram,
}: {
  isDarkMode: boolean;
  onClose: () => void;
  onInsertDiagram: (code: string, svg: string, scale?: number, accentColor?: string) => void;
}) {
  const [code, setCode] = useState(ARASKOVA_DIAGRAM_TEMPLATES[0].code);
  const [style, setStyle] = useState<AraskovaDiagramStyle>(isDarkMode ? 'brutalist' : 'industrial_light');
  const [accent, setAccent] = useState('#e73f07');
  const [scale, setScale] = useState(1);
  const [svg, setSvg] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  useEffect(() => setStyle(isDarkMode ? 'brutalist' : 'industrial_light'), [isDarkMode]);

  // Render (debounced); a newer run supersedes an older one still in flight.
  useEffect(() => {
    const id = ++run.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const out = await renderDiagram(code, style, accent, isDarkMode);
        if (id !== run.current) return;
        setSvg(out);
        setError(null);
      } catch (err) {
        if (id !== run.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (id === run.current) setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [code, style, accent, isDarkMode]);

  // Preview through <img>: identical to how the canvas draws the diagram.
  useEffect(() => {
    if (!svg) return;
    let url = '';
    let live = true;
    void svgObjectUrl(svg).then((u) => {
      if (live) setPreviewUrl((url = u));
      else URL.revokeObjectURL(u);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [svg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && svg && !error) onInsertDiagram(code, svg, scale, accent);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onInsertDiagram, code, svg, error, scale, accent]);

  const template = ARASKOVA_DIAGRAM_TEMPLATES.find((t) => t.code === code)?.id ?? '';

  return (
    <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ae-dialog ae-studio" role="dialog" aria-modal="true" aria-labelledby="studio-title">
        <header className="ae-studio__head">
          <span className="ae-studio__icon" aria-hidden="true">
            <DiagramIcon />
          </span>
          <div className="ae-studio__title">
            <h2 id="studio-title">Diagram from text</h2>
            <p>Mermaid or Aras DSL. The preview is exactly what goes on the canvas.</p>
          </div>
          <button type="button" className="ae-btn ae-btn--plain" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="ae-studio__bar">
          <label className="ae-studio__field">
            <span>Template</span>
            <select
              className="ae-select"
              value={template}
              onChange={(e) => {
                const t = ARASKOVA_DIAGRAM_TEMPLATES.find((x) => x.id === e.target.value);
                if (t) setCode(t.code);
              }}
            >
              {template === '' && <option value="">Custom</option>}
              {ARASKOVA_DIAGRAM_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <div className="ae-studio__field">
            <span>Style</span>
            <div className="ae-options" role="radiogroup" aria-label="Diagram style">
              {STYLES.map((s) => (
                <button key={s.id} type="button" role="radio" className="ae-opt ae-opt--text" aria-checked={style === s.id} aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ae-studio__field">
            <span>Accent</span>
            <div className="ae-swatches" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map((a) => (
                <button
                  key={a.color}
                  type="button"
                  role="radio"
                  className="ae-swatch"
                  aria-checked={accent === a.color}
                  aria-pressed={accent === a.color}
                  aria-label={a.name}
                  title={a.name}
                  style={{ background: a.color }}
                  onClick={() => setAccent(a.color)}
                />
              ))}
            </div>
          </div>

          <label className="ae-studio__field">
            <span>Size</span>
            <select className="ae-select" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))}>
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {Math.round(s * 100)}%
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ae-studio__body">
          <textarea
            className="ae-studio__code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            aria-label="Diagram source"
            placeholder={'graph TD\n  A[Start] --> B[Finish]'}
          />
          <div className="ae-studio__preview" data-style={style} aria-busy={busy}>
            {previewUrl && !error ? (
              <img src={previewUrl} alt="Diagram preview" draggable={false} />
            ) : (
              <p className="ae-studio__empty">{error ? 'Fix the error below to see the preview.' : 'Rendering…'}</p>
            )}
          </div>
        </div>

        <footer className="ae-studio__foot">
          <p className={error ? 'ae-studio__error' : 'ae-studio__hint'} role={error ? 'alert' : undefined}>
            {error ?? `${busy ? 'Rendering…' : 'Ready'} · ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}Enter to insert`}
          </p>
          <div className="ae-dialog__actions">
            <button type="button" className="ae-cta" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="ae-cta ae-cta--primary" disabled={!svg || !!error} onClick={() => onInsertDiagram(code, svg, scale, accent)}>
              Insert diagram
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
