// ── Save board as .aerial ────────────────────────────────────────────────────

import { useState } from 'react';

const MIN_PASSWORD = 8;

export function SaveFileDialog({
  defaultName,
  saving,
  onSave,
  onClose,
}: {
  open?: boolean;
  defaultName: string;
  saving: boolean;
  onSave: (name: string, password?: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const tooShort = encrypt && password.length < MIN_PASSWORD;
  const mismatch = encrypt && confirm.length > 0 && confirm !== password;
  const valid = name.trim().length > 0 && (!encrypt || (!tooShort && confirm === password));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid && !saving) onSave(name.trim(), encrypt ? password : undefined);
  };

  return (
    <div className="ae-dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="ae-dialog ae-form" role="dialog" aria-modal="true" aria-labelledby="save-title" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 id="save-title">Save as .aerial file</h2>
        <p>One file with the whole board and its images. Open it in Aerial on any computer, or keep it as a backup.</p>

        <label className="ae-field">
          <span>File name</span>
          <input className="ae-input" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="ae-check">
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          <span>
            Protect with a password
            <small>AES-256 encryption. Without the password the file cannot be opened, by anyone.</small>
          </span>
        </label>

        {encrypt && (
          <>
            <label className="ae-field">
              <span>Password</span>
              <input className="ae-input" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              {password.length > 0 && tooShort && <small className="ae-field__error">Use at least {MIN_PASSWORD} characters.</small>}
            </label>
            <label className="ae-field">
              <span>Confirm password</span>
              <input className="ae-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {mismatch && <small className="ae-field__error">The passwords do not match.</small>}
            </label>
            <p className="ae-field__note">There is no way to recover a lost password.</p>
          </>
        )}

        <div className="ae-dialog__actions">
          <button type="button" className="ae-cta" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ae-cta ae-cta--primary" disabled={!valid || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
