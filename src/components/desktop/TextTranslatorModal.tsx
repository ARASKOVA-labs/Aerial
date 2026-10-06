// ── Text translator: translate a phrase and drop it on the canvas ─────────────
// Uses the MyMemory service, behind the one-time translation consent.

import { useEffect, useState } from 'react';
import { ensureConsent } from '../../lib/consent';
import { externalFetch } from '../../lib/net';
import { CloseIcon, TranslateIcon } from '../../ui/icons';

const LANGUAGES = [
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

const DEBOUNCE_MS = 450;
const MAX_CHARS = 500; // the free service's per-request limit

type Result = { state: 'idle' } | { state: 'busy' } | { state: 'done'; text: string } | { state: 'error'; message: string };

async function translate(text: string, from: string, to: string, signal: AbortSignal): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${from}|${to}`)}`;
  const res = await externalFetch(url, { signal });
  if (!res.ok) throw new Error(`The translation service answered ${res.status}.`);
  const data = await res.json();
  const out = data?.responseData?.translatedText;
  if (typeof out !== 'string' || !out) throw new Error('The translation service returned nothing.');
  return out;
}

export function TextTranslatorModal({ onClose, onInsertText }: { onClose: () => void; onInsertText: (text: string) => void }) {
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('en');
  const [to, setTo] = useState('ml');
  const [result, setResult] = useState<Result>({ state: 'idle' });

  useEffect(() => {
    const text = source.trim();
    if (!text || from === to) {
      setResult(text ? { state: 'done', text } : { state: 'idle' });
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      if (!(await ensureConsent('translation'))) {
        setResult({ state: 'error', message: 'Translation needs your permission to send this text to MyMemory.' });
        return;
      }
      setResult({ state: 'busy' });
      try {
        const out = await translate(text, from, to, AbortSignal.any([ctl.signal, AbortSignal.timeout(6000)]));
        setResult({ state: 'done', text: out });
      } catch (err) {
        if (ctl.signal.aborted) return;
        setResult({ state: 'error', message: err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Could not reach the translation service.' });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [source, from, to]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const output = result.state === 'done' ? result.text : '';
  const swap = () => {
    setFrom(to);
    setTo(from);
    if (output) setSource(output);
  };

  return (
    <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ae-dialog ae-translate" role="dialog" aria-modal="true" aria-labelledby="translate-title">
        <header className="ae-studio__head">
          <span className="ae-studio__icon" aria-hidden="true">
            <TranslateIcon />
          </span>
          <div className="ae-studio__title">
            <h2 id="translate-title">Translate text</h2>
            <p>Translate a phrase, then place it on the canvas.</p>
          </div>
          <button type="button" className="ae-btn ae-btn--plain" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="ae-translate__langs">
          <select className="ae-select" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="button" className="ae-btn" aria-label="Swap languages" title="Swap languages" onClick={swap}>
            ⇄
          </button>
          <select className="ae-select" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ae-translate__panes">
          <textarea
            className="ae-input ae-translate__text"
            autoFocus
            value={source}
            maxLength={MAX_CHARS}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Type or paste text…"
            aria-label="Text to translate"
          />
          <div className="ae-input ae-translate__text ae-translate__out" aria-live="polite">
            {result.state === 'busy' && <span className="ae-translate__muted">Translating…</span>}
            {result.state === 'error' && <span className="ae-translate__error">{result.message}</span>}
            {result.state === 'done' && output}
            {result.state === 'idle' && <span className="ae-translate__muted">The translation appears here.</span>}
          </div>
        </div>

        <footer className="ae-studio__foot">
          <p className="ae-studio__hint">
            {source.length}/{MAX_CHARS}
          </p>
          <div className="ae-dialog__actions">
            <button type="button" className="ae-cta" disabled={!output} onClick={() => void navigator.clipboard.writeText(output)}>
              Copy
            </button>
            <button
              type="button"
              className="ae-cta ae-cta--primary"
              disabled={!output}
              onClick={() => {
                onInsertText(output.trim());
                onClose();
              }}
            >
              Insert on canvas
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
