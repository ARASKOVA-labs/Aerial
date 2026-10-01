import { useState, useEffect, useRef, useCallback } from 'react';
import { Code, Sparkles, X, Check, Copy, Bot } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import mermaid from 'mermaid';
import { getAraskovaMermaidConfig, applyAraskovaDiagramAesthetics, ARASKOVA_DIAGRAM_TEMPLATES, type AraskovaDiagramStyle } from '../../lib/diagram-theme';
import { sanitizeSvg } from '../../lib/sanitize';

const DIAGRAM_TEMPLATES = ARASKOVA_DIAGRAM_TEMPLATES;

export function DiagramStudioModal({
  isDarkMode,
  onClose,
  onInsertDiagram,
}: {
  isDarkMode: boolean;
  onClose: () => void;
  onInsertDiagram: (code: string, svg: string, scale?: number, accentColor?: string) => void;
}) {
  const [code, setCode] = useState(DIAGRAM_TEMPLATES[0].code);
  const [diagramStyle, setDiagramStyle] = useState<AraskovaDiagramStyle>(() =>
    isDarkMode ? 'brutalist' : 'industrial_light'
  );
  const [accentColor, setAccentColor] = useState('#e73f07');
  const [diagramScale, setDiagramScale] = useState(1.0);
  const [customTopic, setCustomTopic] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [svgOutput, setSvgOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Sync default aesthetic style when canvas theme toggles
  useEffect(() => {
    setDiagramStyle(isDarkMode ? 'brutalist' : 'industrial_light');
  }, [isDarkMode]);

  const renderCurrentDiagram = useCallback(
    async (srcCode: string, style: AraskovaDiagramStyle, accentCol: string) => {
      setIsRendering(true);
      setError(null);
      try {
        const trimmed = srcCode.trim();
        const effectiveDark =
          style === 'industrial_light' ? false : style === 'blueprint' ? true : isDarkMode;

        if (trimmed.startsWith('node ') || trimmed.startsWith('group ')) {
          // Aras DSL format
          try {
            const res = await invoke<{ svg: string }>('render_diagram', { code: trimmed });
            if (res?.svg) {
              const styledSvg = applyAraskovaDiagramAesthetics(res.svg, effectiveDark, style, accentCol);
              setSvgOutput(styledSvg);
              setIsRendering(false);
              return;
            }
          } catch {
            // If not running in Tauri or Aras DSL fails, fall back to mermaid
          }
        }

        // Reset mermaid API configuration cache before re-initializing
        if ((mermaid as any).mermaidAPI?.reset) {
          try {
            (mermaid as any).mermaidAPI.reset();
          } catch (_) {}
        }

        // Initialize Mermaid with custom accent and Araskova design system configuration
        mermaid.initialize(getAraskovaMermaidConfig(effectiveDark, style, accentCol));
        const id = 'mermaid-preview-' + Math.random().toString(36).substring(2, 9);
        const { svg } = await mermaid.render(id, trimmed);
        const styledSvg = applyAraskovaDiagramAesthetics(svg, effectiveDark, style, accentCol);
        setSvgOutput(styledSvg);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setIsRendering(false);
      }
    },
    [isDarkMode]
  );

  useEffect(() => {
    renderCurrentDiagram(code, diagramStyle, accentColor);
  }, [code, diagramStyle, accentColor, renderCurrentDiagram]);

  const handleCopySvg = async () => {
    if (!svgOutput) return;
    try {
      await navigator.clipboard.writeText(svgOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyAiPrompt = async () => {
    const topic = customTopic.trim() || 'Software System Architecture & Microservices Event Stream';
    const promptText = `Generate a clean, valid Mermaid.js diagram for: ${topic}

Requirements:
1. Use standard Mermaid syntax (flowchart TD/LR, sequenceDiagram, stateDiagram-v2, or classDiagram).
2. Group related components into subgraphs with clear labels (e.g. subgraph INGESTION ["// Ingestion Cluster"]).
3. Use concise node descriptions and descriptive edge labels.
4. Output ONLY raw Mermaid code inside a \`\`\`mermaid code block without extra conversational filler so it can be pasted directly into Aerial Canvas.`;

    try {
      await navigator.clipboard.writeText(promptText);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch (_) {}
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/85 backdrop-blur-md pointer-events-auto animate-in fade-in duration-150 p-4">
      <div
        className={`${
          isDarkMode ? 'bg-[#111111] border-[#2a2a2a] text-[#f3f3f2]' : 'bg-[#ffffff] border-[#e5e5e5] text-[#0a0a0a]'
        } border rounded-3xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDarkMode ? 'border-[#2a2a2a] bg-[#0a0a0a]/80' : 'border-[#e5e5e5] bg-[#f8f9fa]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              style={{ borderColor: `${accentColor}50`, backgroundColor: `${accentColor}18`, color: accentColor }}
              className="w-10 h-10 rounded-2xl border flex items-center justify-center shadow-inner transition-colors"
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className={`text-sm font-sans font-black uppercase tracking-wider ${
                    isDarkMode ? 'text-[#f3f3f2]' : 'text-[#0a0a0a]'
                  }`}
                >
                  Architecture & Mermaid Studio
                </h2>
                <span
                  style={{ backgroundColor: `${accentColor}22`, borderColor: `${accentColor}44`, color: accentColor }}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-widest border transition-colors"
                >
                  Araskova Brutalist
                </span>
              </div>
              <p className="text-[10px] font-mono text-[#81868b] uppercase tracking-wider">
                Machinery vector aesthetics · Hardware HUD Reticles · Embedded Font Kerns
              </p>
            </div>
          </div>

          {/* Aesthetic Style Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#81868b] uppercase tracking-wider mr-1 hidden sm:inline">
              Aesthetic:
            </span>
            {(
              [
                { id: 'brutalist', label: 'Brutalist' },
                { id: 'blueprint', label: 'Blueprint' },
                { id: 'industrial_light', label: 'Industrial' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                onClick={() => setDiagramStyle(st.id)}
                style={diagramStyle === st.id ? { backgroundColor: accentColor } : {}}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  diagramStyle === st.id
                    ? 'text-white shadow-xs'
                    : isDarkMode
                    ? 'bg-[#1a1a1a] text-[#81868b] hover:text-[#f3f3f2] border border-[#2a2a2a]'
                    : 'bg-white text-[#555555] hover:text-[#000000] border border-[#d0d0d0]'
                }`}
              >
                {st.label}
              </button>
            ))}

            <button
              onClick={onClose}
              className={`ml-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isDarkMode ? 'hover:bg-[#2a2a2a] text-[#81868b] hover:text-[#f3f3f2]' : 'hover:bg-[#e9ecef] text-[#666666] hover:text-[#000000]'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* AI Prompt Assistant Banner */}
        <div
          className={`px-6 py-3 border-b flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${
            isDarkMode ? 'bg-[#151515] border-[#2a2a2a]' : 'bg-[#f4f5f7] border-[#e2e4e8]'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
            <div
              style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}18`, color: accentColor }}
              className="w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0"
            >
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--foreground)]">
                  AI Diagram Assistant
                </span>
                <span className="text-[9px] font-mono text-[#81868b] uppercase tracking-wider hidden md:inline">
                  ChatGPT · Claude · Gemini
                </span>
              </div>
              <p className="text-[10px] text-[#81868b] truncate">
                Copy prompt to ChatGPT or Claude to get exact syntax for whatever you desire, then paste it here to render instantly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. Payment Gateway with Webhooks..."
              className={`text-[11px] font-mono px-3 py-1.5 rounded-xl border outline-none focus:border-[#e73f07] transition-all w-48 sm:w-56 ${
                isDarkMode ? 'bg-[#0a0a0a] text-[#f3f3f2] border-[#2a2a2a]' : 'bg-white text-[#0a0a0a] border-[#d0d0d0]'
              }`}
            />
            <button
              type="button"
              onClick={handleCopyAiPrompt}
              style={!promptCopied ? { backgroundColor: accentColor } : {}}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                promptCopied
                  ? 'bg-green-600 text-white'
                  : 'hover:opacity-90 text-white active:translate-y-px'
              }`}
            >
              {promptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {promptCopied ? 'Copied Prompt!' : 'Copy AI Prompt'}
            </button>
          </div>
        </div>

        {/* Presets & Customization Bar */}
        <div
          className={`px-6 py-2.5 border-b flex items-center justify-between gap-4 overflow-x-auto scrollbar-none ${
            isDarkMode ? 'bg-[#0a0a0a]/50 border-[#2a2a2a]' : 'bg-[#f1f3f5] border-[#e5e5e5]'
          }`}
        >
          {/* Templates */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#81868b] font-bold whitespace-nowrap mr-1">
              Presets:
            </span>
            {DIAGRAM_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                onClick={() => setCode(tmpl.code)}
                style={code === tmpl.code ? { backgroundColor: accentColor } : {}}
                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                  code === tmpl.code
                    ? 'text-white shadow-xs'
                    : isDarkMode
                    ? 'bg-[#1a1a1a] text-[#81868b] hover:text-[#f3f3f2] border border-[#2a2a2a]'
                    : 'bg-white text-[#555555] hover:text-[#000000] border border-[#d0d0d0]'
                }`}
              >
                {tmpl.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Color Customizer */}
            <div className="flex items-center gap-1.5 pl-3 border-l border-[#2a2a2a] shrink-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#81868b] font-bold">
                Accent:
              </span>
              {[
                { color: '#e73f07', name: 'Araskova Orange' },
                { color: '#0ea5e9', name: 'Electric Cyan' },
                { color: '#10b981', name: 'Emerald Green' },
                { color: '#8b5cf6', name: 'Radiant Violet' },
                { color: '#f59e0b', name: 'Cyber Amber' },
                { color: '#ef4444', name: 'Crimson Red' },
                { color: '#f3f3f2', name: 'Crisp White' },
              ].map((swatch) => (
                <button
                  key={swatch.color}
                  type="button"
                  onClick={() => setAccentColor(swatch.color)}
                  title={swatch.name}
                  style={{ backgroundColor: swatch.color }}
                  className={`w-5 h-5 rounded-full border transition-all cursor-pointer shadow-xs ${
                    accentColor.toLowerCase() === swatch.color.toLowerCase()
                      ? 'border-white scale-110 ring-2 ring-white/40'
                      : 'border-white/20 hover:scale-105 active:scale-95'
                  }`}
                />
              ))}
              <label
                title="Custom Accent Color"
                className="relative w-5 h-5 rounded-full border border-white/30 flex items-center justify-center cursor-pointer overflow-hidden bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-500 hover:scale-105 transition-transform"
              >
                <input
                  type="color"
                  value={accentColor}
                  className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </label>
            </div>

            {/* Size Adjuster */}
            <div className="flex items-center gap-1.5 pl-3 border-l border-[#2a2a2a] shrink-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#81868b] font-bold">
                Size:
              </span>
              {[
                { label: '50%', value: 0.5 },
                { label: '75%', value: 0.75 },
                { label: '100%', value: 1.0 },
                { label: '125%', value: 1.25 },
                { label: '150%', value: 1.5 },
              ].map((sz) => (
                <button
                  key={sz.label}
                  type="button"
                  onClick={() => setDiagramScale(sz.value)}
                  style={diagramScale === sz.value ? { backgroundColor: accentColor } : {}}
                  className={`px-2 py-1 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    diagramScale === sz.value
                      ? 'text-white shadow-xs'
                      : isDarkMode
                      ? 'bg-[#1a1a1a] text-[#81868b] hover:text-[#f3f3f2] border border-[#2a2a2a]'
                      : 'bg-white text-[#555555] hover:text-[#000000] border border-[#d0d0d0]'
                  }`}
                >
                  {sz.label}
                </button>
              ))}
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={diagramScale}
                onChange={(e) => setDiagramScale(parseFloat(e.target.value))}
                className="w-16 cursor-pointer"
                style={{ accentColor }}
                title={`Scale: ${Math.round(diagramScale * 100)}%`}
              />
              <span className="text-[9px] font-mono text-[#81868b] min-w-[32px]">
                {Math.round(diagramScale * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Body (Editor + Preview) */}
        <div className={`flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x ${isDarkMode ? 'divide-[#2a2a2a]' : 'divide-[#e5e5e5]'}`}>
          {/* Editor Side */}
          <div className={`flex flex-col h-full ${isDarkMode ? 'bg-[#111111]' : 'bg-[#fafafa]'} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#81868b] flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" style={{ color: accentColor }} />
                Diagram Definition (Mermaid / Aras DSL)
              </span>
              <button
                onClick={() => renderCurrentDiagram(code, diagramStyle, accentColor)}
                disabled={isRendering}
                style={{ color: accentColor }}
                className="text-[10px] font-mono font-bold uppercase tracking-wider hover:underline cursor-pointer"
              >
                {isRendering ? 'Rendering...' : 'Re-render'}
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter Mermaid or Aras DSL code..."
              spellCheck={false}
              className={`flex-1 w-full font-mono text-xs p-3.5 rounded-2xl border outline-none transition-all resize-none shadow-inner ${
                isDarkMode ? 'bg-[#0a0a0a] text-[#f3f3f2] border-[#2a2a2a]' : 'bg-white text-[#0a0a0a] border-[#e5e5e5]'
              }`}
              style={{ borderColor: undefined }}
            />
            {error && (
              <div className="mt-2.5 p-2.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 font-mono text-[10px] leading-tight">
                <p className="font-bold uppercase tracking-wider mb-1">Syntax Error:</p>
                <p className="line-clamp-2">{error}</p>
              </div>
            )}
          </div>

          {/* Preview Side */}
          <div className={`flex flex-col h-full ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-[#f4f4f5]'} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#81868b]">
                Rendered Preview (Araskova Machinery Engine)
              </span>
              {svgOutput && (
                <button
                  onClick={handleCopySvg}
                  className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#81868b] hover:text-[#e73f07] flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied SVG' : 'Copy SVG'}
                </button>
              )}
            </div>
            <div
              ref={previewRef}
              className={`flex-1 w-full rounded-2xl border overflow-auto p-4 flex items-center justify-center min-h-[260px] relative ${
                isDarkMode ? 'border-[#2a2a2a] bg-[#111111]' : 'border-[#e5e5e5] bg-white'
              }`}
            >
              {/* Tactical Corner Marks on Preview Box */}
              <div className="absolute top-2 left-2 w-2 h-2 border-t-2 border-l-2 pointer-events-none" style={{ borderColor: `${accentColor}60` }} />
              <div className="absolute top-2 right-2 w-2 h-2 border-t-2 border-r-2 pointer-events-none" style={{ borderColor: `${accentColor}60` }} />
              <div className="absolute bottom-2 left-2 w-2 h-2 border-b-2 border-l-2 pointer-events-none" style={{ borderColor: `${accentColor}60` }} />
              <div className="absolute bottom-2 right-2 w-2 h-2 border-b-2 border-r-2 pointer-events-none" style={{ borderColor: `${accentColor}60` }} />

              {svgOutput ? (
                <div
                  className="w-full h-full flex items-center justify-center [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:h-auto transition-transform"
                  style={{ transform: `scale(${Math.min(1.2, diagramScale)})` }}
                  dangerouslySetInnerHTML={{ __html: sanitizeSvg(svgOutput) }}
                />
              ) : (
                <p className="text-xs font-mono text-[#81868b]">
                  {error ? 'Unable to render preview' : 'Enter valid diagram code to preview'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-4 border-t flex items-center justify-between ${
            isDarkMode ? 'border-[#2a2a2a] bg-[#0a0a0a]/80' : 'border-[#e5e5e5] bg-[#f8f9fa]'
          }`}
        >
          <div className="flex items-center gap-3 text-[10px] font-mono text-[#81868b]">
            <span className="hidden sm:inline">
              Embedded fonts & tactical vector reticles.
            </span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-[#f3f3f2]">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
              Scale: {Math.round(diagramScale * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                isDarkMode ? 'border-[#2a2a2a] text-[#f3f3f2] hover:bg-[#1a1a1a]' : 'border-[#e5e5e5] text-[#0a0a0a] hover:bg-[#e9ecef]'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (svgOutput) {
                  onInsertDiagram(code, svgOutput, diagramScale, accentColor);
                }
              }}
              disabled={!svgOutput || !!error}
              style={{ backgroundColor: accentColor }}
              className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-white disabled:opacity-40 transition-all shadow-md active:translate-y-px cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Insert onto Canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Text Translator Modal ──────────────────────────────────────────────────
