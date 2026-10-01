import { useState, useEffect, useCallback } from 'react';
import { Type, X, Languages, Check, Copy } from 'lucide-react';
import { ensureConsent } from '../../lib/consent';
import { externalFetch } from '../../lib/net';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'zh', name: 'Chinese (中文)' },
  { code: 'ar', name: 'Arabic (العربية)' },
  { code: 'ru', name: 'Russian' },
];

const PRESET_TRANSLATIONS: Record<string, Record<string, string>> = {
  'architecture diagram': {
    ml: 'വാസ്തുവിദ്യാ രേഖാചിത്രം',
    ta: 'கட்டடக்கலை வரைபடம்',
    hi: 'वास्तुकला आरेख',
    es: 'diagrama de arquitectura',
    fr: "diagramme d'architecture",
  },
  'deep tech': {
    ml: 'ഡീപ് ടെക്നോളജി',
    ta: 'ஆழமான தொழில்நுட்பம்',
    hi: 'डीप टेक',
    es: 'tecnología profunda',
  },
  'autonomous systems': {
    ml: 'സ്വയംഭരണ സംവിധാനങ്ങൾ',
    ta: 'தன்னாட்சி அமைப்புகள்',
    hi: 'स्वायत्त प्रणाली',
    es: 'sistemas autónomos',
  },
  'hardware acceleration': {
    ml: 'ഹാർഡ്‌വെയർ ആക്സിലറേഷൻ',
    ta: 'வன்பொருள் முடுக்கம்',
    hi: 'हार्डवेयर त्वरण',
    es: 'aceleración por hardware',
  },
};

export function TextTranslatorModal({
  onClose,
  onInsertText,
}: {
  onClose: () => void;
  onInsertText: (text: string) => void;
}) {
  const [sourceText, setSourceText] = useState('Aerial Spatial Whiteboard for Engineering');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('ml');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [copied, setCopied] = useState(false);

  const performTranslate = useCallback(async (text: string, from: string, to: string) => {
    if (!text.trim()) {
      setTranslatedText('');
      return;
    }

    // Check offline dictionary match
    const lower = text.trim().toLowerCase();
    if (PRESET_TRANSLATIONS[lower]?.[to]) {
      setTranslatedText(PRESET_TRANSLATIONS[lower][to]);
      return;
    }

    if (!ensureConsent('translation')) return;
    setIsTranslating(true);
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${from}|${to}`)}`;
      const res = await externalFetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data?.responseData?.translatedText) {
          setTranslatedText(data.responseData.translatedText);
          setIsTranslating(false);
          return;
        }
      }
      throw new Error('API unavailable');
    } catch {
      // Fallback: transliteration / formatted placeholder
      setTranslatedText(`[${to.toUpperCase()}] ${text}`);
    } finally {
      setIsTranslating(false);
    }
  }, []);

  useEffect(() => {
    performTranslate(sourceText, sourceLang, targetLang);
  }, [sourceText, sourceLang, targetLang, performTranslate]);

  const handleCopy = async () => {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-md pointer-events-auto animate-in fade-in duration-150">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--secondary)]/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#e73f07]/10 flex items-center justify-center text-[#e73f07]">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-sans font-black uppercase tracking-wider text-[var(--foreground)]">
                Aerial Multilingual Studio
              </h2>
              <p className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase tracking-wider">
                Translate canvas text across Malayalam, Tamil, Telugu, Hindi & Global Languages
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--accent)] transition-colors cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Language Selectors */}
        <div className="px-6 py-3 border-b border-[var(--border)] bg-[var(--secondary)]/20 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-1.5">
              From Language
            </label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="w-full bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-[var(--foreground)] outline-none focus:border-[#e73f07]"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-1.5">
              To Language
            </label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-[var(--foreground)] outline-none focus:border-[#e73f07]"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Input & Output */}
        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold mb-1.5">
              Source Text
            </label>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={3}
              placeholder="Enter text to translate..."
              className="w-full bg-[#0a0a0a] text-[var(--foreground)] font-sans text-sm p-3.5 rounded-2xl border border-[var(--border)] outline-none focus:border-[#e73f07] transition-all resize-none shadow-inner"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] font-bold">
                Translated Result
              </label>
              <div className="flex items-center gap-2">
                {isTranslating && (
                  <span className="text-[10px] font-mono text-[#e73f07] animate-pulse">Translating...</span>
                )}
                {translatedText && (
                  <button
                    onClick={handleCopy}
                    className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={translatedText}
              onChange={(e) => setTranslatedText(e.target.value)}
              rows={3}
              placeholder="Translation will appear here..."
              className="w-full bg-[#111111] text-[var(--foreground)] font-sans text-sm p-3.5 rounded-2xl border border-[var(--border)] outline-none focus:border-[#e73f07] transition-all resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--secondary)]/30 flex items-center justify-between">
          <p className="text-[10px] font-mono text-[var(--muted-foreground)]">
            Ready to insert onto active canvas.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (translatedText.trim()) {
                  onInsertText(translatedText.trim());
                }
              }}
              disabled={!translatedText.trim() || isTranslating}
              className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-[#e73f07] hover:bg-[#d03806] text-white disabled:opacity-40 transition-all shadow-md shadow-[#e73f07]/20 active:translate-y-px cursor-pointer flex items-center gap-2"
            >
              <Type className="w-3.5 h-3.5" />
              Insert as Text
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
