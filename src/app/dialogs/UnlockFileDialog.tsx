// ── Password prompt for an encrypted .aerial file ────────────────────────────

import { useState } from 'react';
import type { LockedFile } from '../useAerialFiles';

export function UnlockFileDialog({ file, onUnlock, onClose }: { file: LockedFile; onUnlock: (password: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    await onUnlock(password);
    setBusy(false);
    setPassword('');
  };

  return (
    <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ae-dialog ae-form" role="dialog" aria-modal="true" aria-labelledby="unlock-title" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 id="unlock-title">“{file.name}” is protected</h2>
        <p>Enter the password it was saved with.</p>
        <label className="ae-field">
          <span>Password</span>
          <input className="ae-input" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          {file.error && <small className="ae-field__error">{file.error}</small>}
        </label>
        <div className="ae-dialog__actions">
          <button type="button" className="ae-cta" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ae-cta ae-cta--primary" disabled={!password || busy}>
            {busy ? 'Unlocking…' : 'Open'}
          </button>
        </div>
      </form>
    </div>
  );
}
