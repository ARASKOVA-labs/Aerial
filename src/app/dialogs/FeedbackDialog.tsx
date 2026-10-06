// ── Feedback: opens a pre-filled GitHub issue ────────────────────────────────
// Aerial has no feedback server, so nothing is "sent" from inside the app; the
// text goes into a GitHub issue the user reviews and submits themselves.

import { useState } from 'react';

const ISSUES = 'https://github.com/ARASKOVA-labs/Aerial/issues/new';

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '';
  const href = `${ISSUES}?title=${encodeURIComponent(text.split('\n')[0].slice(0, 80) || 'Feedback')}&body=${encodeURIComponent(`${text}\n\n---\nAerial ${version} · ${navigator.platform}`)}`;

  return (
    <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ae-dialog ae-form" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 id="feedback-title">Send feedback</h2>
        <p>Found a bug or have an idea? Describe it and we will open a GitHub issue for you to review and post.</p>
        <textarea className="ae-input" rows={5} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened? What did you expect?" style={{ resize: 'vertical' }} />
        <div className="ae-dialog__actions">
          <button type="button" className="ae-cta" onClick={onClose}>
            Cancel
          </button>
          <a className={`ae-cta ae-cta--primary${text.trim() ? '' : ' ae-cta--disabled'}`} href={text.trim() ? href : undefined} target="_blank" rel="noreferrer" onClick={() => text.trim() && onClose()}>
            Continue on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
